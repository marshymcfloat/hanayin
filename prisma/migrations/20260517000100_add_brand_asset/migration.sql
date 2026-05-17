-- Reusable brand-asset library per business. Powers logo
-- watermarks, hero photos, service thumbnails, employee avatars, and
-- AI image-generation reference photos from a single table.

CREATE TYPE "BrandAssetKind" AS ENUM (
  'LOGO',
  'HERO',
  'SERVICE',
  'EMPLOYEE',
  'REFERENCE'
);

CREATE TABLE "BrandAsset" (
  "id"                  TEXT NOT NULL,
  "business_id"         TEXT NOT NULL,
  "kind"                "BrandAssetKind" NOT NULL,
  "url"                 TEXT NOT NULL,
  "alt"                 TEXT,
  "storage_key"         TEXT,
  "service_id"          INTEGER,
  "employee_id"         INTEGER,
  "uploaded_by_user_id" TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BrandAsset_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BrandAsset"
  ADD CONSTRAINT "BrandAsset_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "Business"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BrandAsset"
  ADD CONSTRAINT "BrandAsset_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "Service"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BrandAsset"
  ADD CONSTRAINT "BrandAsset_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "Employee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BrandAsset"
  ADD CONSTRAINT "BrandAsset_uploaded_by_user_id_fkey"
  FOREIGN KEY ("uploaded_by_user_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "BrandAsset_business_id_kind_idx"
  ON "BrandAsset" ("business_id", "kind");

CREATE INDEX "BrandAsset_service_id_idx"
  ON "BrandAsset" ("service_id");

CREATE INDEX "BrandAsset_employee_id_idx"
  ON "BrandAsset" ("employee_id");
