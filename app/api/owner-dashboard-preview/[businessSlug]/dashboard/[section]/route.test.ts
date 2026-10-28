import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  context: vi.fn(),
  performance: vi.fn(),
  today: vi.fn(),
  queue: vi.fn(),
  growth: vi.fn(),
  financials: vi.fn(),
  redesign: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/features/dashboard/queries/owner-redesign-analytics", () => ({ getOwnerRedesignAnalytics: mocks.redesign }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.context }));
vi.mock("@/features/dashboard/queries/owner-dashboard-preview-sections", () => ({
  getOwnerDashboardPerformance: mocks.performance,
  getOwnerDashboardToday: mocks.today,
  getOwnerDashboardQueue: mocks.queue,
  getOwnerDashboardGrowth: mocks.growth,
  getOwnerDashboardFinancialRange: mocks.financials,
}));

import { GET } from "./route";

const params = (businessSlug: string, section: string) => ({ params: Promise.resolve({ businessSlug, section }) });
const request = (query = "") => new Request(`http://localhost/api/owner-dashboard-preview/beautyfeel/dashboard/financials${query}`);
const ownerContext = { success: true, actorType: "OWNER", businessId: "business-1", businessSlug: "beautyfeel", userId: "owner-1", ownerId: 3 };

describe("owner dashboard section endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "owner-1", role: "OWNER", businessSlug: "beautyfeel" } });
    mocks.context.mockResolvedValue(ownerContext);
    for (const loader of [mocks.performance, mocks.today, mocks.queue, mocks.growth, mocks.financials, mocks.redesign]) {
      loader.mockResolvedValue({ generatedAt: "2026-09-23T04:00:00.000Z" });
    }
  });

  it("validates section and range before touching protected data", async () => {
    expect((await GET(request(), params("beautyfeel", "other"))).status).toBe(400);
    expect((await GET(request("?range=18m"), params("beautyfeel", "financials"))).status).toBe(400);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.context).not.toHaveBeenCalled();
  });

  it("protects redesign data with the same owner boundary and private cache policy", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request(), params("beautyfeel", "redesign"))).status).toBe(401);
    expect((await GET(request(), params("foreign-salon", "redesign"))).status).toBe(403);
    mocks.context.mockResolvedValueOnce({ success: false });
    expect((await GET(request(), params("beautyfeel", "redesign"))).status).toBe(403);
    expect(mocks.redesign).not.toHaveBeenCalled();
    const result = await GET(request(), params("beautyfeel", "redesign"));
    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.redesign).toHaveBeenCalledWith(ownerContext);
    mocks.redesign.mockResolvedValueOnce(null);
    expect((await GET(request(), params("beautyfeel", "redesign"))).status).toBe(403);
    mocks.redesign.mockRejectedValueOnce(new Error("secret"));
    const error = await GET(request(), params("beautyfeel", "redesign"));
    expect(error.status).toBe(503);
    expect(await error.text()).not.toContain("secret");
  });

  it("requires authentication, matching owner slug, and persisted owner context", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request(), params("beautyfeel", "queue"))).status).toBe(401);
    mocks.session.mockResolvedValueOnce({ user: { id: "staff", role: "EMPLOYEE", businessSlug: "beautyfeel" } });
    expect((await GET(request(), params("beautyfeel", "queue"))).status).toBe(403);
    expect((await GET(request(), params("foreign-salon", "queue"))).status).toBe(403);
    mocks.context.mockResolvedValueOnce({ success: false, error: "Forbidden" });
    expect((await GET(request(), params("beautyfeel", "queue"))).status).toBe(403);
    expect(mocks.queue).not.toHaveBeenCalled();
  });

  it("denies redesign access until the required password change is complete", async () => {
    mocks.session.mockResolvedValue({ user: { id: "owner-1", role: "OWNER", businessSlug: "beautyfeel", mustChangePassword: true } });
    expect((await GET(request(), params("beautyfeel", "redesign"))).status).toBe(403);
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.redesign).not.toHaveBeenCalled();
  });

  it("uses only selected loader, returns private JSON, and rechecks membership", async () => {
    const result = await GET(request("?range=6m"), params("beautyfeel", "financials"));
    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.financials).toHaveBeenCalledWith(ownerContext, "6m");
    expect(mocks.performance).not.toHaveBeenCalled();
    expect(mocks.context).toHaveBeenCalledWith("beautyfeel", "owner-1");
    mocks.queue.mockResolvedValueOnce(null);
    const denied = await GET(request(), params("beautyfeel", "queue"));
    expect(denied.status).toBe(403);
    expect(denied.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns safe private errors when the selected read fails", async () => {
    mocks.today.mockRejectedValueOnce(new Error("database details"));
    const result = await GET(request(), params("beautyfeel", "today"));
    expect(result.status).toBe(503);
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await result.json()).toEqual({ error: "Dashboard data unavailable" });
  });
});
