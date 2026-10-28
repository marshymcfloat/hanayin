-- Additive only. Prepare locally; apply only through the verified disposable or
-- separately authorized release workflow. Publishing connections are untouched.
CREATE TYPE "CustomerMessagingMode" AS ENUM ('OFF', 'SUGGEST', 'AUTO');
CREATE TYPE "CustomerMessagingLanguage" AS ENUM ('EN', 'FIL', 'TAGLISH', 'UNKNOWN');
CREATE TYPE "CustomerMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "CustomerMessagingJobStatus" AS ENUM ('PENDING', 'CLAIMED', 'SUGGESTED', 'SENDING', 'CONFIRMED', 'FAILED', 'UNKNOWN', 'CANCELLED');

CREATE TABLE "MessengerChannel" (
  "id" TEXT NOT NULL, "business_id" TEXT NOT NULL,
  "app_id" TEXT NOT NULL, "page_id" TEXT NOT NULL, "display_name" TEXT NOT NULL,
  "token_encrypted" TEXT NOT NULL, "token_expires_at" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 0, "active" BOOLEAN NOT NULL DEFAULT false,
  "verified_at" TIMESTAMP(3), "permissions_verified_at" TIMESTAMP(3),
  "pages_messaging_granted" BOOLEAN NOT NULL DEFAULT false,
  "facebook_login_verified" BOOLEAN NOT NULL DEFAULT false,
  "app_review_verified" BOOLEAN NOT NULL DEFAULT false,
  "business_verified" BOOLEAN NOT NULL DEFAULT false,
  "page_message_task" BOOLEAN NOT NULL DEFAULT false,
  "webhook_subscribed" BOOLEAN NOT NULL DEFAULT false,
  "echoes_verified" BOOLEAN NOT NULL DEFAULT false,
  "metadata_echo_verified" BOOLEAN NOT NULL DEFAULT false,
  "pilot_approved" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessengerChannel_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CustomerMessagingSettings" (
  "business_id" TEXT NOT NULL,
  "mode" "CustomerMessagingMode" NOT NULL DEFAULT 'OFF',
  "consent" BOOLEAN NOT NULL DEFAULT false, "ai_consent" BOOLEAN NOT NULL DEFAULT false,
  "consenting_user_id" TEXT,
  "paused" BOOLEAN NOT NULL DEFAULT false,
  "default_language" "CustomerMessagingLanguage" NOT NULL DEFAULT 'FIL',
  "revision" INTEGER NOT NULL DEFAULT 0, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerMessagingSettings_pkey" PRIMARY KEY ("business_id"),
  CONSTRAINT "CustomerMessagingSettings_consent_check" CHECK ("mode" = 'OFF' OR "consent"),
  CONSTRAINT "CustomerMessagingSettings_language_check" CHECK ("default_language" <> 'UNKNOWN')
);
CREATE TABLE "CustomerConversation" (
  "id" TEXT NOT NULL, "business_id" TEXT NOT NULL, "channel_id" TEXT NOT NULL,
  "recipient_hash" TEXT NOT NULL, "recipient_encrypted" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "latest_inbound_at" TIMESTAMP(3), "latest_inbound_message_id" TEXT,
  "last_human_reply_at" TIMESTAMP(3), "last_activity_at" TIMESTAMP(3) NOT NULL,
  "takeover" BOOLEAN NOT NULL DEFAULT false, "opted_out" BOOLEAN NOT NULL DEFAULT false,
  "language_preference" "CustomerMessagingLanguage",
  "metadata_expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerConversation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CustomerMessage" (
  "id" TEXT NOT NULL, "business_id" TEXT NOT NULL, "conversation_id" TEXT NOT NULL,
  "provider_message_hash" TEXT NOT NULL, "direction" "CustomerMessageDirection" NOT NULL,
  "text_encrypted" TEXT, "text_expires_at" TIMESTAMP(3) NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL, "metadata_expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerMessage_retention_check" CHECK ("text_expires_at" <= "occurred_at" + INTERVAL '7 days' AND "metadata_expires_at" <= "occurred_at" + INTERVAL '30 days')
);
CREATE TABLE "CustomerMessagingReceipt" (
  "id" TEXT NOT NULL, "business_id" TEXT NOT NULL, "channel_id" TEXT NOT NULL,
  "event_hash" TEXT NOT NULL, "occurred_at" TIMESTAMP(3) NOT NULL,
  "metadata_expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerMessagingReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerMessagingReceipt_retention_check" CHECK ("metadata_expires_at" <= "occurred_at" + INTERVAL '30 days')
);
CREATE TABLE "CustomerMessagingSuppression" (
  "business_id" TEXT NOT NULL, "channel_id" TEXT NOT NULL, "recipient_hash" TEXT NOT NULL,
  CONSTRAINT "CustomerMessagingSuppression_pkey" PRIMARY KEY ("channel_id", "recipient_hash")
);
CREATE TABLE "CustomerMessagingJob" (
  "id" TEXT NOT NULL, "business_id" TEXT NOT NULL, "conversation_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL, "status" "CustomerMessagingJobStatus" NOT NULL DEFAULT 'PENDING',
  "due_at" TIMESTAMP(3) NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0,
  "origin_event_at" TIMESTAMP(3) NOT NULL,
  "lease_token" TEXT, "lease_expires_at" TIMESTAMP(3), "delivery_key" TEXT NOT NULL,
  "provider_message_hash" TEXT, "draft_encrypted" TEXT,
  "draft_language" "CustomerMessagingLanguage", "text_expires_at" TIMESTAMP(3) NOT NULL,
  "metadata_expires_at" TIMESTAMP(3) NOT NULL, "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerMessagingJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerMessagingJob_attempts_check" CHECK ("attempts" >= 0 AND "attempts" <= 3),
  CONSTRAINT "CustomerMessagingJob_retention_check" CHECK ("text_expires_at" <= "origin_event_at" + INTERVAL '7 days' AND "metadata_expires_at" <= "origin_event_at" + INTERVAL '30 days')
);

CREATE UNIQUE INDEX "MessengerChannel_app_id_page_id_key" ON "MessengerChannel"("app_id", "page_id");
CREATE UNIQUE INDEX "MessengerChannel_business_id_id_key" ON "MessengerChannel"("business_id", "id");
CREATE INDEX "MessengerChannel_business_id_active_idx" ON "MessengerChannel"("business_id", "active");
CREATE UNIQUE INDEX "CustomerConversation_business_id_id_key" ON "CustomerConversation"("business_id", "id");
CREATE UNIQUE INDEX "CustomerConversation_channel_id_recipient_hash_key" ON "CustomerConversation"("channel_id", "recipient_hash");
CREATE INDEX "CustomerConversation_business_id_last_activity_at_idx" ON "CustomerConversation"("business_id", "last_activity_at");
CREATE INDEX "CustomerConversation_metadata_expires_at_idx" ON "CustomerConversation"("metadata_expires_at");
CREATE UNIQUE INDEX "CustomerMessage_provider_message_hash_key" ON "CustomerMessage"("provider_message_hash");
CREATE INDEX "CustomerMessage_business_id_conversation_id_occurred_at_idx" ON "CustomerMessage"("business_id", "conversation_id", "occurred_at");
CREATE INDEX "CustomerMessage_text_expires_at_idx" ON "CustomerMessage"("text_expires_at");
CREATE INDEX "CustomerMessage_metadata_expires_at_idx" ON "CustomerMessage"("metadata_expires_at");
CREATE UNIQUE INDEX "CustomerMessagingReceipt_event_hash_key" ON "CustomerMessagingReceipt"("event_hash");
CREATE INDEX "CustomerMessagingReceipt_metadata_expires_at_idx" ON "CustomerMessagingReceipt"("metadata_expires_at");
CREATE UNIQUE INDEX "CustomerMessagingJob_delivery_key_key" ON "CustomerMessagingJob"("delivery_key");
CREATE UNIQUE INDEX "CustomerMessagingJob_provider_message_hash_key" ON "CustomerMessagingJob"("provider_message_hash");
CREATE UNIQUE INDEX "CustomerMessagingJob_business_id_conversation_id_revision_key" ON "CustomerMessagingJob"("business_id", "conversation_id", "revision");
CREATE INDEX "CustomerMessagingJob_status_due_at_idx" ON "CustomerMessagingJob"("status", "due_at");
CREATE INDEX "CustomerMessagingJob_status_lease_expires_at_idx" ON "CustomerMessagingJob"("status", "lease_expires_at");
CREATE INDEX "CustomerMessagingJob_text_expires_at_idx" ON "CustomerMessagingJob"("text_expires_at");
CREATE INDEX "CustomerMessagingJob_metadata_expires_at_idx" ON "CustomerMessagingJob"("metadata_expires_at");

ALTER TABLE "MessengerChannel" ADD CONSTRAINT "MessengerChannel_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerMessagingSettings" ADD CONSTRAINT "CustomerMessagingSettings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerConversation" ADD CONSTRAINT "CustomerConversation_business_id_channel_id_fkey" FOREIGN KEY ("business_id", "channel_id") REFERENCES "MessengerChannel"("business_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerMessage" ADD CONSTRAINT "CustomerMessage_business_id_conversation_id_fkey" FOREIGN KEY ("business_id", "conversation_id") REFERENCES "CustomerConversation"("business_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerMessagingReceipt" ADD CONSTRAINT "CustomerMessagingReceipt_business_id_channel_id_fkey" FOREIGN KEY ("business_id", "channel_id") REFERENCES "MessengerChannel"("business_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerMessagingSuppression" ADD CONSTRAINT "CustomerMessagingSuppression_business_id_channel_id_fkey" FOREIGN KEY ("business_id", "channel_id") REFERENCES "MessengerChannel"("business_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerMessagingJob" ADD CONSTRAINT "CustomerMessagingJob_business_id_conversation_id_fkey" FOREIGN KEY ("business_id", "conversation_id") REFERENCES "CustomerConversation"("business_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
