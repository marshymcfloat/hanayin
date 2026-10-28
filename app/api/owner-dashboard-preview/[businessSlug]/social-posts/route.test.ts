import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), resolve: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/features/social/queries/owner-social-post-preview", () => ({ resolveOwnerSocialPostsPreviewReadModel: mocks.resolve }));

import { GET } from "./route";

function request(businessSlug: string) {
  return GET(new Request(`http://localhost/api/owner-dashboard-preview/${businessSlug}/social-posts`), {
    params: Promise.resolve({ businessSlug }),
  });
}

describe("social posts preview GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "owner-1", role: "OWNER", businessSlug: "beautyfeel" } });
    mocks.resolve.mockResolvedValue({ success: true, data: { section: "social-posts", posts: [] } });
  });

  it("rejects anonymous, foreign-tenant, and revoked owners", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await request("beautyfeel")).status).toBe(401);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect((await request("other-business")).status).toBe(403);
    expect(mocks.resolve).not.toHaveBeenCalled();
    mocks.resolve.mockResolvedValueOnce({ success: false, reason: "FORBIDDEN", error: "Denied" });
    expect((await request("beautyfeel")).status).toBe(403);
  });

  it("returns owner data only in a private no-store response", async () => {
    const response = await request("beautyfeel");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ section: "social-posts", posts: [] });
  });
});
