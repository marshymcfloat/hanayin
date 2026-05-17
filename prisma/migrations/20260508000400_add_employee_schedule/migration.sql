-- Optional formal weekly shift model. Default OFF on every existing
-- tenant — preserves the recurring_days_off + business-hours behavior
-- they already rely on.
ALTER TABLE "Business"
  ADD COLUMN "formal_schedule_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Employee weekly schedule rows. Multiple rows per (employee_id,
-- day_of_week) are allowed for split shifts. Only honored by
-- computeSlots() when Business.formal_schedule_enabled = true AND
-- the employee has at least one schedule row.
CREATE TABLE "EmployeeSchedule" (
  "id"          SERIAL PRIMARY KEY,
  "employee_id" INTEGER NOT NULL,
  "day_of_week" INTEGER NOT NULL,
  "start_time"  TEXT NOT NULL,
  "end_time"    TEXT NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeSchedule_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "Employee"("id") ON DELETE CASCADE
);

CREATE INDEX "EmployeeSchedule_employee_id_day_of_week_idx"
  ON "EmployeeSchedule" ("employee_id", "day_of_week");
