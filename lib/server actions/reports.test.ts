import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAuth,
  mockBusinessFindUnique,
  mockGetCoreReportPayload,
  mockRecordReportTelemetry,
} = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockBusinessFindUnique: vi.fn(),
  mockGetCoreReportPayload: vi.fn(),
  mockRecordReportTelemetry: vi.fn(),
}));

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
} from "./reports";

describe("reports server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });
});
