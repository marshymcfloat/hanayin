import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetServerSession,
  mockBusinessFindUnique,
  mockGetCoreReportPayload,
  mockSerializeReportCsv,
  mockRecordReportTelemetry,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockBusinessFindUnique: vi.fn(),
  mockGetCoreReportPayload: vi.fn(),
  mockSerializeReportCsv: vi.fn(),
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
}));

vi.mock("@/lib/services/reports/csv", () => ({
  serializeReportCsv: mockSerializeReportCsv,
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
    mockSerializeReportCsv.mockReturnValue("a,b\n1,2");
    mockRecordReportTelemetry.mockResolvedValue(undefined);
  });

  it("rejects missing business slug", async () => {
    const response = await GET(new Request("http://localhost/api/reports/export?tab=overview"));
    expect(response.status).toBe(400);
  });

  it("rejects invalid tab values", async () => {
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
      }),
    );
  });
});
