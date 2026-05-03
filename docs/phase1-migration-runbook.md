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
