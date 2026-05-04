# Phase 1 Migration Runbook — Booking-Editor + Social-Post-Request Schema

**Status:** Ready to migrate.
**What changed:** `prisma/schema.prisma` and `lib/auth/staff-access.ts`.

This is a single Prisma migration that sets the foundation for both feature tracks. It is **purely additive** — no columns dropped, no enum values removed, no foreign-key direction changes. Rolling back is safe.

## 1. What's in the migration

### New `StaffPermission` enum values (7)

```
BOOKING_MODIFY
BOOKING_MARK_NO_SHOW
BOOKING_ADJUST_PRICE
BOOKING_CANCEL
SOCIAL_POST_REQUEST_CREATE
SOCIAL_POST_REVIEW
SOCIAL_POST_PUBLISH
```

### New enums (2)

```
BookingNoteVisibility    INTERNAL | CUSTOMER_VISIBLE
SocialPostRequestStatus  PENDING | APPROVED | REJECTED | CANCELLED
```

### New models (3)

- `BookingNote` — internal or customer-visible notes attached to a booking, with creator user FK.
- `BookingPriceAdjustment` — explicit, reasoned price deltas tied either to the booking as a whole or a specific `AvailedService` line.
- `SocialPostRequest` — staff-submitted custom-post requests, with PENDING/APPROVED/REJECTED/CANCELLED lifecycle and a unique link to the resulting `SocialPost`.

### `Booking` additions

```
cancelled_at        DateTime?
cancelled_by_id     String?      (FK → User, ON DELETE SET NULL)
cancellation_reason String?
notes               BookingNote[]
price_adjustments   BookingPriceAdjustment[]
```

Plus `@@index([cancelled_by_id])`.

### `User` back-relations (5 new arrays — no migration impact, just typed accessors)

```
cancelled_bookings
booking_notes_created
booking_price_adjustments_created
submitted_social_post_requests
reviewed_social_post_requests
```

### `SocialPost` back-relation

```
source_request SocialPostRequest? @relation("SocialPostFromRequest")
```

### `Business` back-relation

```
social_post_requests SocialPostRequest[]
```

### `Employee.permissions` default array

The schema-level default for new employee rows now includes
`SOCIAL_POST_REQUEST_CREATE`. Existing rows are not affected by this
change — the SQL backfill below brings them up to date.

## 2. Generate and apply the migration

```bash
npx prisma format
npx prisma migrate dev --name booking_editor_and_social_requests
```

Prisma will:

1. Diff the schema, write a `prisma/migrations/<timestamp>_booking_editor_and_social_requests/migration.sql`.
2. Apply it to your local DB.
3. Regenerate the Prisma client (so `StaffPermission.BOOKING_MODIFY` becomes a real value at runtime).

Expected migration size: ~120–180 lines of SQL (a handful of `ALTER TYPE ... ADD VALUE`, three `CREATE TABLE`, a few `CREATE INDEX`, two `CREATE TYPE` for the new enums, and the `Booking` `ADD COLUMN` set). No data migrations are emitted automatically — those are below.

## 3. Backfill existing employees with the new defaults

`sanitizeStaffPermissions` does **not** auto-append new defaults to rows
that already have a non-empty `permissions` array. So existing employees
need a one-shot SQL update to receive the new flags. Run this **after**
`prisma migrate dev` succeeds.

Add a hand-edited data step to the generated `migration.sql` (preferred
— keeps the change versioned and auditable) **or** run the same SQL
directly in psql. The statements are idempotent.

```sql
-- 3.1 Universal: every employee gets SOCIAL_POST_REQUEST_CREATE
UPDATE "Employee"
SET "permissions" = array_append("permissions", 'SOCIAL_POST_REQUEST_CREATE')
WHERE NOT ('SOCIAL_POST_REQUEST_CREATE' = ANY ("permissions"));

-- 3.2 Managers only: BOOKING_MODIFY, BOOKING_MARK_NO_SHOW,
--     BOOKING_ADJUST_PRICE, BOOKING_CANCEL, SOCIAL_POST_REVIEW.
UPDATE "Employee"
SET "permissions" = "permissions" || ARRAY[
  'BOOKING_MODIFY',
  'BOOKING_MARK_NO_SHOW',
  'BOOKING_ADJUST_PRICE',
  'BOOKING_CANCEL',
  'SOCIAL_POST_REVIEW'
]::"StaffPermission"[]
WHERE "profile" = 'MANAGER';

-- Strip duplicates introduced by re-running the script.
UPDATE "Employee"
SET "permissions" = (
  SELECT ARRAY(SELECT DISTINCT unnest("permissions"))
);
```

After running, verify with:

```sql
SELECT
  "profile",
  "permissions",
  COUNT(*) AS rows
FROM "Employee"
GROUP BY 1, 2
ORDER BY 1, 2;
```

The matrix in `docs/role-permissions-matrix.md` §3 and §4 is the source
of truth — every distinct row should be one of the rule-set arrays for
its profile.

## 4. Smoke test

```bash
npm run typecheck       # confirms generated Prisma types compile
npm run lint
npm run test            # runs Phase 0 primitives' tests against the new enum values
```

Phase 0 tests already cover `StaffPermission`-string round-trips through
`PermissionGate`, `usePermission`, `deriveBookingViewerContext`, and the
audit-action permission gate. They will pick up the new enum members
automatically.

## 5. Rollback

If something goes wrong:

```bash
# Roll back code:
git revert <phase-1-commit>

# Roll back DB (last-resort; staging only):
npx prisma migrate resolve --rolled-back <migration-name>
psql $DATABASE_URL -c "..."   # reverse the ADD COLUMN / ADD VALUE / DROP TABLE statements
```

Because every change is additive, `git revert` of the schema is enough
in production: the new tables and columns become orphaned but harmless.
The new enum values remain in the type definition (PostgreSQL does not
support removing enum values without recreating the type) — that's fine,
no code references them after the revert.

## 6. Communication

- Note in the team channel that managers will receive the new booking-modify permissions automatically on next session refresh.
- Owners aren't affected — they retain implicit full access via `hasStaffPermission`'s OWNER short-circuit.
- Cashier and Staff get `SOCIAL_POST_REQUEST_CREATE` only; they cannot review or publish.

That's it. Once verified, Phase 1 is in place and the Phase 2 server-action work for either feature can begin in parallel against the new schema.

## 7. Anti-pattern: enum value rename / removal in one migration

Prisma's auto-generated migration for "rename enum value `QRPH` → `ONLINE`" looks like this:

```sql
ALTER TYPE "PaymentMethod" ADD VALUE 'ONLINE';
UPDATE "Booking" SET "payment_method" = 'ONLINE' WHERE "payment_method" = 'QRPH';
ALTER TYPE "PaymentMethod" RENAME VALUE 'QRPH' TO 'ONLINE';   -- or DROP / re-cast
```

It looks reasonable. It's wrong on Prisma Postgres (and on any vanilla Postgres without extra ceremony). The error you'll see is:

```
ERROR: unsafe use of new value "ONLINE" of enum type "PaymentMethod"
HINT:  New enum values must be committed before they can be used.
```

### Why it fails

`ALTER TYPE ... ADD VALUE` requires the new value to be **committed in its own transaction** before it can be referenced. Prisma wraps every migration in a single transaction (and on Prisma Postgres / Accelerate, we cannot turn that off — `-- prisma-disable-migration-transaction` is a no-op there). So `ADD VALUE 'ONLINE'` and `UPDATE ... SET 'ONLINE'` cannot both live inside the same migration on this stack.

`prisma migrate dev` will accept the file, then fail at deploy time with `P3006`. We hit this with the `20260425000000_remove_qrph_replace_online` migration.

### The fix: never use the new enum value of the old type

Sidestep the constraint entirely by creating a brand-new enum, casting via a `USING CASE`, and dropping the old one — all in one transaction-safe DDL block:

```sql
DROP TYPE IF EXISTS "PaymentMethod_new";

CREATE TYPE "PaymentMethod_new" AS ENUM ('CASH', 'ONLINE');

ALTER TABLE "Booking"
  ALTER COLUMN "payment_method"
  TYPE "PaymentMethod_new"
  USING (
    CASE "payment_method"::text
      WHEN 'QRPH' THEN 'ONLINE'
      ELSE "payment_method"::text
    END
  )::"PaymentMethod_new";

DROP TYPE "PaymentMethod";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";
```

Why this works: the cast happens against a column that is being *re-typed*, not against a value of the old type. Postgres is happy because the new enum exists fully before any row touches it. The whole block runs in one transaction, replay-safe, no `prisma-disable-migration-transaction` directive needed.

### Rule of thumb

When a Prisma diff suggests `ALTER TYPE ... ADD VALUE` followed by a usage of that value in the **same migration**:

1. Stop. Do not deploy.
2. Either split into two migrations (one to `ADD VALUE`, deploy, then a follow-up to use it), **or**
3. Use the `CREATE TYPE ..._new` + `USING CASE` pattern above.

(2) is fine for self-hosted Postgres but doesn't help on Prisma Postgres if the application reads the column before the second migration deploys. (3) is the universal answer.

### Related: removing an enum value

PostgreSQL has no `DROP VALUE` for enums. Removing a value requires the same `_new` swap pattern. The rules are the same.

### Where this anti-pattern shows up

- `payment_method` (QRPH → ONLINE — the original case).
- Any future enum where business naming changes (`status`, `tier`, role labels). When you see one of these in a schema PR, double-check the generated migration and apply the swap pattern preemptively.

The runbook in §2 above has a `migrate diff --script` step. Add a code-review check: if the generated SQL contains both `ADD VALUE` and a reference to that value, reject and rewrite using the swap pattern.

