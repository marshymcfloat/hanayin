import { expect, test } from "./isolated-test";

const privateRoutes = [
  "/app",
  "/app/demo-business",
  "/app/demo-business/bookings",
  "/app/demo-business/sale-events",
  "/app/demo-business/reports",
  "/redesign/owner-dashboard",
  "/redesign/owner-dashboard/services",
  "/redesign/owner-dashboard/business/services",
  "/redesign/owner-dashboard/business/packages",
  "/redesign/owner-dashboard/business/vouchers",
  "/redesign/owner-dashboard/business/gift-cards",
  "/redesign/owner-dashboard/business/sale-events",
  "/redesign/owner-dashboard/business/social-posts",
  "/redesign/owner-dashboard/business/business-hours",
  "/redesign/owner-dashboard/business/billing",
  "/redesign/owner-dashboard/business/reports",
];

test.describe("Private route protection", () => {
  test.setTimeout(90_000);

  test("redirects unauthenticated users from app routes", async ({ page }) => {
    for (const route of privateRoutes) {
      await page.goto(route, { waitUntil: "commit", timeout: 20_000 });
      await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
    }
  });
});
