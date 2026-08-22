ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'GCASH';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CARD';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'BANK_TRANSFER';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'OTHER';

ALTER TABLE "BookingPayment"
ADD COLUMN "voided_at" TIMESTAMP(3),
ADD COLUMN "voided_by_user_id" TEXT,
ADD COLUMN "void_reason" TEXT,
ADD COLUMN "idempotency_key" TEXT;

ALTER TABLE "BookingPayment"
ADD CONSTRAINT "BookingPayment_voided_by_user_id_fkey"
FOREIGN KEY ("voided_by_user_id") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "BookingPayment_voided_by_user_id_voided_at_idx"
ON "BookingPayment"("voided_by_user_id", "voided_at");

CREATE UNIQUE INDEX "BookingPayment_idempotency_key_key"
ON "BookingPayment"("idempotency_key");

-- Regular service staff no longer inherit cashier powers. Owners can grant
-- PAYMENT_COLLECT again from the employee permissions screen when appropriate.
UPDATE "Employee"
SET "permissions" = array_remove("permissions", 'PAYMENT_COLLECT'::"StaffPermission")
WHERE "profile" = 'STAFF'::"StaffProfile"
  AND "permissions" @> ARRAY['PAYMENT_COLLECT'::"StaffPermission"];
