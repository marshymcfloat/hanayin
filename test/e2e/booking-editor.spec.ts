/**
 * Booking-editor role walkthrough (Wave D3).
 *
 * Covers the cross-role flow defined in docs/verification-plan.md §2:
 * sign in as each role in turn, exercise that role's primary surface,
 * confirm the matrix shows up correctly in the UI.
 *
 * STATUS: skeleton-only. The real fixtures (seeded business with one
 * owner + one manager + one cashier + one staff + bookings in each
 * relevant state) need a per-role login helper that doesn't exist yet
 * in this repo. The structure below is committed so that helper can
 * land independently and the assertions stay reviewable.
 *
 * To enable: set BOOKING_EDITOR_E2E=true in the env and provide
 * BOOKING_EDITOR_E2E_OWNER_EMAIL / _MANAGER_EMAIL / _CASHIER_EMAIL /
 * _STAFF_EMAIL plus a shared password. Each user must already exist
 * in the DB with the right StaffProfile and matrix-default permissions.
 */

import { expect, test } from "@playwright/test";

const ENABLE = process.env.BOOKING_EDITOR_E2E === "true";

const ENV = {
  ownerEmail: process.env.BOOKING_EDITOR_E2E_OWNER_EMAIL,
  managerEmail: process.env.BOOKING_EDITOR_E2E_MANAGER_EMAIL,
  cashierEmail: process.env.BOOKING_EDITOR_E2E_CASHIER_EMAIL,
  staffEmail: process.env.BOOKING_EDITOR_E2E_STAFF_EMAIL,
  password: process.env.BOOKING_EDITOR_E2E_PASSWORD,
  businessSlug: process.env.BOOKING_EDITOR_E2E_BUSINESS_SLUG,
};

test.describe("Booking editor — role walkthrough", () => {
  test.skip(
    !ENABLE,
    "Booking-editor E2E disabled. Set BOOKING_EDITOR_E2E=true and the per-role credentials in .env to run.",
  );

  test("OWNER can perform every action on a booking", async ({ page }) => {
    test.skip(!ENV.ownerEmail || !ENV.password || !ENV.businessSlug);
    // 1. Sign in as owner.
    await signIn(page, ENV.ownerEmail!, ENV.password!);
    // 2. Open the bookings list, click any ACCEPTED + unpaid booking
    //    with multiple service lines.
    // 3. Assert the panel shows: Reschedule, Adjust price, Cancel,
    //    Mark No-Show, Mark Paid in the action row; Reassign + Swap +
    //    Remove icons in each service line.
    // 4. Click Add service → submit → expect "Service added" toast.
    // 5. Click trash on a different line → confirm → expect "Service removed".
    // 6. Open the audit-history toggle → expect at least 2 rows.
  });

  test("MANAGER sees the full action set except Delete", async ({ page }) => {
    test.skip(!ENV.managerEmail || !ENV.password || !ENV.businessSlug);
    await signIn(page, ENV.managerEmail!, ENV.password!);
    // 1. Land on manager dashboard.
    // 2. Click "Today's bookings" header trigger → list opens.
    // 3. Click a booking → panel opens.
    // 4. Assert action-row buttons match the matrix for MANAGER.
    // 5. Reassign a service line via the Users icon → expect
    //    "Service reassigned" toast.
    // 6. Verify Delete is NOT in the dropdown menu of any list row.
  });

  test("CASHIER lands in the front-desk view and can record payment", async ({
    page,
  }) => {
    test.skip(!ENV.cashierEmail || !ENV.password || !ENV.businessSlug);
    await signIn(page, ENV.cashierEmail!, ENV.password!);
    // 1. Cashier lands in EmployeeDashboard.
    // 2. Payments queue is visible. Click a booking with unsettled total.
    // 3. Mark Paid → expect "Booking marked as paid" toast.
  });

  test("STAFF sees only their own bookings, no destructive actions", async ({
    page,
  }) => {
    test.skip(!ENV.staffEmail || !ENV.password || !ENV.businessSlug);
    await signIn(page, ENV.staffEmail!, ENV.password!);
    // 1. EmployeeDashboard shows the new "My Bookings" section.
    // 2. Click a booking → panel opens with read-mostly context.
    // 3. Confirm: no Add Service, no Reschedule, no Cancel, no Adjust
    //    Price; the Notes section is present and INTERNAL-only.
  });
});

async function signIn(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  // Wait for the dashboard shell. The exact route varies per role —
  // the layout's redirect handles it; we just wait for any /app/ URL.
  await expect(page).toHaveURL(/\/app\//, { timeout: 15000 });
}
