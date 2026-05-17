-- IANA timezone identifier driving display-time formatting on the
-- customer booking surface. Default 'Asia/Manila' preserves existing
-- behavior — every existing tenant sees no change. Server-side date
-- math (lib/date-utils.ts and friends) is still PH-locked; this column
-- is the storage shape that unblocks broader timezone awareness later.
ALTER TABLE "Business"
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila';
