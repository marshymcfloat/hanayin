-- Migration: Replace QRPH with ONLINE payment method, drop paymongo columns.
--
-- Rewritten to be replay-safe inside a single transaction (no
-- prisma-disable-migration-transaction directive needed) AND idempotent
-- against a partial-state DB left by an earlier failed run. The
-- original approach added 'ONLINE' to the existing PaymentMethod enum
-- and then used it in UPDATEs in the same transaction, which
-- PostgreSQL rejects ("unsafe use of new value of enum type"). The
-- current approach creates a brand-new PaymentMethod_new enum with
-- both CASH and ONLINE from the start, then casts existing column
-- data through TEXT to the new type — mapping any QRPH row to ONLINE
-- in the process. The new 'ONLINE' value is therefore only ever used
-- as a value of the new enum, which has no commit constraint.

-- 0. Clean up any orphan PaymentMethod_new left behind by a previously
--    failed attempt (no-op on a clean shadow database).
DROP TYPE IF EXISTS "PaymentMethod_new";

-- 1. Create the new enum type with the final desired values.
CREATE TYPE "PaymentMethod_new" AS ENUM ('CASH', 'ONLINE');

-- 2. Booking.payment_method: drop default, retype with QRPH→ONLINE
--    mapping baked into the USING clause, restore default.
ALTER TABLE "Booking" ALTER COLUMN "payment_method" DROP DEFAULT;
ALTER TABLE "Booking"
  ALTER COLUMN "payment_method" TYPE "PaymentMethod_new"
  USING (
    CASE "payment_method"::text
      WHEN 'QRPH' THEN 'ONLINE'
      ELSE "payment_method"::text
    END
  )::"PaymentMethod_new";
ALTER TABLE "Booking" ALTER COLUMN "payment_method" SET DEFAULT 'CASH'::"PaymentMethod_new";

-- 3. Same for BookingPayment.payment_method.
ALTER TABLE "BookingPayment" ALTER COLUMN "payment_method" DROP DEFAULT;
ALTER TABLE "BookingPayment"
  ALTER COLUMN "payment_method" TYPE "PaymentMethod_new"
  USING (
    CASE "payment_method"::text
      WHEN 'QRPH' THEN 'ONLINE'
      ELSE "payment_method"::text
    END
  )::"PaymentMethod_new";
ALTER TABLE "BookingPayment" ALTER COLUMN "payment_method" SET DEFAULT 'CASH'::"PaymentMethod_new";

-- 4. Drop the old enum and rename the new one to take its place.
DROP TYPE "PaymentMethod";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";

-- 5. Drop legacy paymongo columns from Booking.
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "paymongo_checkout_session_id";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "paymongo_payment_intent_id";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "paymongo_payment_method_id";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "paymongo_payment_id";

-- 6. Drop legacy paymongo columns from BookingPayment.
ALTER TABLE "BookingPayment" DROP COLUMN IF EXISTS "paymongo_payment_intent_id";
ALTER TABLE "BookingPayment" DROP COLUMN IF EXISTS "paymongo_payment_method_id";
ALTER TABLE "BookingPayment" DROP COLUMN IF EXISTS "paymongo_payment_id";
