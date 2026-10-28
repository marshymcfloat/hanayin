import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), actor: vi.fn(), read: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/features/workforce/queries/owner-attendance-preview", () => ({ getOwnerAttendancePreviewData: mocks.read }));

import { GET } from "./route";

const params = (businessSlug = "studio-a") => ({ params: Promise.resolve({ businessSlug }) });
const request = (query = "?date=2026-09-27") => new Request(`http://localhost/api/owner-dashboard-preview/studio-a/attendance${query}`);

describe("owner attendance preview GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "owner-a", role: "OWNER", businessSlug: "studio-a" } });
    mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", userId: "owner-a", businessId: "business-a", ownerId: 7 });
    mocks.read.mockResolvedValue({ businessName: "Studio A", date: "2026-09-27", employees: [], pendingLeaveCount: 0, leaveRequests: [] });
  });

  it("rejects bad slug/date and anonymous, foreign, non-owner, or revoked membership", async () => {
    expect((await GET(request(), params("../other"))).status).toBe(400);
    expect((await GET(request("?date=2026-02-30"), params())).status).toBe(400);
    expect((await GET(request("?date=2026-09-27&date=2026-09-28"), params())).status).toBe(400);
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request(), params())).status).toBe(401);
    mocks.session.mockResolvedValueOnce({ user: { id: "owner-a", role: "OWNER", businessSlug: "other" } });
    expect((await GET(request(), params())).status).toBe(403);
    mocks.session.mockResolvedValueOnce({ user: { id: "owner-a", role: "EMPLOYEE", businessSlug: "studio-a" } });
    expect((await GET(request(), params())).status).toBe(403);
    mocks.actor.mockResolvedValueOnce({ success: false, error: "Forbidden" });
    expect((await GET(request(), params())).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("returns a private DTO for the verified owner and selected day", async () => {
    const response = await GET(request(), params());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.actor).toHaveBeenCalledWith("studio-a", "owner-a");
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ businessId: "business-a" }), "2026-09-27");
    expect((await response.json()).employees).toEqual([]);
  });

  it("fails closed when owner membership changes after authentication", async () => {
    mocks.read.mockResolvedValueOnce(null);
    expect((await GET(request(), params())).status).toBe(403);
  });
});
