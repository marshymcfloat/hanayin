-- CreateEnum
CREATE TYPE "BookingEntryMode" AS ENUM ('APPOINTMENT', 'WALK_IN', 'FOLLOW_UP_ADDON');

-- AlterTable
ALTER TABLE "Booking"
ADD COLUMN "entry_mode" "BookingEntryMode" NOT NULL DEFAULT 'APPOINTMENT',
ADD COLUMN "parent_booking_id" INTEGER;

-- AddForeignKey
ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_parent_booking_id_fkey"
FOREIGN KEY ("parent_booking_id") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Booking_parent_booking_id_idx" ON "Booking"("parent_booking_id");