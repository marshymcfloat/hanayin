import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), model: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requirePlatformAdmin: mocks.auth }));
vi.mock("@/features/billing/subscription-service", () => ({ SUBSCRIPTION_PLAN_CODES: [] }));
vi.mock("@/prisma/prisma", () => ({ prisma: {}, supportsOnboardingApplicationModel: mocks.model, isPrismaAccelerateResourceLimitError: vi.fn() }));

import { getPlatformOverviewData } from "@/features/platform/queries/overview";

it("rejects non-admin access before inspecting database models or fetching metrics", async () => {
  mocks.auth.mockResolvedValue({ success: false });
  expect(await getPlatformOverviewData()).toBeNull();
  expect(mocks.model).not.toHaveBeenCalled();
});
