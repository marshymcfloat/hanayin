import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), actor: vi.fn(), read: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/features/payroll/queries/owner-payroll-preview", () => ({ getOwnerPayrollPreviewData: mocks.read }));

import { GET } from "./route";

const params = (businessSlug = "studio-a") => ({ params: Promise.resolve({ businessSlug }) });
const request = new Request("http://localhost/api/owner-dashboard-preview/studio-a/payroll");

describe("owner payroll preview GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "owner-a", role: "OWNER", businessSlug: "studio-a" } });
    mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", userId: "owner-a", businessId: "business-a", ownerId: 7 });
    mocks.read.mockResolvedValue({ access: "restricted" });
  });

  it("denies malformed slug, anonymous, foreign, non-owner, and revoked membership", async () => {
    expect((await GET(request, params("../other"))).status).toBe(400);
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request, params())).status).toBe(401);
    mocks.session.mockResolvedValueOnce({ user: { id: "owner-a", role: "OWNER", businessSlug: "foreign" } });
    expect((await GET(request, params())).status).toBe(403);
    mocks.session.mockResolvedValueOnce({ user: { id: "employee-a", role: "EMPLOYEE", businessSlug: "studio-a" } });
    expect((await GET(request, params())).status).toBe(403);
    mocks.actor.mockResolvedValueOnce({ success: false, error: "Forbidden" });
    expect((await GET(request, params())).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("returns a private redacted response for a current owner lacking payroll permission", async () => {
    const response = await GET(request, params());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ access: "restricted" });
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ businessId: "business-a" }));
  });

  it("fails closed if owner membership changes during the read", async () => {
    mocks.read.mockResolvedValueOnce(null);
    expect((await GET(request, params())).status).toBe(403);
  });
});
