import { expect, test } from "@playwright/test";

const privateRoutes = [
  "/app",
  "/app/demo-business",
  "/app/demo-business/bookings",
  "/app/demo-business/sale-events",
  "/app/demo-business/reports",
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
