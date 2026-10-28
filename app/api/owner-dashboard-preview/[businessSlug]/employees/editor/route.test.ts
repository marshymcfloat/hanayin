import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), context: vi.fn(), editor: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.context }));
vi.mock("@/features/workforce/queries/owner-employee-editor", () => ({ getOwnerEmployeeEditor: mocks.editor }));
import { GET } from "./route";
const request = new Request("http://localhost/api/owner-dashboard-preview/studio/employees/editor");
const params = (businessSlug = "studio") => ({ params: Promise.resolve({ businessSlug }) });
const actor = { success: true, actorType: "OWNER", userId: "owner", ownerId: 1, businessId: "business", businessSlug: "studio" };
beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ user: { id: "owner", role: "OWNER", businessSlug: "studio" } }); mocks.context.mockResolvedValue(actor); mocks.editor.mockResolvedValue({ employees: [], categories: [], defaults: {} }); });
describe("employee editor GET", () => {
  it("rejects invalid, anonymous, employee, foreign and revoked callers before reading settings", async () => {
    expect((await GET(request, params("../other"))).status).toBe(400);
    mocks.session.mockResolvedValueOnce(null).mockResolvedValueOnce({ user: { id: "staff", role: "EMPLOYEE", businessSlug: "studio" } }).mockResolvedValueOnce({ user: { id: "owner", role: "OWNER", businessSlug: "foreign" } });
    expect((await GET(request, params())).status).toBe(401);
    expect((await GET(request, params())).status).toBe(403);
    expect((await GET(request, params())).status).toBe(403);
    mocks.context.mockResolvedValueOnce({ success: false });
    expect((await GET(request, params())).status).toBe(403);
    expect(mocks.editor).not.toHaveBeenCalled();
  });
  it("uses verified identity and never allows HTTP caching", async () => {
    const response = await GET(request, params());
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.editor).toHaveBeenCalledWith(actor); expect(await response.json()).toMatchObject({ employees: [] });
  });
  it("denies revoked membership and hides infrastructure failures", async () => {
    mocks.editor.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("private SQL"));
    expect((await GET(request, params())).status).toBe(403);
    const failed = await GET(request, params()); expect(failed.status).toBe(500); expect(await failed.json()).toEqual({ error: "Unable to load employee settings" });
  });
});
