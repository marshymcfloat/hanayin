ALTER TABLE "Booking"
ADD COLUMN "confirmation_sms_attempted_at" TIMESTAMP(3),
ADD COLUMN "confirmation_sms_sent_at" TIMESTAMP(3),
ADD COLUMN "confirmation_sms_message_id" TEXT,
ADD COLUMN "confirmation_sms_last_error" TEXT;

ALTER TABLE "OutboxMessage" ADD COLUMN "dedupe_key" TEXT;

CREATE UNIQUE INDEX "OutboxMessage_dedupe_key_key"
ON "OutboxMessage"("dedupe_key");
