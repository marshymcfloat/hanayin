import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), resolve: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/features/catalog/queries/owner-sale-event-preview", () => ({ resolveOwnerSaleEventPreviewReadModel: mocks.resolve }));

import { GET } from "./route";

function request(businessSlug: string) {
  return GET(new Request(`http://localhost/api/owner-dashboard-preview/${businessSlug}/sale-events`), {
    params: Promise.resolve({ businessSlug }),
  });
}

describe("sale events preview GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "owner-1", role: "OWNER", businessSlug: "beautyfeel" } });
    mocks.resolve.mockResolvedValue({ success: true, data: { section: "sale-events", events: [] } });
  });

  it("rejects anonymous, foreign-tenant, and revoked owners before returning private data", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await request("beautyfeel")).status).toBe(401);
    expect(mocks.resolve).not.toHaveBeenCalled();

    expect((await request("other-business")).status).toBe(403);
    expect(mocks.resolve).not.toHaveBeenCalled();

    mocks.resolve.mockResolvedValueOnce({ success: false, reason: "FORBIDDEN", error: "Denied" });
    expect((await request("beautyfeel")).status).toBe(403);
    expect(mocks.resolve).toHaveBeenCalledWith("beautyfeel", "owner-1");
  });

  it("returns a JSON-safe owner DTO with private no-store", async () => {
    const response = await request("beautyfeel");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ section: "sale-events", events: [] });
  });
});
