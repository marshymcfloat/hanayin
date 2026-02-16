-- Make this migration resilient for fresh/shadow databases where growth tables
-- are created in a later migration.
ALTER TABLE IF EXISTS "BusinessGrowthSettings" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE IF EXISTS "Campaign" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE IF EXISTS "Opportunity" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE IF EXISTS "SeasonalCalendar" ALTER COLUMN "updated_at" DROP DEFAULT;
