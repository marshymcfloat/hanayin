# Booking Editor — Per-Role Guide

The booking detail panel is the same screen for everyone — what you see depends on what your role lets you do. This guide covers the new actions that go live with the booking editor.

## Quick reference

| Action | Owner | Manager | Cashier | Staff |
| --- | --- | --- | --- | --- |
| View a booking | yes | yes | yes | their own |
| Add a service | yes | yes | by request | no |
| Remove a service | yes | yes | no | no |
| Swap a service | yes | yes | no | no |
| Reschedule | yes | yes | no | no |
| Reassign staff | yes | yes | no | no |
| Adjust price (with reason) | yes | yes | by request | no |
| Mark as paid | yes | yes | yes | by request |
| Mark as no-show | yes | yes | no | no |
| Cancel booking (soft) | yes | yes | no | no |
| Permanently delete | yes | no | no | no |
| Add internal note | yes | yes | yes | yes |
| Add customer-visible note | yes | yes | no | no |
| View audit trail | yes | yes | no | no |

"by request" means the action can be enabled per-employee from the **Permissions** menu on the Employees page.

## Where the booking panel opens from

Same panel, lots of entry points:

- The owner's main **Bookings** list.
- The manager's **Today's bookings** dialog (header trigger on the manager dashboard).
- A staff member's **My Bookings** section on their dashboard — only the bookings they're assigned to.
- The customer profile's **Booking History** — click any past booking.
- **Notification deep-links** — clicking a booking-related notification jumps you to that booking with the panel already open.
- **`?open=<id>`** in the bookings URL — handy for support links.

## How to do each thing

### Add a service to an existing booking
Open the booking → scroll to **Add Service** → pick from the catalog → submit. The price recalculates. If the booking is already paid or being served, a follow-up booking is created instead.

### Remove a service line
Each service row has a small trash icon. Click it → confirm. Only allowed when the booking is ACCEPTED, unpaid, the line is still PENDING, and at least one other line remains.

### Swap a service for a different one
Each service row has a swap icon (next to the trash). Click it → pick a replacement → submit. Same eligibility as Remove.

### Reschedule
Open an ACCEPTED booking → click **Reschedule** in the action row → pick a new date/time. Service line timestamps shift by the same delta automatically. The customer is notified and a fresh reminder fires at the new time.

### Reassign a service to a different staff member
Each service row has a Users icon. Click it → pick a different employee → submit. The current assignee is filtered out of the picker. Only allowed when the line is PENDING or CLAIMED. Internal change — the customer is not notified.

### Adjust price (discount or surcharge)
Open the booking → click **Adjust price** → pick "Whole booking" or a specific service line → choose Discount or Surcharge → enter the amount and a required reason. The reason shows up in the audit trail and on the customer's receipt. Not allowed on fully-paid bookings — issue a refund instead.

### Cancel a booking
Open the booking → click **Cancel booking** → enter a reason → confirm. The booking flips to CANCELLED, the customer is notified, and the reason is recorded in the audit trail.

### Add a note
Scroll to the **Notes** section. Type and click **Add note**. Notes default to "Internal" — only your team sees them. If you have permission, you can tick "Visible to the customer" to make a note appear on their booking page.

### View audit history
Open the booking → click **View history** at the bottom. Shows who did what and when, newest first.

## How permissions work

Every action is gated by a single permission flag. The defaults follow this guide's table; an owner can grant or revoke individual flags per employee from **Employees → ⋯ → Permissions**.

If an action you expect is missing, check with your owner — they may need to enable that flag for your account. If you remove all permissions for an employee, the system falls back to the role defaults rather than locking them out completely.

## Mobile

The panel takes the full screen on phones and tablets. Action buttons are large enough for floor use. The same role-aware rules apply — you only see the actions you're allowed to perform.

## Troubleshooting

- **"Permission needed" toast**: the action you tried isn't enabled for your account. Ask your owner.
- **"This booking already has a payment recorded"**: you can't adjust the price downward on a paid booking. Issue a refund first.
- **"This service has already started or finished"**: once a service moves past PENDING, it can't be removed/swapped/reassigned.
- **"Cancel the booking instead"**: if you try to remove the last remaining service from a booking, the system steers you toward Cancel instead — same outcome, cleaner audit trail.
- **Don't see the Reschedule button on a same-day walk-in**: walk-ins booked without a scheduled_at can't be rescheduled — it's not a meaningful operation since they're already happening.

---

Source of truth in code: `docs/role-permissions-matrix.md`. If this article ever falls out of sync with the matrix, the matrix wins.
