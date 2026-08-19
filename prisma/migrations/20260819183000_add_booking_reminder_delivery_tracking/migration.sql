ALTER TABLE "Booking"
ADD COLUMN "reminder_sent_at" TIMESTAMP(3),
ADD COLUMN "reminder_message_id" TEXT,
ADD COLUMN "reminder_last_error" TEXT,
ADD COLUMN "reminder_attempts" INTEGER NOT NULL DEFAULT 0;
