ALTER TABLE "ServicePackage" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "choices" JSONB;
ALTER TABLE "SaleEvent" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "conditional_rule" JSONB;
ALTER TABLE "Booking" ADD COLUMN "request_key" TEXT, ADD COLUMN "request_scope" TEXT, ADD COLUMN "request_payload_hash" TEXT, ADD COLUMN "pricing_snapshot" JSONB;
CREATE UNIQUE INDEX "Booking_business_id_request_scope_request_key_key" ON "Booking"("business_id", "request_scope", "request_key");
ALTER TABLE "AvailedService" ADD COLUMN "selection_key" TEXT, ADD COLUMN "package_instance_id" TEXT, ADD COLUMN "package_choice_id" TEXT, ADD COLUMN "pricing_snapshot" JSONB;
CREATE TABLE "BookingOfferApplication" (
  "id" TEXT NOT NULL,
  "booking_id" INTEGER NOT NULL,
  "sale_event_id" INTEGER,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingOfferApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookingOfferApplication_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BookingOfferApplication_sale_event_id_fkey" FOREIGN KEY ("sale_event_id") REFERENCES "SaleEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BookingOfferApplication_booking_id_sale_event_id_key" ON "BookingOfferApplication"("booking_id", "sale_event_id");
CREATE INDEX "BookingOfferApplication_sale_event_id_idx" ON "BookingOfferApplication"("sale_event_id");
CREATE TABLE "BookingChangeCommand" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "booking_id" INTEGER NOT NULL REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "actor_id" TEXT NOT NULL,
  "request_key" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "BookingChangeCommand_booking_id_actor_id_request_key_key" ON "BookingChangeCommand"("booking_id", "actor_id", "request_key");
