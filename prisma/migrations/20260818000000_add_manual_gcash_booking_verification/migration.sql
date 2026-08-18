ALTER TABLE "Business"
  ADD COLUMN "gcash_account_name" TEXT,
  ADD COLUMN "gcash_mobile_number" TEXT,
  ADD COLUMN "gcash_qr_image_url" TEXT,
  ADD COLUMN "gcash_instructions" TEXT;

ALTER TYPE "StaffPermission" ADD VALUE IF NOT EXISTS 'PAYMENT_VERIFY';

ALTER TABLE "BookingPayment"
  ADD COLUMN "payer_name" TEXT,
  ADD COLUMN "provider_reference" TEXT,
  ADD COLUMN "submitted_at" TIMESTAMP(3),
  ADD COLUMN "verified_at" TIMESTAMP(3),
  ADD COLUMN "verified_by_user_id" TEXT,
  ADD COLUMN "rejection_reason" TEXT;

ALTER TABLE "BookingPayment"
  ADD CONSTRAINT "BookingPayment_verified_by_user_id_fkey"
  FOREIGN KEY ("verified_by_user_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "BookingPayment_status_submitted_at_expires_at_idx"
  ON "BookingPayment"("status", "submitted_at", "expires_at");
CREATE INDEX "BookingPayment_provider_reference_idx"
  ON "BookingPayment"("provider_reference");
