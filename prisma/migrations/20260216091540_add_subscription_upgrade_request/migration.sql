-- Historical rename migration.
-- This migration can run before the table exists on fresh databases in this repo's
-- migration order, so every rename is guarded and becomes a no-op when missing.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SPUR_business_id_fkey') THEN
    ALTER TABLE "SubscriptionPlanUpgradeRequest"
      RENAME CONSTRAINT "SPUR_business_id_fkey"
      TO "SubscriptionPlanUpgradeRequest_business_id_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SPUR_business_subscription_id_fkey') THEN
    ALTER TABLE "SubscriptionPlanUpgradeRequest"
      RENAME CONSTRAINT "SPUR_business_subscription_id_fkey"
      TO "SubscriptionPlanUpgradeRequest_business_subscription_id_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SPUR_current_plan_id_fkey') THEN
    ALTER TABLE "SubscriptionPlanUpgradeRequest"
      RENAME CONSTRAINT "SPUR_current_plan_id_fkey"
      TO "SubscriptionPlanUpgradeRequest_current_plan_id_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SPUR_requested_by_user_id_fkey') THEN
    ALTER TABLE "SubscriptionPlanUpgradeRequest"
      RENAME CONSTRAINT "SPUR_requested_by_user_id_fkey"
      TO "SubscriptionPlanUpgradeRequest_requested_by_user_id_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SPUR_reviewed_by_user_id_fkey') THEN
    ALTER TABLE "SubscriptionPlanUpgradeRequest"
      RENAME CONSTRAINT "SPUR_reviewed_by_user_id_fkey"
      TO "SubscriptionPlanUpgradeRequest_reviewed_by_user_id_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SPUR_target_plan_id_fkey') THEN
    ALTER TABLE "SubscriptionPlanUpgradeRequest"
      RENAME CONSTRAINT "SPUR_target_plan_id_fkey"
      TO "SubscriptionPlanUpgradeRequest_target_plan_id_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('"SubscriptionPlanUpgradeRequest_business_id_status_created_at_id"') IS NOT NULL THEN
    ALTER INDEX "SubscriptionPlanUpgradeRequest_business_id_status_created_at_id"
      RENAME TO "SubscriptionPlanUpgradeRequest_business_id_status_created_a_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('"SubscriptionPlanUpgradeRequest_business_subscription_id_created"') IS NOT NULL THEN
    ALTER INDEX "SubscriptionPlanUpgradeRequest_business_subscription_id_created"
      RENAME TO "SubscriptionPlanUpgradeRequest_business_subscription_id_cre_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('"SubscriptionPlanUpgradeRequest_requested_by_user_id_created_at_"') IS NOT NULL THEN
    ALTER INDEX "SubscriptionPlanUpgradeRequest_requested_by_user_id_created_at_"
      RENAME TO "SubscriptionPlanUpgradeRequest_requested_by_user_id_created_idx";
  END IF;
END $$;
