# Booking Editor — Universal Access Design

**Status:** Design.
**Goal:** Any authorized staff member should be able to open a booking, see only the actions their role permits, and adjust the booking quickly — from a desk, a phone on the salon floor, or a tablet at the till. Today only owners get the full picture; staff dashboards don't even surface the booking detail consistently.

## 1. What we're building (in one sentence)

A single, role-aware booking detail screen — `BookingQuickPanel` — that's reachable from every place a staff member sees a booking (calendar, list, customer profile, queue, in-app notification), with inline actions for adding services, rescheduling, reassigning staff, recording payment, marking no-show, applying discounts, and adding notes. Backed by an audit log and customer-facing notifications when relevant.

## 2. Where it gets opened from

| Surface                               | Who lands here today                              | What we change                                                                                       |
| ------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/app/[slug]/bookings`                | Owner (today)                                      | Wire `BookingQuickPanel` instead of `BookingDetailsDialog` so all roles can land here. Filter list by viewer permission. |
| Owner dashboard widgets               | Owner                                              | Same panel, opens with full owner context.                                                           |
| Manager dashboard (`ManagerDashboard`)| Manager                                            | Add a "Bookings" tab; clicking a row opens the panel with manager context.                           |
| Cashier dashboard (new)               | (today they fall into employee dashboard)          | Build a dedicated "Front desk" view: today's bookings + payment column + open-panel button.          |
| Staff dashboard (`EmployeeDashboard`) | Staff                                              | "My bookings" list (only bookings where the staff member is `served_by_id` or claimed) opens panel in read-mostly mode. |
| Customer profile page                 | Owner (today only)                                 | Same booking history list; row click opens panel with viewer context.                                |
| Calendar / queue board                | Manager                                            | Click a slot or queue card → panel.                                                                  |
| In-app notification                   | All roles                                          | Notification deep-link pre-opens the panel for the relevant booking.                                 |

The panel is always a modal (or a side sheet on tablet/mobile). Never a separate page. This keeps context (calendar, queue, list) visible behind it.

## 3. Panel layout

The panel is one screen with three vertical zones. Each zone collapses on narrow viewports.

```
┌─────────────────────────────────────────────────────────────┐
│  Booking #1234 — Jane Cruz             [STATUS pill]        │  ← header
│  Tue May 5 · 2:00 PM – 3:30 PM · Manila Salon                │
├─────────────────────────────────────────────────────────────┤
│  CUSTOMER                                                    │  ← zone 1: identity
│   Jane Cruz · 0917-555-1234 · jane@example.com               │
│   [Walk-in] [VIP] [3 prior visits]                           │
├─────────────────────────────────────────────────────────────┤
│  SERVICES                                                    │  ← zone 2: scope
│   • Haircut — Maria — ₱400 — DONE                            │
│   • Color    — Maria — ₱1,200 — IN PROGRESS                  │
│   [+ Add service]    [↻ Swap]    [✕ Remove]                  │
├─────────────────────────────────────────────────────────────┤
│  SCHEDULE & STAFF                                            │
│   2:00–3:30 PM · Maria Lopez                                 │
│   [Reschedule]  [Reassign staff]                             │
├─────────────────────────────────────────────────────────────┤
│  PAYMENT                                                     │  ← zone 3: settlement
│   ₱1,600 total · ₱500 paid · ₱1,100 due                      │
│   [Record payment]  [Apply discount]  [Refund]               │
├─────────────────────────────────────────────────────────────┤
│  NOTES & HISTORY                                             │
│   "Allergic to ammonia bleach" — Maria, 2 visits ago         │
│   [+ Add note]   [View audit trail]                          │
└─────────────────────────────────────────────────────────────┘
```

Each action button is wrapped in `<PermissionGate>` per `docs/role-permissions-matrix.md`. Disallowed actions: hidden by default; in "discoverable" mode (toggle in user settings, default off) they render disabled with a tooltip explaining the missing permission.

## 4. Actions and what each one does

Anything in **bold** is new server-side work. Everything else exists.

- **Add service** — opens the existing add-service flow (`addBookingServiceOrCreateFollowUpAction`). No change to backend; just exposed everywhere now. Permission: `BOOKING_MODIFY` (or owner).
- **Remove service** — **new server action** `removeBookingServiceAction(bookingId, availedServiceId)`. Refunds the line if already paid; otherwise just decrements grand_total and recalculates ETA. Blocked once the service has started (`status >= SERVING`). Audit + outbox event.
- **Swap service** — sugar over remove + add in one transaction. **New action** `swapBookingServiceAction(bookingId, oldId, newServiceId)`.
- **Reschedule** — **new action** `rescheduleBookingAction(bookingId, newScheduledAt)`. Recalculates `estimated_end` and pushes downstream queue entries. Triggers customer reschedule notification. Permission: `BOOKING_MODIFY`.
- **Reassign staff** — **new action** `reassignBookingStaffAction(availedServiceId, newEmployeeId)`. Reuses queue claim logic. Permission: `QUEUE_OVERRIDE_ALL`.
- **Record payment** — use the shared ledger-backed payment action for partial or full amounts. Permission: `PAYMENT_COLLECT`.
- **Apply discount / adjust price** — **new action** `adjustBookingPriceAction(bookingId, lineId, deltaOrFinal, reason)`. Permission: `BOOKING_ADJUST_PRICE`. Reason is required and shows up in audit trail and customer receipt.
- **Refund** — owner-only path that walks back through `BookingPayment` records. Out of scope for v1 of this design beyond the existing flow.
- **Mark no-show** — existing `markBookingNoShowAction`. Permission gate switched from owner-only to `BOOKING_MARK_NO_SHOW`.
- **Cancel booking** — **new action** `cancelBookingAction(bookingId, reason)`. Soft cancel, recoverable for 24h. Permission: `BOOKING_CANCEL`. Triggers customer cancellation email/SMS.
- **Add note** — **new action** `addBookingNoteAction(bookingId, body, visibility)`. Visibility flag: `INTERNAL` (default) or `CUSTOMER_VISIBLE`. Internal notes hide from any customer-facing endpoints.
- **View audit trail** — opens the shared `<AuditTrail>` component populated from `getEntityAuditHistoryAction("Booking", id)`.

## 5. Mobile and floor-friendly behavior

- The panel renders as a bottom sheet on screens ≤ `sm` and a side sheet on `md`. Big tap targets (`min-h-12` on action buttons), no hover-only affordances.
- Sticky action bar at the bottom on mobile with the two most-likely actions for the viewer's role: cashier sees "Record payment" + "Add service"; manager sees "Add service" + "Reassign"; staff sees "Mark service done" + "Add note".
- Optimistic UI for the fast actions (record payment, mark no-show, add note, mark service done) so floor staff don't wait on round-trips.
- All long-press / right-click menus omitted; everything is reachable from explicit on-screen buttons. Floor devices vary too widely.

## 6. Permission-aware list filtering

The `bookings` list page already filters by status. We add a permission filter applied automatically:

- Owner / manager with `QUEUE_OVERRIDE_ALL` → all bookings for the business.
- Staff (no override) → bookings where the user is `served_by_id` on at least one `AvailedService`.
- Cashier → today's bookings only (matches their work surface), all customers.
- Search and date filters layer on top of these defaults.

This avoids the "I can see a booking I can't open" trap.

## 7. Audit and notification wiring

Every modifying action above does, inside its transaction:

1. `logAudit(tx, { entity_type: "Booking", entity_id: String(bookingId), action: <verb>, changes: { before, after }, actor_id, actor_type: "USER" })`.
2. `enqueueOutboxMessage(tx, { type: <event>, payload: { bookingId, ... } })` with one of:
   - `BOOKING_SERVICE_ADDED`, `BOOKING_SERVICE_REMOVED`, `BOOKING_SERVICE_SWAPPED`
   - `BOOKING_RESCHEDULED`, `BOOKING_STAFF_REASSIGNED`
   - `BOOKING_PRICE_ADJUSTED`, `BOOKING_DISCOUNT_APPLIED`
   - `BOOKING_NO_SHOW`, `BOOKING_CANCELLED`, `BOOKING_NOTE_ADDED`

Outbox processors decide the side effects (customer SMS for reschedule/cancel/price; nothing for note-added; staff push for reassign).

The audit-log viewer is opened from the panel itself, not a separate page — keeps the action and its history close.

## 8. Data model deltas

Mostly additive, no destructive changes.

```prisma
// Booking — new fields
model Booking {
  // ... existing
  cancelled_at    DateTime?
  cancelled_by_id String?      // FK User
  cancellation_reason String?
  notes           BookingNote[]
}

// BookingNote — new
model BookingNote {
  id          String   @id @default(cuid())
  booking_id  Int
  body        String
  visibility  BookingNoteVisibility @default(INTERNAL)
  created_at  DateTime @default(now())
  created_by_user_id String?
  booking     Booking  @relation(fields: [booking_id], references: [id], onDelete: Cascade)
}

enum BookingNoteVisibility {
  INTERNAL
  CUSTOMER_VISIBLE
}

// BookingPriceAdjustment — new (so reasons survive line-item churn)
model BookingPriceAdjustment {
  id                  String   @id @default(cuid())
  booking_id          Int
  availed_service_id  Int?
  delta_amount        Float    // negative for discount
  reason              String
  created_at          DateTime @default(now())
  created_by_user_id  String?
}
```

We also flip the existing add-on permission check from `BOOKING_CREATE` to `BOOKING_MODIFY` once the new permission is rolled out.

## 9. Backwards compatibility

- `BookingDetailsDialog` keeps working with no `viewerContext` — defaults to full owner. Existing owner pages don't change.
- The new `BookingQuickPanel` (already exported as a thin re-wrap) is the public name we encourage new callers to import. Old `BookingDetailsDialog` import paths stay valid; we keep them around for at least one major version.
- Server actions are net-new for the new operations. Existing `addBookingServiceOrCreateFollowUpAction`, `markBookingPaidAction`, `markBookingNoShowAction` keep their signatures; we only widen their permission acceptance (now accepts `BOOKING_MODIFY` in addition to `BOOKING_CREATE` for add-on).

## 10. Out of scope for v1 (call out explicitly)

- Multi-booking batch operations (bulk reschedule, bulk cancel).
- Recurring booking templates.
- Customer-initiated booking edits via a self-service link.
- Tip handling beyond what `markBookingPaidAction` already does.
- Voucher/gift card adjustments mid-booking — those go through their own flows.

These are not bad ideas, just not what unblocks the user's immediate ask. We can sequence them next if traffic justifies.
