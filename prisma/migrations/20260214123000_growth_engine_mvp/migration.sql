-- Growth Engine MVP (Server Actions first)

CREATE TYPE "BusinessType" AS ENUM ('SALON', 'SPA', 'CLINIC', 'BARBERSHOP');
CREATE TYPE "OpportunityType" AS ENUM ('SLOW_HOURS', 'PAYDAY_SPIKE', 'WEEKEND_PREP', 'HOLIDAY_SEASONAL', 'WEATHER_HOOK', 'ANNIVERSARY', 'WIN_BACK');
CREATE TYPE "OpportunityStatus" AS ENUM ('OPEN', 'DISMISSED', 'CONVERTED', 'EXPIRED');
CREATE TYPE "OfferType" AS ENUM ('FLASH_DEAL', 'BUNDLE', 'LIMITED_SLOTS', 'STUDENT_PROMO', 'PAYDAY_PROMO', 'SEASONAL_PROMO');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'READY', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "CampaignAssetType" AS ENUM ('CAPTION', 'IMAGE_PROMPT', 'CTA', 'OVERLAY_TEXT', 'HASHTAG_SET');
CREATE TYPE "CampaignEventType" AS ENUM ('POST_PUBLISHED', 'CLICK_RECORDED', 'DM_INQUIRY', 'BOOKING_ATTRIBUTED', 'PROMO_REDEEMED', 'MANUAL_FEEDBACK');

CREATE TABLE "BusinessGrowthSettings" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "business_type" "BusinessType" NOT NULL DEFAULT 'SALON',
  "max_discount_percent" DOUBLE PRECISION NOT NULL DEFAULT 20,
  "min_confidence_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
  "enable_student_promo" BOOLEAN NOT NULL DEFAULT false,
  "tone_profile" TEXT NOT NULL DEFAULT 'taglish-natural',
  "avoid_cheap_wording" BOOLEAN NOT NULL DEFAULT false,
  "blocked_topics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "weather_hooks_enabled" BOOLEAN NOT NULL DEFAULT false,
  "profit_floor_percent" DOUBLE PRECISION,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessGrowthSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrowthContextSnapshot" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "snapshot_date" TIMESTAMP(3) NOT NULL,
  "window_start" TIMESTAMP(3) NOT NULL,
  "window_end" TIMESTAMP(3) NOT NULL,
  "context_json" JSONB NOT NULL,
  "capacity_summary_json" JSONB NOT NULL,
  "demand_summary_json" JSONB,
  "weather_summary_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthContextSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Opportunity" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "snapshot_id" TEXT NOT NULL,
  "type" "OpportunityType" NOT NULL,
  "status" "OpportunityStatus" NOT NULL DEFAULT 'OPEN',
  "reason" TEXT NOT NULL,
  "time_window_start" TIMESTAMP(3) NOT NULL,
  "time_window_end" TIMESTAMP(3) NOT NULL,
  "urgency_score" DOUBLE PRECISION NOT NULL,
  "impact_score" DOUBLE PRECISION NOT NULL,
  "confidence_score" DOUBLE PRECISION NOT NULL,
  "feasibility_score" DOUBLE PRECISION NOT NULL,
  "total_score" DOUBLE PRECISION NOT NULL,
  "recommended_offer_types" "OfferType"[] NOT NULL DEFAULT ARRAY[]::"OfferType"[],
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Campaign" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "opportunity_id" TEXT NOT NULL,
  "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "offer_type" "OfferType" NOT NULL,
  "offer_json" JSONB NOT NULL,
  "schedule_json" JSONB NOT NULL,
  "risk_flags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "why_this_suggested" TEXT NOT NULL,
  "opportunity_snapshot" JSONB,
  "sale_event_id" INTEGER,
  "social_post_id" TEXT,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignAsset" (
  "id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "type" "CampaignAssetType" NOT NULL,
  "variant_label" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignEvent" (
  "id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "event_type" "CampaignEventType" NOT NULL,
  "value" DOUBLE PRECISION,
  "metadata" JSONB,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SeasonalCalendar" (
  "id" TEXT NOT NULL,
  "country_code" TEXT NOT NULL DEFAULT 'PH',
  "event_date" TIMESTAMP(3) NOT NULL,
  "event_name" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "payday_rule" TEXT,
  "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "metadata" JSONB,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeasonalCalendar_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessGrowthSettings_business_id_key" ON "BusinessGrowthSettings"("business_id");
CREATE INDEX "GrowthContextSnapshot_business_id_snapshot_date_created_at_idx" ON "GrowthContextSnapshot"("business_id", "snapshot_date", "created_at");
CREATE INDEX "Opportunity_business_id_status_total_score_idx" ON "Opportunity"("business_id", "status", "total_score");
CREATE INDEX "Opportunity_business_id_time_window_start_time_window_end_idx" ON "Opportunity"("business_id", "time_window_start", "time_window_end");
CREATE INDEX "Opportunity_snapshot_id_idx" ON "Opportunity"("snapshot_id");
CREATE INDEX "Campaign_business_id_created_at_idx" ON "Campaign"("business_id", "created_at");
CREATE INDEX "Campaign_opportunity_id_idx" ON "Campaign"("opportunity_id");
CREATE INDEX "Campaign_sale_event_id_idx" ON "Campaign"("sale_event_id");
CREATE INDEX "Campaign_social_post_id_idx" ON "Campaign"("social_post_id");
CREATE INDEX "CampaignAsset_campaign_id_type_idx" ON "CampaignAsset"("campaign_id", "type");
CREATE INDEX "CampaignEvent_campaign_id_event_type_occurred_at_idx" ON "CampaignEvent"("campaign_id", "event_type", "occurred_at");
CREATE INDEX "SeasonalCalendar_country_code_event_date_is_active_idx" ON "SeasonalCalendar"("country_code", "event_date", "is_active");
CREATE INDEX "SeasonalCalendar_event_type_event_date_idx" ON "SeasonalCalendar"("event_type", "event_date");

ALTER TABLE "BusinessGrowthSettings"
  ADD CONSTRAINT "BusinessGrowthSettings_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GrowthContextSnapshot"
  ADD CONSTRAINT "GrowthContextSnapshot_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Opportunity"
  ADD CONSTRAINT "Opportunity_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Opportunity"
  ADD CONSTRAINT "Opportunity_snapshot_id_fkey"
  FOREIGN KEY ("snapshot_id") REFERENCES "GrowthContextSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Campaign"
  ADD CONSTRAINT "Campaign_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Campaign"
  ADD CONSTRAINT "Campaign_opportunity_id_fkey"
  FOREIGN KEY ("opportunity_id") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Campaign"
  ADD CONSTRAINT "Campaign_sale_event_id_fkey"
  FOREIGN KEY ("sale_event_id") REFERENCES "SaleEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Campaign"
  ADD CONSTRAINT "Campaign_social_post_id_fkey"
  FOREIGN KEY ("social_post_id") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Campaign"
  ADD CONSTRAINT "Campaign_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CampaignAsset"
  ADD CONSTRAINT "CampaignAsset_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignEvent"
  ADD CONSTRAINT "CampaignEvent_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

