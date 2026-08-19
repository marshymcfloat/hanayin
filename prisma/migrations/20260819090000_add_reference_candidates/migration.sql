CREATE TYPE "ReferenceCandidateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "ReferenceCandidate" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_id" TEXT,
  "source_url" TEXT NOT NULL,
  "preview_url" TEXT,
  "creator_name" TEXT,
  "attribution" TEXT,
  "license_status" TEXT NOT NULL,
  "service_category" TEXT NOT NULL,
  "mood_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "quality_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "content_hash" TEXT,
  "link_only" BOOLEAN NOT NULL DEFAULT false,
  "status" "ReferenceCandidateStatus" NOT NULL DEFAULT 'PENDING',
  "approved_asset_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferenceCandidate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReferenceCandidate_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ReferenceCandidate_business_id_provider_source_url_key" ON "ReferenceCandidate"("business_id", "provider", "source_url");
CREATE INDEX "ReferenceCandidate_business_id_status_service_category_idx" ON "ReferenceCandidate"("business_id", "status", "service_category");
