// Colocated action regression test.
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAuth,
  mockBusinessFindUnique,
  mockGetCoreReportPayload,
  mockRecordReportTelemetry,
  mockResolveActor,
} = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockBusinessFindUnique: vi.fn(),
  mockGetCoreReportPayload: vi.fn(),
  mockRecordReportTelemetry: vi.fn(),
  mockResolveActor: vi.fn(),
}));

vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mockResolveActor }));

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: mockRequireAuth,
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: {
    business: {
      findUnique: mockBusinessFindUnique,
    },
  },
}));

vi.mock("@/lib/services/reports/queries", () => ({
  getCoreReportPayload: mockGetCoreReportPayload,
}));

vi.mock("@/lib/services/reports/telemetry", () => ({
  recordReportTelemetry: mockRecordReportTelemetry,
}));

import {
  getCustomersReportAction,
  getOverviewReportAction,
  getRevenueReportAction,
  getOperationsReportAction,
} from "./reports";
import { getOwnerCoreReport } from "@/features/reports/services/core-report";

describe("reports server actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireAuth.mockResolvedValue({ success: true, businessSlug: "beautyfeel", session: { user: { id: "owner_1", role: "OWNER" } } });
    mockResolveActor.mockResolvedValue({ success: true, actorType: "OWNER", businessId: "biz_1", businessSlug: "beautyfeel", userId: "owner_1" });
    mockBusinessFindUnique.mockResolvedValue({ id: "biz_1", slug: "beautyfeel" });
    mockGetCoreReportPayload.mockResolvedValue({
      range: {
        preset: "30d",
      },
    });
    mockRecordReportTelemetry.mockResolvedValue(undefined);
  });

  it("returns unauthorized if session is missing", async () => {
    mockRequireAuth.mockResolvedValue({
      success: false,
      error: "Unauthorized",
    });

    const result = await getOverviewReportAction();
    expect(result).toEqual({
      success: false,
      error: "Unauthorized",
    });
    expect(mockGetCoreReportPayload).not.toHaveBeenCalled();
  });

  it("blocks non-owner users", async () => {
    mockRequireAuth.mockResolvedValue({
      success: true,
      businessSlug: "beautyfeel",
      session: {
        user: {
          id: "user_1",
          role: "EMPLOYEE",
        },
      },
    });

    const result = await getOverviewReportAction();
    expect(result).toEqual({
      success: false,
      error: "Forbidden",
    });
  });

  it("returns report payload for owner", async () => {
    mockRequireAuth.mockResolvedValue({
      success: true,
      businessSlug: "beautyfeel",
      session: {
        user: {
          id: "owner_1",
          role: "OWNER",
        },
      },
    });

    mockGetCoreReportPayload.mockResolvedValue({
      range: {
        preset: "30d",
      },
      kpis: {},
    });

    const result = await getCustomersReportAction({
      preset: "30d",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.tab).toBe("customers");
    }
    expect(mockGetCoreReportPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        tab: "customers",
        businessId: "biz_1",
      }),
    );
    expect(mockRecordReportTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "REPORT_VIEW",
        tab: "customers",
        businessId: "biz_1",
      }),
    );
    expect(mockBusinessFindUnique).not.toHaveBeenCalled();
  });

  it.each([false, true])("rejects stale or non-owner current membership", async employee => {
    mockResolveActor.mockResolvedValue(employee ? { success: true, actorType: "EMPLOYEE", businessId: "foreign" } : { success: false, error: "Unauthorized" });
    expect(await getOverviewReportAction()).toEqual({ success: false, error: "Forbidden" });
    expect(mockGetCoreReportPayload).not.toHaveBeenCalled();
    expect(mockRecordReportTelemetry).not.toHaveBeenCalled();
  });

  it.each([
    ["overview", getOverviewReportAction], ["revenue", getRevenueReportAction],
    ["customers", getCustomersReportAction], ["operations", getOperationsReportAction],
  ] as const)("preserves %s response and tenant-scoped telemetry", async (tab, action) => {
    const result = await action({ preset: "custom", start: "2026-09-10", end: "2026-09-01", groupBy: "week" });
    expect(result).toMatchObject({ success: true, tab, data: { range: { preset: "30d" } }, range: { preset: "custom", start: "2026-09-01", end: "2026-09-10", groupBy: "week" } });
    expect(mockResolveActor).toHaveBeenCalledWith("beautyfeel", "owner_1");
    expect(mockGetCoreReportPayload).toHaveBeenCalledWith(expect.objectContaining({ tab, businessId: "biz_1" }));
    expect(mockRecordReportTelemetry).toHaveBeenCalledWith(expect.objectContaining({ tab, actorId: "owner_1", businessId: "biz_1", success: true, latencyMs: expect.any(Number) }));
  });

  it.each([null, [], "malformed", { start: 1 }, { preset: "a".repeat(33) }, { groupBy: true }])("rejects malformed filters before report queries", async filters => {
    expect(await getOverviewReportAction(filters as Parameters<typeof getOverviewReportAction>[0])).toEqual({ success: false, error: "Invalid input" });
    expect(mockGetCoreReportPayload).not.toHaveBeenCalled();
    expect(mockRecordReportTelemetry).not.toHaveBeenCalled();
  });

  it("retains normalization, fallback and the 730-day range limit", async () => {
    const result = await getOverviewReportAction({ preset: "custom", start: "2020-01-01", end: "2026-09-16", groupBy: "unsupported" });
    expect(result).toMatchObject({ success: true, range: { spanDays: 730, groupBy: "month" } });
  });

  it.each(["auth", "actor", "query", "telemetry"] as const)("returns safe %s infrastructure errors", async target => {
    const mock = { auth: mockRequireAuth, actor: mockResolveActor, query: mockGetCoreReportPayload, telemetry: mockRecordReportTelemetry }[target];
    mock.mockRejectedValue(new Error("private database/provider fixture"));
    expect(await getOverviewReportAction()).toEqual({ success: false, error: "Unable to load report." });
    if (target !== "query" && target !== "telemetry") expect(mockGetCoreReportPayload).not.toHaveBeenCalled();
  });

  it("the feature service denies a non-owner capability before report work", async () => {
    const invalid = { success: true, actorType: "EMPLOYEE", businessId: "foreign" } as unknown as Parameters<typeof getOwnerCoreReport>[0];
    await expect(getOwnerCoreReport(invalid, "overview", {})).rejects.toThrow("Forbidden");
    expect(mockGetCoreReportPayload).not.toHaveBeenCalled();
    expect(mockRecordReportTelemetry).not.toHaveBeenCalled();
  });
});
