-- Wave L1: Persist organic post category on SocialPost so the
-- regenerate-caption action can route to the correct rescue template
-- and the new K1 hashtag policy can apply per-category rules.
--
-- The column is nullable for backward compatibility with rows created
-- before this column existed (they will fall back to "GENERAL" at
-- read-time) and for sale-event posts where category isn't applicable.

ALTER TABLE "SocialPost" ADD COLUMN "category" TEXT;
