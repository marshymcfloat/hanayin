import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), context: vi.fn(), read: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.context }));
vi.mock("@/features/reports/services/core-report", () => ({ getOwnerCoreReport: mocks.read }));

import { GET } from "./route";

const params = { params: Promise.resolve({ businessSlug: "beautyfeel" }) };
const request = (query = "") => new Request(`http://localhost/api/owner-dashboard-preview/beautyfeel/reports${query}`);
const owner = { user: { id: "owner-1", role: "OWNER", businessSlug: "beautyfeel" } };
const context = { success: true, actorType: "OWNER", userId: "owner-1", businessId: "business-1" };

describe("reports preview GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue(owner);
    mocks.context.mockResolvedValue(context);
    mocks.read.mockResolvedValue({ success: true, tab: "overview", data: { kpis: {} } });
  });

  it("rejects invalid tab or filter before protected data access", async () => {
    expect((await GET(request("?tab=cohorts"), params)).status).toBe(400);
    expect((await GET(request("?preset=custom"), params)).status).toBe(400);
    expect((await GET(request("?groupBy=bad"), params)).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("denies anonymous, foreign tenant, and revoked stored ownership", async () => {
    mocks.session.mockResolvedValueOnce(null).mockResolvedValueOnce({ user: { id: "owner-1", role: "OWNER", businessSlug: "other" } });
    expect((await GET(request(), params)).status).toBe(401);
    expect((await GET(request(), params)).status).toBe(403);
    mocks.context.mockResolvedValueOnce({ success: false, error: "Forbidden" });
    expect((await GET(request(), params)).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("uses the selected tab and range with private no-store response", async () => {
    const response = await GET(request("?tab=expenses&preset=90d&groupBy=week"), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.context).toHaveBeenCalledWith("beautyfeel", "owner-1");
    expect(mocks.read).toHaveBeenCalledWith(context, "expenses", { preset: "90d", groupBy: "week" });
  });

  it("serializes report range and expense dates as JSON strings", async () => {
    const instant = new Date("2026-09-27T00:00:00.000Z");
    mocks.read.mockResolvedValueOnce({
      success: true,
      tab: "expenses",
      range: { preset: "30d", label: "Last 30 days", startAt: instant, endAt: instant },
      data: { range: { startAt: instant, endAt: instant }, kpis: {}, entries: [{ date: instant }] },
    });

    const response = await GET(request("?tab=expenses"), params);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.range.startAt).toBe("2026-09-27T00:00:00.000Z");
    expect(body.data.range.endAt).toBe("2026-09-27T00:00:00.000Z");
    expect(body.data.entries[0].date).toBe("2026-09-27T00:00:00.000Z");
  });
});
