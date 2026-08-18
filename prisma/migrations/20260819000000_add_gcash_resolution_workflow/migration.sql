ALTER TABLE "BookingPayment"
  ADD COLUMN "escalated_at" TIMESTAMP(3),
  ADD COLUMN "escalation_reason" TEXT,
  ADD COLUMN "follow_up_required_at" TIMESTAMP(3),
  ADD COLUMN "resolution_resolved_at" TIMESTAMP(3),
  ADD COLUMN "resolution_outcome" TEXT,
  ADD COLUMN "resolution_note" TEXT;

CREATE INDEX "BookingPayment_follow_up_required_at_resolution_resolved_at_idx"
  ON "BookingPayment"("follow_up_required_at", "resolution_resolved_at");
