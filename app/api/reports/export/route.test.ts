import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetServerSession,
  mockBusinessFindUnique,
  mockGetCoreReportPayload,
  mockGetAdvancedReportPayload,
  mockGetBusinessEntitlementsBySlug,
  mockSerializeReportCsv,
  mockSerializeReportXlsx,
  mockRecordReportTelemetry,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockBusinessFindUnique: vi.fn(),
  mockGetCoreReportPayload: vi.fn(),
  mockGetAdvancedReportPayload: vi.fn(),
  mockGetBusinessEntitlementsBySlug: vi.fn(),
  mockSerializeReportCsv: vi.fn(),
  mockSerializeReportXlsx: vi.fn(),
  mockRecordReportTelemetry: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
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
  getAdvancedReportPayload: mockGetAdvancedReportPayload,
}));

vi.mock("@/lib/features/plan-entitlements", () => ({
  getBusinessEntitlementsBySlug: mockGetBusinessEntitlementsBySlug,
}));

vi.mock("@/lib/services/reports/csv", () => ({
  serializeReportCsv: mockSerializeReportCsv,
}));

vi.mock("@/lib/services/reports/xlsx", () => ({
  serializeReportXlsx: mockSerializeReportXlsx,
}));

vi.mock("@/lib/services/reports/telemetry", () => ({
  recordReportTelemetry: mockRecordReportTelemetry,
}));

import { GET } from "./route";

describe("reports export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBusinessFindUnique.mockResolvedValue({ id: "biz_1" });
    mockGetCoreReportPayload.mockResolvedValue({ fake: "payload" });
    mockGetAdvancedReportPayload.mockResolvedValue({ fake: "payload" });
    mockGetBusinessEntitlementsBySlug.mockResolvedValue({
      reportsCore: true,
      reportsAdvanced: true,
    });
    mockSerializeReportCsv.mockReturnValue("a,b\n1,2");
    mockSerializeReportXlsx.mockReturnValue(Buffer.from("xlsx-binary"));
    mockRecordReportTelemetry.mockResolvedValue(undefined);
  });

  it("rejects missing business slug", async () => {
    const response = await GET(new Request("http://localhost/api/reports/export?tab=overview"));
    expect(response.status).toBe(400);
  });

  it("rejects csv export for advanced tabs", async () => {
    const response = await GET(
      new Request("http://localhost/api/reports/export?businessSlug=beautyfeel&tab=cohorts"),
    );
    expect(response.status).toBe(400);
  });

  it("rejects unauthorized requests", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const response = await GET(
      new Request("http://localhost/api/reports/export?businessSlug=beautyfeel&tab=overview"),
    );
    expect(response.status).toBe(401);
  });

  it("enforces tenant isolation", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "owner_1",
        role: "OWNER",
        businessSlug: "other-business",
      },
    });

    const response = await GET(
      new Request("http://localhost/api/reports/export?businessSlug=beautyfeel&tab=overview"),
    );
    expect(response.status).toBe(403);
  });

  it("returns csv export for valid owner request", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "owner_1",
        role: "OWNER",
        businessSlug: "beautyfeel",
      },
    });

    const response = await GET(
      new Request(
        "http://localhost/api/reports/export?businessSlug=beautyfeel&tab=overview&preset=30d",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain("beautyfeel-overview");
    expect(await response.text()).toBe("a,b\n1,2");
    expect(mockGetCoreReportPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        tab: "overview",
        businessId: "biz_1",
      }),
    );
    expect(mockSerializeReportCsv).toHaveBeenCalledWith("overview", { fake: "payload" });
    expect(mockRecordReportTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "REPORT_EXPORT",
        tab: "overview",
        metadata: expect.objectContaining({
          format: "csv",
        }),
      }),
    );
  });

  it("returns xlsx export for customers tab", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "owner_1",
        role: "OWNER",
        businessSlug: "beautyfeel",
      },
    });

    const response = await GET(
      new Request(
        "http://localhost/api/reports/export?businessSlug=beautyfeel&tab=customers&format=xlsx&preset=30d",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("content-disposition")).toContain("beautyfeel-customers");
    expect(mockSerializeReportXlsx).toHaveBeenCalledWith("customers", { fake: "payload" });
    expect(mockSerializeReportCsv).not.toHaveBeenCalled();
    expect(mockRecordReportTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "REPORT_EXPORT",
        tab: "customers",
        metadata: expect.objectContaining({
          format: "xlsx",
        }),
      }),
    );
  });

  it("returns xlsx export for overview tab", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "owner_1",
        role: "OWNER",
        businessSlug: "beautyfeel",
      },
    });

    const response = await GET(
      new Request(
        "http://localhost/api/reports/export?businessSlug=beautyfeel&tab=overview&format=xlsx&preset=30d",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("content-disposition")).toContain("beautyfeel-overview");
    expect(mockSerializeReportXlsx).toHaveBeenCalledWith("overview", { fake: "payload" });
  });

  it("returns xlsx export for advanced tab when entitled", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "owner_1",
        role: "OWNER",
        businessSlug: "beautyfeel",
      },
    });

    const response = await GET(
      new Request(
        "http://localhost/api/reports/export?businessSlug=beautyfeel&tab=cohorts&format=xlsx&preset=30d",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("beautyfeel-cohorts");
    expect(mockGetAdvancedReportPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        tab: "cohorts",
        businessId: "biz_1",
      }),
    );
    expect(mockSerializeReportXlsx).toHaveBeenCalledWith("cohorts", { fake: "payload" });
  });

  it("rejects advanced xlsx export when entitlement is disabled", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "owner_1",
        role: "OWNER",
        businessSlug: "beautyfeel",
      },
    });
    mockGetBusinessEntitlementsBySlug.mockResolvedValue({
      reportsCore: true,
      reportsAdvanced: false,
    });

    const response = await GET(
      new Request(
        "http://localhost/api/reports/export?businessSlug=beautyfeel&tab=cohorts&format=xlsx",
      ),
    );
    expect(response.status).toBe(403);
  });
});
