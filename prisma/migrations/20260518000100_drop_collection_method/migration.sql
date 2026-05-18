-- Drop the remaining PayMongo-era infrastructure on
-- BusinessSubscription. After PR #10 (decommission_paymongo) these
-- two columns + the CollectionMethod enum became dead state -- the
-- only path is manual collection, and the owner billing UI showed
-- "COLLECTION: MANUAL_CHECKOUT / Recurring disabled" which was
-- meaningless noise.

ALTER TABLE "BusinessSubscription"
  DROP COLUMN IF EXISTS "collection_method",
  DROP COLUMN IF EXISTS "recurring_enabled";

DROP TYPE IF EXISTS "CollectionMethod";
