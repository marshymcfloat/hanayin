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

-- RenameIndex
ALTER INDEX "SubscriptionPlanUpgradeRequest_business_id_status_created_at_id" RENAME TO "SubscriptionPlanUpgradeRequest_business_id_status_created_a_idx";

-- RenameIndex
ALTER INDEX "SubscriptionPlanUpgradeRequest_business_subscription_id_created" RENAME TO "SubscriptionPlanUpgradeRequest_business_subscription_id_cre_idx";

-- RenameIndex
ALTER INDEX "SubscriptionPlanUpgradeRequest_requested_by_user_id_created_at_" RENAME TO "SubscriptionPlanUpgradeRequest_requested_by_user_id_created_idx";
