import { test as base } from "@playwright/test";
import { shouldBlockSmokeRequest } from "@/test/support/e2e-network-policy";

export { expect } from "@playwright/test";
export const test = base.extend<{ networkIsolation: void }>({
  networkIsolation: [async ({ context, baseURL }, use) => {
    if (!baseURL) throw new Error("Smoke tests require an explicit local base URL");
    await context.route("**/*", route => shouldBlockSmokeRequest(route.request().url(), baseURL)
      ? route.abort("blockedbyclient") : route.continue());
    await use();
  }, { auto: true }],
});
