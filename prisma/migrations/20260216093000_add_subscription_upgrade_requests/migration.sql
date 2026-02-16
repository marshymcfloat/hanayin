-- CreateEnum
CREATE TYPE "SubscriptionUpgradeRequestStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'CANCELED'
);

-- CreateTable
CREATE TABLE "SubscriptionPlanUpgradeRequest" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "business_subscription_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "current_plan_id" TEXT NOT NULL,
    "target_plan_id" TEXT NOT NULL,
    "status" "SubscriptionUpgradeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "request_note" TEXT,
    "review_note" TEXT,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlanUpgradeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionPlanUpgradeRequest_business_id_status_created_at_idx"
ON "SubscriptionPlanUpgradeRequest"("business_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "SubscriptionPlanUpgradeRequest_business_subscription_id_created_at_idx"
ON "SubscriptionPlanUpgradeRequest"("business_subscription_id", "created_at");

-- CreateIndex
CREATE INDEX "SubscriptionPlanUpgradeRequest_status_created_at_idx"
ON "SubscriptionPlanUpgradeRequest"("status", "created_at");

-- CreateIndex
CREATE INDEX "SubscriptionPlanUpgradeRequest_requested_by_user_id_created_at_idx"
ON "SubscriptionPlanUpgradeRequest"("requested_by_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "SubscriptionPlanUpgradeRequest"
ADD CONSTRAINT "SPUR_business_id_fkey"
FOREIGN KEY ("business_id") REFERENCES "Business"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlanUpgradeRequest"
ADD CONSTRAINT "SPUR_business_subscription_id_fkey"
FOREIGN KEY ("business_subscription_id") REFERENCES "BusinessSubscription"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlanUpgradeRequest"
ADD CONSTRAINT "SPUR_requested_by_user_id_fkey"
FOREIGN KEY ("requested_by_user_id") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlanUpgradeRequest"
ADD CONSTRAINT "SPUR_current_plan_id_fkey"
FOREIGN KEY ("current_plan_id") REFERENCES "SubscriptionPlan"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlanUpgradeRequest"
ADD CONSTRAINT "SPUR_target_plan_id_fkey"
FOREIGN KEY ("target_plan_id") REFERENCES "SubscriptionPlan"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlanUpgradeRequest"
ADD CONSTRAINT "SPUR_reviewed_by_user_id_fkey"
FOREIGN KEY ("reviewed_by_user_id") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
