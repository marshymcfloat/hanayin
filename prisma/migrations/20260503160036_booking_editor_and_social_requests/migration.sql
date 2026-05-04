-- CreateEnum
CREATE TYPE "BookingNoteVisibility" AS ENUM ('INTERNAL', 'CUSTOMER_VISIBLE');

-- CreateEnum
CREATE TYPE "SocialPostRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StaffPermission" ADD VALUE 'BOOKING_MODIFY';
ALTER TYPE "StaffPermission" ADD VALUE 'BOOKING_MARK_NO_SHOW';
ALTER TYPE "StaffPermission" ADD VALUE 'BOOKING_ADJUST_PRICE';
ALTER TYPE "StaffPermission" ADD VALUE 'BOOKING_CANCEL';
ALTER TYPE "StaffPermission" ADD VALUE 'SOCIAL_POST_REQUEST_CREATE';
ALTER TYPE "StaffPermission" ADD VALUE 'SOCIAL_POST_REVIEW';
ALTER TYPE "StaffPermission" ADD VALUE 'SOCIAL_POST_PUBLISH';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancellation_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_by_id" TEXT;

-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "permissions" SET DEFAULT ARRAY['BOOKING_CREATE', 'PAYMENT_COLLECT', 'QUEUE_CLAIM_SELF', 'QUEUE_SERVE_SELF', 'SOCIAL_POST_REQUEST_CREATE']::"StaffPermission"[];

-- CreateTable
CREATE TABLE "BookingNote" (
    "id" TEXT NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "BookingNoteVisibility" NOT NULL DEFAULT 'INTERNAL',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingPriceAdjustment" (
    "id" TEXT NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "availed_service_id" INTEGER,
    "delta_amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingPriceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPostRequest" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "brief" TEXT,
    "category" TEXT NOT NULL,
    "desired_tone" TEXT,
    "attachment_url" TEXT,
    "due_date" TIMESTAMP(3),
    "status" "SocialPostRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "social_post_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPostRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingNote_booking_id_created_at_idx" ON "BookingNote"("booking_id", "created_at");

-- CreateIndex
CREATE INDEX "BookingNote_created_by_user_id_idx" ON "BookingNote"("created_by_user_id");

-- CreateIndex
CREATE INDEX "BookingPriceAdjustment_booking_id_created_at_idx" ON "BookingPriceAdjustment"("booking_id", "created_at");

-- CreateIndex
CREATE INDEX "BookingPriceAdjustment_availed_service_id_idx" ON "BookingPriceAdjustment"("availed_service_id");

-- CreateIndex
CREATE INDEX "BookingPriceAdjustment_created_by_user_id_idx" ON "BookingPriceAdjustment"("created_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPostRequest_social_post_id_key" ON "SocialPostRequest"("social_post_id");

-- CreateIndex
CREATE INDEX "SocialPostRequest_business_id_status_created_at_idx" ON "SocialPostRequest"("business_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "SocialPostRequest_requested_by_user_id_idx" ON "SocialPostRequest"("requested_by_user_id");

-- CreateIndex
CREATE INDEX "SocialPostRequest_reviewed_by_user_id_idx" ON "SocialPostRequest"("reviewed_by_user_id");

-- CreateIndex
CREATE INDEX "Booking_cancelled_by_id_idx" ON "Booking"("cancelled_by_id");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingNote" ADD CONSTRAINT "BookingNote_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingNote" ADD CONSTRAINT "BookingNote_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPriceAdjustment" ADD CONSTRAINT "BookingPriceAdjustment_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPriceAdjustment" ADD CONSTRAINT "BookingPriceAdjustment_availed_service_id_fkey" FOREIGN KEY ("availed_service_id") REFERENCES "AvailedService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPriceAdjustment" ADD CONSTRAINT "BookingPriceAdjustment_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostRequest" ADD CONSTRAINT "SocialPostRequest_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostRequest" ADD CONSTRAINT "SocialPostRequest_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostRequest" ADD CONSTRAINT "SocialPostRequest_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostRequest" ADD CONSTRAINT "SocialPostRequest_social_post_id_fkey" FOREIGN KEY ("social_post_id") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
