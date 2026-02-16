-- Add owner-estimated service cost for gross/net reporting
ALTER TABLE "Service"
ADD COLUMN "estimated_cost" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "AvailedService"
ADD COLUMN "estimated_cost" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Normalize growth table updated_at columns after growth tables are present.
ALTER TABLE IF EXISTS "BusinessGrowthSettings" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE IF EXISTS "Campaign" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE IF EXISTS "Opportunity" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE IF EXISTS "SeasonalCalendar" ALTER COLUMN "updated_at" DROP DEFAULT;
