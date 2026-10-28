import { expect, test } from "@playwright/test";

test("owner preview APIs are not captured by the public modal route", async ({ request }) => {
  for (const section of ["redesign", "today", "queue", "growth"]) {
    const response = await request.get(`/api/owner-dashboard-preview/test-studio/dashboard/${section}`);
    expect(response.status()).toBe(401);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  }
});
