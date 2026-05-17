-- Decommission PayMongo. The integration was never wired live:
--   - getBillingCollectionMode() returned MANUAL_ONLY hardcoded
--   - No webhook handler existed at app/api/
--   - createSubscriptionCheckoutAction / retryInvoiceCollectionAction
--     were stubs returning MANUAL_COLLECTION_MODE_ERROR
-- The manual-payment path (admin "Confirm Paid" + owner-submitted
-- payment reference in invoice metadata) is the only flow in
-- production. This migration drops the dead schema.

-- 1) SubscriptionPaymentMethod model: never populated.
DROP TABLE IF EXISTS "SubscriptionPaymentMethod";

-- 2) PayMongo columns on SubscriptionInvoice: never written to.
-- Drop indexes first (Postgres requires this even with CASCADE).
DROP INDEX IF EXISTS "SubscriptionInvoice_paymongo_checkout_session_id_key";
DROP INDEX IF EXISTS "SubscriptionInvoice_paymongo_payment_intent_id_key";

ALTER TABLE "SubscriptionInvoice"
  DROP COLUMN IF EXISTS "paymongo_checkout_session_id",
  DROP COLUMN IF EXISTS "paymongo_payment_intent_id",
  DROP COLUMN IF EXISTS "paymongo_payment_method_id",
  DROP COLUMN IF EXISTS "paymongo_payment_id";
