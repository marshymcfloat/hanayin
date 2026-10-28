import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), actor: vi.fn(), list: vi.fn(), summary: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/features/bookings/queries/owner-bookings-preview", () => ({ getOwnerBookingsPreviewList: mocks.list, getOwnerBookingsPreviewSummary: mocks.summary }));

import { GET } from "./route";

const params = (section = "list", businessSlug = "studio-a") => ({ params: Promise.resolve({ businessSlug, section }) });
const request = (section = "list", query = "?date=2026-09-28") => new Request(`http://localhost/api/owner-dashboard-preview/studio-a/bookings/${section}${query}`);

describe("owner bookings preview GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "owner-a", role: "OWNER", businessSlug: "studio-a" } });
    mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", userId: "owner-a", businessId: "business-a", ownerId: 7 });
    mocks.list.mockResolvedValue({ bookings: [], totalCount: 0, page: 1, pageSize: 25, totalPages: 0 });
    mocks.summary.mockResolvedValue({ date: "2026-09-28", totalBookings: 0 });
  });

  it("rejects malformed dates, filters, anonymous, foreign, and revoked access", async () => {
    expect((await GET(request(), params("nope"))).status).toBe(400);
    expect((await GET(request("list", "?date=2026-02-30"), params())).status).toBe(400);
    expect((await GET(request("list", "?date=2026-09-28&status=UNKNOWN"), params())).status).toBe(400);
    expect((await GET(request("list", "?date=2026-09-28&date=2026-09-29"), params())).status).toBe(400);
    expect((await GET(request("list", "?date=2026-09-28&page=10001"), params())).status).toBe(400);
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request(), params())).status).toBe(401);
    mocks.session.mockResolvedValueOnce({ user: { id: "owner-a", role: "OWNER", businessSlug: "other" } });
    expect((await GET(request(), params())).status).toBe(403);
    mocks.actor.mockResolvedValueOnce({ success: false });
    expect((await GET(request(), params())).status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("returns private validated list and summary for current owner", async () => {
    const list = await GET(request("list", "?date=2026-09-28&status=HOLD&q=lash&page=2"), params());
    expect(list.status).toBe(200);
    expect(list.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ businessId: "business-a" }), { date: "2026-09-28", status: "HOLD", q: "lash", page: 2 });
    const summary = await GET(request("summary"), params("summary"));
    expect(summary.status).toBe(200);
    expect(mocks.summary).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 7 }), "2026-09-28");
    const allDates = await GET(request("list", "?status=ACCEPTED"), params());
    expect(allDates.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ businessId: "business-a" }), { date: undefined, status: "ACCEPTED", q: "", page: 1 });
    expect((await GET(request("summary", ""), params("summary"))).status).toBe(400);
  });
});
