-- Backfill any voucher codes that were stored with a mixed/lowercase
-- suffix into the canonical uppercase form. Pre-fix, owners could
-- create vouchers like "BF-summer2026" via hand-typed suffixes; the
-- booking-pricing snapshot uppercased on lookup and the row never
-- matched, breaking voucher redemption with a misleading
-- "Failed to create booking" toast. All read + write paths now
-- normalize via normalizeVoucherCode() in
-- lib/server actions/vouchers.ts. This brings legacy rows in line.

-- Only update rows whose code isn't already canonical. The unique
-- constraint on (code) means a collision after UPPER() would surface
-- as an error; in practice the alphabet guarantees the uppercase
-- variant is a distinct value, but we guard with a NOT EXISTS just in
-- case some operator created both "bf-foo" and "BF-FOO" manually --
-- prefer to log + skip than to crash the migration.
UPDATE "Voucher" v
SET "code" = UPPER(v."code")
WHERE v."code" <> UPPER(v."code")
  AND NOT EXISTS (
    SELECT 1 FROM "Voucher" v2
    WHERE v2."code" = UPPER(v."code") AND v2."id" <> v."id"
  );
