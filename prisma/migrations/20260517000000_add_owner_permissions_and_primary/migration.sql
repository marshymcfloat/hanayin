-- Phase 1 of multi-owner support: per-owner capability set + a
-- canonical "primary" owner per business so the platform-admin
-- impersonation action can stop relying on owners[0].

-- 1) OwnerPermission enum --------------------------------------------------
CREATE TYPE "OwnerPermission" AS ENUM (
  'BILLING_VIEW',
  'BILLING_MANAGE',
  'REPORTS_VIEW_FULL',
  'REPORTS_VIEW_SALES_ONLY',
  'EMPLOYEES_MANAGE',
  'STAFF_MANAGE',
  'SETTINGS_MANAGE',
  'CATALOG_MANAGE',
  'PAYROLL_MANAGE'
);

-- 2) Owner.permissions ----------------------------------------------------
-- Defaults to full power so existing single-owner businesses keep all
-- capabilities without any data backfill. The default chosen here
-- excludes REPORTS_VIEW_SALES_ONLY because it's mutually-exclusive with
-- REPORTS_VIEW_FULL (sales-only is a restriction for co-owners; full
-- view is the default).
ALTER TABLE "Owner"
  ADD COLUMN "permissions" "OwnerPermission"[]
  NOT NULL
  DEFAULT ARRAY[
    'BILLING_VIEW',
    'BILLING_MANAGE',
    'REPORTS_VIEW_FULL',
    'EMPLOYEES_MANAGE',
    'STAFF_MANAGE',
    'SETTINGS_MANAGE',
    'CATALOG_MANAGE',
    'PAYROLL_MANAGE'
  ]::"OwnerPermission"[];

-- 3) Owner.is_primary -----------------------------------------------------
ALTER TABLE "Owner"
  ADD COLUMN "is_primary" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: for every business with at least one owner, mark the
-- earliest-id row as primary. Multi-owner businesses get exactly one
-- primary; single-owner businesses also get exactly one. Future
-- writes are governed by setPrimaryOwnerAction at the app layer.
UPDATE "Owner" o
SET "is_primary" = true
WHERE o."id" = (
  SELECT MIN("id") FROM "Owner" WHERE "business_id" = o."business_id"
);

-- 4) Index on (business_id, is_primary) for the impersonation lookup.
CREATE INDEX "Owner_business_id_is_primary_idx"
  ON "Owner" ("business_id", "is_primary");
