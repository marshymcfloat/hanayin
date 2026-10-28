import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), context: vi.fn(), employees: vi.fn(), owners: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.context }));
vi.mock("@/features/workforce/queries/owner-preview-directory", () => ({ getOwnerPreviewEmployees: mocks.employees, getOwnerPreviewOwners: mocks.owners }));

import { GET as employeesGET } from "./[businessSlug]/employees/route";
import { GET as ownersGET } from "./[businessSlug]/owners/route";

const request = new Request("http://localhost/api/owner-dashboard-preview/beautyfeel/employees");
const params = (businessSlug = "beautyfeel") => ({ params: Promise.resolve({ businessSlug }) });
const actor = { success: true, actorType: "OWNER", userId: "owner-1", ownerId: 1, businessId: "business-1", businessSlug: "beautyfeel" };

describe.each([
  ["employees", employeesGET, "employees"],
  ["owners", ownersGET, "owners"],
] as const)("%s preview GET", (_name, GET, read) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "owner-1", role: "OWNER", businessSlug: "beautyfeel" } });
    mocks.context.mockResolvedValue(actor);
    mocks[read].mockResolvedValue({ businessName: "BeautyFeel", [read]: [] });
  });

  it("rejects malformed slugs, anonymous, foreign-tenant and revoked actors before persistence", async () => {
    expect((await GET(request, params("../other"))).status).toBe(400);
    mocks.session.mockResolvedValueOnce(null).mockResolvedValueOnce({ user: { id: "owner-1", role: "OWNER", businessSlug: "other" } });
    expect((await GET(request, params())).status).toBe(401);
    expect((await GET(request, params())).status).toBe(403);
    mocks.context.mockResolvedValueOnce({ success: false, error: "Forbidden" });
    expect((await GET(request, params())).status).toBe(403);
    expect(mocks[read]).not.toHaveBeenCalled();
  });

  it("denies an employee session even in the matching tenant", async () => {
    mocks.session.mockResolvedValue({ user: { id: "employee-1", role: "EMPLOYEE", businessSlug: "beautyfeel" } });
    expect((await GET(request, params())).status).toBe(403);
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks[read]).not.toHaveBeenCalled();
  });

  it("returns only the verified tenant DTO with private no-store", async () => {
    const response = await GET(request, params());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.context).toHaveBeenCalledWith("beautyfeel", "owner-1");
    expect(mocks[read]).toHaveBeenCalledWith(actor);
    expect((await response.json())[read]).toEqual([]);
  });

  it("fails closed on missing membership and does not leak infrastructure errors", async () => {
    mocks[read].mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("database details"));
    expect((await GET(request, params())).status).toBe(403);
    const response = await GET(request, params());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("database details");
  });
});
