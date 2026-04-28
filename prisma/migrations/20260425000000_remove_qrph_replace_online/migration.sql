-- Migration: Replace QRPH with ONLINE payment method, drop paymongo columns
-- prisma-disable-migration-transaction

-- Step 1: Add ONLINE value to existing enum
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'ONLINE';

-- Step 2: Migrate all existing QRPH records to ONLINE
UPDATE "Booking" SET payment_method = 'ONLINE'::"PaymentMethod" WHERE payment_method = 'QRPH'::"PaymentMethod";
UPDATE "BookingPayment" SET payment_method = 'ONLINE'::"PaymentMethod" WHERE payment_method = 'QRPH'::"PaymentMethod";

-- Step 3: Recreate enum without QRPH
CREATE TYPE "PaymentMethod_new" AS ENUM ('CASH', 'ONLINE');

ALTER TABLE "Booking" ALTER COLUMN "payment_method" DROP DEFAULT;
ALTER TABLE "Booking" ALTER COLUMN "payment_method" TYPE "PaymentMethod_new" USING "payment_method"::text::"PaymentMethod_new";
ALTER TABLE "Booking" ALTER COLUMN "payment_method" SET DEFAULT 'CASH'::"PaymentMethod_new";

ALTER TABLE "BookingPayment" ALTER COLUMN "payment_method" DROP DEFAULT;
ALTER TABLE "BookingPayment" ALTER COLUMN "payment_method" TYPE "PaymentMethod_new" USING "payment_method"::text::"PaymentMethod_new";
ALTER TABLE "BookingPayment" ALTER COLUMN "payment_method" SET DEFAULT 'CASH'::"PaymentMethod_new";

DROP TYPE "PaymentMethod";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";

-- Step 4: Drop paymongo columns from Booking
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "paymongo_checkout_session_id";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "paymongo_payment_intent_id";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "paymongo_payment_method_id";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "paymongo_payment_id";

-- Step 5: Drop paymongo columns from BookingPayment
ALTER TABLE "BookingPayment" DROP COLUMN IF EXISTS "paymongo_payment_intent_id";
ALTER TABLE "BookingPayment" DROP COLUMN IF EXISTS "paymongo_payment_method_id";
ALTER TABLE "BookingPayment" DROP COLUMN IF EXISTS "paymongo_payment_id";
