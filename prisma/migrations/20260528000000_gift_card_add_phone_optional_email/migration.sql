-- Wave N4: add customer_phone and make customer_email optional on GiftCard.
-- Gift cards can now be delivered via SMS (phone) in addition to email. At
-- least one of {email, phone} is required by application logic; the DB allows
-- both NULL only to keep the migration cheap and to support legacy rows.

ALTER TABLE "GiftCard" ADD COLUMN "customer_phone" TEXT;
ALTER TABLE "GiftCard" ALTER COLUMN "customer_email" DROP NOT NULL;
