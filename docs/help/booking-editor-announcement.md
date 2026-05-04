# In-app announcement: Booking editor goes live

When the `BOOKING_EDITOR_ENABLED` flag flips on for a tenant (or appears in the pilot list), surface this announcement to the owner the next time they sign in. Two-tier copy: a one-line banner for everyone, an expanded modal for the owner.

## Banner (all roles)

> **New: edit bookings without re-creating them.** Add or remove services, reschedule, reassign staff, adjust price, and more — all from the booking detail panel. [Learn more →](/help/booking-editor)

## Owner welcome modal

```text
Title:    Booking editor is live for {businessName}
Subtitle: New superpowers for you and your team

Body:
  You can now reshape bookings in place — no more cancel-and-rebook
  loops. The booking detail panel works the same way for everyone,
  but each role sees only the actions they're allowed to do.

  What changed for your team by default:
    • Managers can add/remove/swap services, reschedule, reassign
      staff, adjust price, mark no-show, and cancel.
    • Cashiers gained no new actions by default — they can still
      record payments. You can grant any of the above per-cashier
      from the Permissions menu on the Employees page.
    • Staff stay read-mostly — they can see their own bookings and
      add notes. Grant individual permissions if you want to
      delegate further.
    • You retain owner-only delete and full audit-trail access.

  Open the help center for the per-role guide and the full
  permissions matrix.

Actions:
  • Primary: "See what's new" → /help/booking-editor
  • Secondary: "Manage permissions" → /app/{businessSlug}/employees
  • Dismiss
```

## Manager / Cashier / Staff toast (first session post-launch)

For non-owner roles, a smaller toast on first dashboard load:

```text
You can now [click any booking | open today's bookings | see your bookings]
to use the new in-place editing tools. What you can do depends on your
permissions. → "Got it"
```

Per-role copy of the bracketed text:

- Manager: "open today's bookings"
- Cashier: "click any booking on the payments queue"
- Staff: "see your bookings"

## Implementation notes

- Track first-show in localStorage with a `bookingEditor.welcome.dismissed` key.
- The "Manage permissions" CTA links the owner straight to the Employees page where the per-row Permissions dropdown lives.
- After dismiss, the announcement does not re-appear unless localStorage is cleared. Help-center article remains the durable artifact.
