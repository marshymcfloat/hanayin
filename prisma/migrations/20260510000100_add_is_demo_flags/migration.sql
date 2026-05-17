-- Adds is_demo flag to Service / Customer / Employee / Booking. Lets the
-- platform-admin demo-data seeder mark sample rows so a trial owner can wipe
-- them in one click before going live.

ALTER TABLE "Service" ADD COLUMN "is_demo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN "is_demo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Employee" ADD COLUMN "is_demo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Booking" ADD COLUMN "is_demo" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Service_business_id_is_demo_idx" ON "Service"("business_id", "is_demo");
CREATE INDEX "Customer_business_id_is_demo_idx" ON "Customer"("business_id", "is_demo");
CREATE INDEX "Employee_business_id_is_demo_idx" ON "Employee"("business_id", "is_demo");
CREATE INDEX "Booking_business_id_is_demo_idx" ON "Booking"("business_id", "is_demo");
