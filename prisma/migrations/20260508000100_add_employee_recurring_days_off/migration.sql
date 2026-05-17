-- Day-of-week values (0=Sunday … 6=Saturday) the employee never works.
-- Captures "Anna doesn't work Sundays" for shops without a formal shift
-- schedule. Empty array (default) preserves existing behavior — the
-- employee is presumed available every business-open day. Honored by
-- computeSlots() and validateSelectedEmployeeForServices() in
-- lib/services/booking-availability.ts for both same-day and advance
-- bookings.
ALTER TABLE "Employee"
  ADD COLUMN "recurring_days_off" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
