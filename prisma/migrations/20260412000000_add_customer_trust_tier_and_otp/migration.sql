-- Add trust tier fields to Customer
ALTER TABLE "Customer" ADD COLUMN "trust_tier" TEXT NOT NULL DEFAULT 'NEW';
ALTER TABLE "Customer" ADD COLUMN "no_show_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN "last_no_show_at" TIMESTAMP(3);

-- Create index for trust tier queries
CREATE INDEX "Customer_business_id_trust_tier_idx" ON "Customer"("business_id", "trust_tier");

-- Create BookingOtpCode table
CREATE TABLE "BookingOtpCode" (
    "id" SERIAL NOT NULL,
    "phone" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "semaphore_message_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingOtpCode_pkey" PRIMARY KEY ("id")
);

-- FK to Business
ALTER TABLE "BookingOtpCode" ADD CONSTRAINT "BookingOtpCode_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "BookingOtpCode_phone_business_id_expires_at_idx" ON "BookingOtpCode"("phone", "business_id", "expires_at");
CREATE INDEX "BookingOtpCode_business_id_idx" ON "BookingOtpCode"("business_id");
