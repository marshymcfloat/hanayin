/*
  Warnings:

  - You are about to drop the column `entry_mode` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the column `parent_booking_id` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the column `media_background_url` on the `SocialPost` table. All the data in the column will be lost.
  - You are about to drop the column `media_overlay_json` on the `SocialPost` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_parent_booking_id_fkey";

-- DropIndex
DROP INDEX "Booking_parent_booking_id_idx";

-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "entry_mode",
DROP COLUMN "parent_booking_id",
ADD COLUMN     "sale_event_id" INTEGER;

-- AlterTable
ALTER TABLE "SaleEvent" ADD COLUMN     "slot_limit" INTEGER;

-- AlterTable
ALTER TABLE "SocialPost" DROP COLUMN "media_background_url",
DROP COLUMN "media_overlay_json";

-- DropEnum
DROP TYPE "BookingEntryMode";

-- CreateIndex
CREATE INDEX "Booking_sale_event_id_status_idx" ON "Booking"("sale_event_id", "status");

-- RenameForeignKey
ALTER TABLE "SubscriptionPlanUpgradeRequest" RENAME CONSTRAINT "SPUR_business_id_fkey" TO "SubscriptionPlanUpgradeRequest_business_id_fkey";

-- RenameForeignKey
ALTER TABLE "SubscriptionPlanUpgradeRequest" RENAME CONSTRAINT "SPUR_business_subscription_id_fkey" TO "SubscriptionPlanUpgradeRequest_business_subscription_id_fkey";

-- RenameForeignKey
ALTER TABLE "SubscriptionPlanUpgradeRequest" RENAME CONSTRAINT "SPUR_current_plan_id_fkey" TO "SubscriptionPlanUpgradeRequest_current_plan_id_fkey";

-- RenameForeignKey
ALTER TABLE "SubscriptionPlanUpgradeRequest" RENAME CONSTRAINT "SPUR_requested_by_user_id_fkey" TO "SubscriptionPlanUpgradeRequest_requested_by_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "SubscriptionPlanUpgradeRequest" RENAME CONSTRAINT "SPUR_reviewed_by_user_id_fkey" TO "SubscriptionPlanUpgradeRequest_reviewed_by_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "SubscriptionPlanUpgradeRequest" RENAME CONSTRAINT "SPUR_target_plan_id_fkey" TO "SubscriptionPlanUpgradeRequest_target_plan_id_fkey";

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_sale_event_id_fkey" FOREIGN KEY ("sale_event_id") REFERENCES "SaleEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "SubscriptionPlanUpgradeRequest_business_id_status_created_at_id" RENAME TO "SubscriptionPlanUpgradeRequest_business_id_status_created_a_idx";

-- RenameIndex
ALTER INDEX "SubscriptionPlanUpgradeRequest_business_subscription_id_created" RENAME TO "SubscriptionPlanUpgradeRequest_business_subscription_id_cre_idx";

-- RenameIndex
ALTER INDEX "SubscriptionPlanUpgradeRequest_requested_by_user_id_created_at_" RENAME TO "SubscriptionPlanUpgradeRequest_requested_by_user_id_created_idx";
