import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), context: vi.fn(), read: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.context }));
vi.mock("@/features/businesses/queries/owner-business-hours-preview", () => ({ getOwnerBusinessHoursPreviewData: mocks.read }));

import { GET } from "./route";

const params = (businessSlug = "beautyfeel") => ({ params: Promise.resolve({ businessSlug }) });
const request = new Request("http://localhost/api/owner-dashboard-preview/beautyfeel/business-hours");
const actor = { success: true, actorType: "OWNER", userId: "owner-1", businessId: "business-1" };

describe("business hours preview GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "owner-1", role: "OWNER", businessSlug: "beautyfeel" } });
    mocks.context.mockResolvedValue(actor);
    mocks.read.mockResolvedValue({ businessName: "BeautyFeel", hours: [], serviceCategories: [] });
  });

  it("rejects malformed slug, anonymous, foreign tenant, and revoked ownership", async () => {
    expect((await GET(request, params("../other"))).status).toBe(400);
    mocks.session.mockResolvedValueOnce(null).mockResolvedValueOnce({ user: { id: "owner-1", role: "OWNER", businessSlug: "other" } });
    expect((await GET(request, params())).status).toBe(401);
    expect((await GET(request, params())).status).toBe(403);
    mocks.context.mockResolvedValueOnce({ success: false, error: "Forbidden" });
    expect((await GET(request, params())).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("returns private no-store tenant data using verified actor", async () => {
    const response = await GET(request, params());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.context).toHaveBeenCalledWith("beautyfeel", "owner-1");
    expect(mocks.read).toHaveBeenCalledWith(actor);
    expect(await response.json()).toEqual({ businessName: "BeautyFeel", hours: [], serviceCategories: [] });
  });

  it("fails closed when the verified owner no longer matches the read", async () => {
    mocks.read.mockResolvedValue(null);
    expect((await GET(request, params())).status).toBe(403);
  });
});
