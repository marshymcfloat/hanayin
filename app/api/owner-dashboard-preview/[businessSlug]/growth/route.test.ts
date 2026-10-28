import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), context: vi.fn(), read: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.context }));
vi.mock("@/features/growth/queries/owner-preview", () => ({ getOwnerGrowthPreviewData: mocks.read }));

import { GET } from "./route";

const params = { params: Promise.resolve({ businessSlug: "beautyfeel" }) };
const request = (query = "") => new Request(`http://localhost/api/owner-dashboard-preview/beautyfeel/growth${query}`);
const owner = { user: { id: "owner-1", role: "OWNER", businessSlug: "beautyfeel" } };
const context = { success: true, actorType: "OWNER", userId: "owner-1", businessId: "business-1" };

describe("growth preview GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue(owner);
    mocks.context.mockResolvedValue(context);
    mocks.read.mockResolvedValue({ range: "30d", kpis: [] });
  });

  it("rejects invalid range without reading data", async () => {
    const response = await GET(request("?range=365d"), params);
    expect(response.status).toBe(400);
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

  it("uses current owner context and returns private no-store JSON", async () => {
    const response = await GET(request("?range=7d"), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.context).toHaveBeenCalledWith("beautyfeel", "owner-1");
    expect(mocks.read).toHaveBeenCalledWith(context, "7d");
  });
});
