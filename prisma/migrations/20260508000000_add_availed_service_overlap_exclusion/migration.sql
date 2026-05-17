-- Prevents two AvailedService rows from overlapping in time for the same
-- service provider (employee or owner). Closes the residual race window
-- between getAvailableSlots() validation and the actual INSERT, since
-- Prisma re-validation does not lock employee rows.
--
-- Half-open '[)' range so back-to-back appointments (e.g. 9-10 and 10-11)
-- do not conflict. Partial-index WHERE excludes cancelled / unscheduled /
-- unassigned rows from the constraint.
--
-- Why `tsrange` (not `tstzrange`): Prisma's DateTime maps to Postgres
-- `timestamp` (without time zone). Building a `tstzrange` would require
-- an implicit cast to `timestamptz` whose result depends on the session
-- TimeZone setting, so the cast is not IMMUTABLE — Postgres rejects it
-- in an index expression (42P17). All booking writes use the same
-- timestamp domain, so `tsrange` overlap math is correct here.
--
-- Note: this is a raw SQL migration — Prisma cannot model EXCLUDE
-- constraints. The constraint must be reflected manually in
-- prisma/schema.prisma as a comment marker so future readers know it
-- exists. Application code in lib/services/booking.ts catches the
-- resulting 23P01 error and converts it to SLOT_JUST_TAKEN.
--
-- Pre-flight check (run before applying to production):
--   SELECT a.served_by_id, a.scheduled_at, a.estimated_end, b.id, b.scheduled_at, b.estimated_end
--   FROM "AvailedService" a
--   JOIN "AvailedService" b
--     ON a.served_by_id = b.served_by_id
--    AND a.id < b.id
--    AND tsrange(a.scheduled_at, a.estimated_end, '[)')
--      && tsrange(b.scheduled_at, b.estimated_end, '[)')
--   WHERE a.served_by_id IS NOT NULL
--     AND a.cancelled_at IS NULL AND b.cancelled_at IS NULL
--     AND a.status <> 'CANCELLED' AND b.status <> 'CANCELLED'
--     AND a.scheduled_at IS NOT NULL AND a.estimated_end IS NOT NULL
--     AND b.scheduled_at IS NOT NULL AND b.estimated_end IS NOT NULL;
-- Resolve any rows returned (cancel one, reschedule, or reassign) before
-- applying. Identical query for served_by_owner_id.

-- Required to mix btree equality (served_by_id) with gist range overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "AvailedService"
  ADD CONSTRAINT "AvailedService_employee_no_overlap_excl"
  EXCLUDE USING gist (
    "served_by_id" WITH =,
    tsrange("scheduled_at", "estimated_end", '[)') WITH &&
  )
  WHERE (
    "served_by_id" IS NOT NULL
    AND "scheduled_at" IS NOT NULL
    AND "estimated_end" IS NOT NULL
    AND "cancelled_at" IS NULL
    AND "status" <> 'CANCELLED'
  );

ALTER TABLE "AvailedService"
  ADD CONSTRAINT "AvailedService_owner_no_overlap_excl"
  EXCLUDE USING gist (
    "served_by_owner_id" WITH =,
    tsrange("scheduled_at", "estimated_end", '[)') WITH &&
  )
  WHERE (
    "served_by_owner_id" IS NOT NULL
    AND "scheduled_at" IS NOT NULL
    AND "estimated_end" IS NOT NULL
    AND "cancelled_at" IS NULL
    AND "status" <> 'CANCELLED'
  );
