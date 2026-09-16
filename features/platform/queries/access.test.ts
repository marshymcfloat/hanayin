import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), model: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requirePlatformAdmin: mocks.admin }));
vi.mock("@/features/billing/subscription-service", () => ({ DEFAULT_SUBSCRIPTION_PLAN_CODE: "FREE", SUBSCRIPTION_PLAN_CODES: ["FREE"], ensureDefaultPlans: vi.fn() }));
vi.mock("@/prisma/prisma", () => ({ prisma: {}, supportsOnboardingApplicationModel: mocks.model, isPrismaAccelerateResourceLimitError: vi.fn() }));

import { getPlatformApplicationsData } from "@/features/platform/queries/applications";
import { getPlatformAuditData } from "@/features/platform/queries/audit";
import { getPlatformBusinessesData } from "@/features/platform/queries/businesses";
import { getPlatformInvoicesData } from "@/features/platform/queries/invoices";
import { getPlatformOutboxData } from "@/features/platform/queries/outbox";
import { getPlatformPlansData } from "@/features/platform/queries/plans";
import { getPlatformReferralsData } from "@/features/platform/queries/referrals";

beforeEach(() => { vi.resetAllMocks(); mocks.admin.mockResolvedValue({ success: false }); });

describe.each([
  ["applications", getPlatformApplicationsData], ["audit", getPlatformAuditData],
  ["businesses", getPlatformBusinessesData], ["invoices", getPlatformInvoicesData],
  ["outbox", getPlatformOutboxData], ["plans", getPlatformPlansData],
  ["referrals", getPlatformReferralsData],
] as const)("platform %s query", (_name, load) => {
  it("rejects access before touching persistence", async () => {
    const result = await load();
    expect(result === null || ("success" in result && result.success === false)).toBe(true);
    expect(mocks.model).not.toHaveBeenCalled();
  });
});
