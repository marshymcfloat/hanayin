-- Allow Booking.customer_id to be nullable to support anonymous walk-ins.
-- When a booking is recorded without a tracked customer profile, customer_id
-- is null and is_anonymous_walk_in is true. Booking still counts in revenue
-- but is excluded from customer rankings, trust tier, and re-engagement.
ALTER TABLE "Booking" ALTER COLUMN "customer_id" DROP NOT NULL;

-- Anonymous walk-in flag and free-text label captured when staff record a
-- booking without collecting contact information.
ALTER TABLE "Booking" ADD COLUMN "is_anonymous_walk_in" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Booking" ADD COLUMN "customer_label" TEXT;

-- Index for fast filtering of anonymous bookings in reports.
CREATE INDEX "Booking_business_id_is_anonymous_walk_in_idx"
  ON "Booking"("business_id", "is_anonymous_walk_in");
