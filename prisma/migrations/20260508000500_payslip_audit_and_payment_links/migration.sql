-- Payroll integrity migration
--
-- Adds:
--   * Payslip.released_at                                — exact release timestamp (boundary for next period)
--   * EmployeeAttendance.paid_in_payslip_id              — FK lock so a row is paid at most once
--   * AvailedService.paid_in_payslip_id                  — FK lock so a service is paid at most once
--   * UNIQUE(EmployeeAttendance.employee_id, date)       — kills duplicate-day double-count bug
--   * UNIQUE(Payslip.employee_id, starting_date, end..)  — kills duplicate-period double-pay bug
--
-- Backfills paid_in_payslip_id for every existing PAID payslip using the legacy
-- date-bucket logic (gt starting_date, lte ending_date). After this migration,
-- subsequent payslips select rows by `paid_in_payslip_id IS NULL` (and eligibility
-- filters), so retroactive edits and refunds can no longer cause exactly-once to break.
--
-- IMPORTANT: this migration deduplicates pre-existing duplicates.
--   * Attendance: keeps row with smallest id per (employee_id, date).
--   * Payslip:    keeps row with largest id per (employee_id, starting_date, ending_date)
--                 — assumes the most recent record is the corrected one.
--   * Outputs NOTICEs with counts so you can review before running in production.

DO $$
DECLARE
  attendance_dups INT;
  payslip_dups INT;
BEGIN
  SELECT COALESCE(SUM(c - 1), 0) INTO attendance_dups
  FROM (SELECT COUNT(*) AS c FROM "EmployeeAttendance" GROUP BY employee_id, date HAVING COUNT(*) > 1) s;
  IF attendance_dups > 0 THEN
    RAISE NOTICE 'EmployeeAttendance: deduping % redundant row(s) (keeping smallest id per employee/date).', attendance_dups;
  END IF;

  SELECT COALESCE(SUM(c - 1), 0) INTO payslip_dups
  FROM (SELECT COUNT(*) AS c FROM "Payslip" GROUP BY employee_id, starting_date, ending_date HAVING COUNT(*) > 1) s;
  IF payslip_dups > 0 THEN
    RAISE NOTICE 'Payslip: deduping % redundant row(s) (keeping largest id per employee/period).', payslip_dups;
  END IF;
END $$;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY employee_id, date ORDER BY id ASC) AS rn
  FROM "EmployeeAttendance"
)
DELETE FROM "EmployeeAttendance" WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY employee_id, starting_date, ending_date ORDER BY id DESC) AS rn
  FROM "Payslip"
)
DELETE FROM "Payslip" WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Schema additions
ALTER TABLE "Payslip" ADD COLUMN "released_at" TIMESTAMP(3);
ALTER TABLE "EmployeeAttendance" ADD COLUMN "paid_in_payslip_id" INTEGER;
ALTER TABLE "AvailedService" ADD COLUMN "paid_in_payslip_id" INTEGER;

ALTER TABLE "EmployeeAttendance"
  ADD CONSTRAINT "EmployeeAttendance_paid_in_payslip_id_fkey"
  FOREIGN KEY ("paid_in_payslip_id") REFERENCES "Payslip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AvailedService"
  ADD CONSTRAINT "AvailedService_paid_in_payslip_id_fkey"
  FOREIGN KEY ("paid_in_payslip_id") REFERENCES "Payslip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "EmployeeAttendance_paid_in_payslip_id_idx"
  ON "EmployeeAttendance"("paid_in_payslip_id");
CREATE INDEX "AvailedService_paid_in_payslip_id_idx"
  ON "AvailedService"("paid_in_payslip_id");
CREATE INDEX "Payslip_employee_id_released_at_idx"
  ON "Payslip"("employee_id", "released_at");

-- 3. Drop the old non-unique (employee_id, date) index that the unique index supersedes.
DROP INDEX IF EXISTS "EmployeeAttendance_employee_id_date_idx";

-- 4. Backfill released_at for all existing PAID payslips (best-effort = ending_date).
UPDATE "Payslip" SET "released_at" = "ending_date" WHERE "status" = 'PAID' AND "released_at" IS NULL;

-- 5. Stamp attendance rows. For each row, attach to the EARLIEST PAID payslip whose
--    legacy date window covers it. Ranked so each row is claimed exactly once.
WITH ranked_attendance AS (
  SELECT
    a.id AS attendance_id,
    p.id AS payslip_id,
    ROW_NUMBER() OVER (
      PARTITION BY a.id
      ORDER BY p.ending_date ASC, p.id ASC
    ) AS rn
  FROM "EmployeeAttendance" a
  JOIN "Payslip" p
    ON p.employee_id = a.employee_id
   AND p.status = 'PAID'
  WHERE
    (
      a.status = 'PRESENT' AND (
        (a.time_in IS NOT NULL AND a.time_in >  p.starting_date AND a.time_in <= p.ending_date)
        OR
        (a.time_in IS NULL     AND a.date    >  p.starting_date AND a.date    <= p.ending_date)
      )
    )
    OR
    (
      a.status = 'LEAVE' AND a.is_paid_leave = TRUE
      AND a.date > p.starting_date AND a.date <= p.ending_date
    )
)
UPDATE "EmployeeAttendance" ea
SET paid_in_payslip_id = r.payslip_id
FROM ranked_attendance r
WHERE ea.id = r.attendance_id AND r.rn = 1;

-- 6. Stamp availed services analogously.
WITH ranked_services AS (
  SELECT
    s.id AS service_id,
    p.id AS payslip_id,
    ROW_NUMBER() OVER (
      PARTITION BY s.id
      ORDER BY p.ending_date ASC, p.id ASC
    ) AS rn
  FROM "AvailedService" s
  JOIN "Payslip" p
    ON p.employee_id = s.served_by_id
   AND p.status = 'PAID'
  WHERE
    s.status = 'COMPLETED'
    AND s.completed_at IS NOT NULL
    AND s.completed_at >  p.starting_date
    AND s.completed_at <= p.ending_date
)
UPDATE "AvailedService" av
SET paid_in_payslip_id = r.payslip_id
FROM ranked_services r
WHERE av.id = r.service_id AND r.rn = 1;

-- 7. Add the unique constraints LAST, after dedupe + backfill.
CREATE UNIQUE INDEX "EmployeeAttendance_employee_id_date_key"
  ON "EmployeeAttendance"("employee_id", "date");

CREATE UNIQUE INDEX "Payslip_employee_id_starting_date_ending_date_key"
  ON "Payslip"("employee_id", "starting_date", "ending_date");
