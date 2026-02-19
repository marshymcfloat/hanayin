-- AlterTable
ALTER TABLE "Booking"
ADD COLUMN "capacity_override_applied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "capacity_override_reason" TEXT,
ADD COLUMN "capacity_override_note" TEXT;
