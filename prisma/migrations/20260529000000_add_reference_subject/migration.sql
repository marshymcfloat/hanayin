-- Reference-image classification for the brand-asset library. Lets the
-- social-post image generator distinguish a PERSON reference (strict
-- identity preservation) from BRAND / PRODUCT / STYLE references (visual
-- direction only). Nullable: only meaningful for kind=REFERENCE rows, and
-- all existing rows stay valid without a backfill.

CREATE TYPE "ReferenceSubject" AS ENUM (
  'PERSON',
  'BRAND',
  'PRODUCT',
  'STYLE'
);

ALTER TABLE "BrandAsset"
  ADD COLUMN "reference_subject" "ReferenceSubject";
