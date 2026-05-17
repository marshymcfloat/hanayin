-- Customer self-serve audit fields. Track when a booking was cancelled
-- or rescheduled by the customer themselves (via the tokenized manage
-- page), separate from staff-initiated changes.
ALTER TABLE "Booking"
  ADD COLUMN "cancelled_by_customer" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "rescheduled_at" TIMESTAMP(3),
  ADD COLUMN "reschedule_count" INTEGER NOT NULL DEFAULT 0;
