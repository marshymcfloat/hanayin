import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), ownerWrite: vi.fn(), actor: vi.fn(), directory: vi.fn(), history: vi.fn(), create: vi.fn(), mutationError: vi.fn(), revalidate: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/guards", () => ({ requireOwnerTenantWriteAccess: mocks.ownerWrite }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/features/customers/queries/owner-preview", () => ({ getOwnerPreviewCustomers: mocks.directory, getOwnerPreviewCustomerHistory: mocks.history }));
vi.mock("@/features/customers/services/customer-administration", () => ({ createTenantCustomer: mocks.create, customerMutationError: mocks.mutationError }));

import { GET, POST } from "./route";
import { GET as historyGET } from "./[customerId]/history/route";

const params = (businessSlug = "beautyfeel") => ({ params: Promise.resolve({ businessSlug }) });
const historyParams = (businessSlug = "beautyfeel", customerId = "customer-a") => ({ params: Promise.resolve({ businessSlug, customerId }) });
const request = (query = "") => new Request(`http://localhost/api/owner-dashboard-preview/beautyfeel/customers${query}`);
const post = (body: unknown) => new Request("http://localhost/api/owner-dashboard-preview/beautyfeel/customers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const actor = { success: true, actorType: "OWNER", role: "OWNER", businessId: "business-a", businessSlug: "beautyfeel", ownerId: 7, userId: "owner-a" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "owner-a", role: "OWNER", businessSlug: "beautyfeel" } });
  mocks.ownerWrite.mockResolvedValue({ success: true, session: { user: { id: "owner-a", role: "OWNER", businessSlug: "beautyfeel" } } });
  mocks.actor.mockResolvedValue(actor);
  mocks.directory.mockResolvedValue({ businessName: "BeautyFeel", customers: [], page: 1, pageSize: 25, filteredCount: 0, totals: { customers: 0, newCustomers: 0, returningCustomers: 0, completedVisits: 0 } });
  mocks.history.mockResolvedValue({ customerId: "customer-a", services: [], hasMore: false });
  mocks.create.mockResolvedValue({ id: "new-id", name: "New Person", email: null, phone: null, created_at: new Date("2026-09-28T00:00:00Z"), trust_tier: "NEW", business_id: "private" });
  mocks.mutationError.mockReturnValue("Unable to create customer");
});

describe("owner-preview customers GET", () => {
  it("rejects malformed filters, anonymous, foreign-tenant, employee and revoked actors", async () => {
    expect((await GET(request("?page=0"), params())).status).toBe(400);
    mocks.session.mockResolvedValueOnce(null).mockResolvedValueOnce({ user: { id: "owner-a", role: "OWNER", businessSlug: "other" } }).mockResolvedValueOnce({ user: { id: "employee-a", role: "EMPLOYEE", businessSlug: "beautyfeel" } });
    expect((await GET(request(), params())).status).toBe(401);
    expect((await GET(request(), params())).status).toBe(403);
    expect((await GET(request(), params())).status).toBe(403);
    mocks.actor.mockResolvedValueOnce({ success: false });
    expect((await GET(request(), params())).status).toBe(403);
    expect(mocks.directory).not.toHaveBeenCalled();
  });

  it("passes validated filters and current actor, returning private no-store", async () => {
    const response = await GET(request("?search=Hair&segment=returning&page=2"), params());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.directory).toHaveBeenCalledWith(actor, { search: "Hair", segment: "returning", page: 2 });
  });
});

describe("owner-preview customers POST", () => {
  it("validates input and denies read-only owner access before mutation", async () => {
    expect((await POST(post({ name: " " }), params())).status).toBe(400);
    mocks.ownerWrite.mockResolvedValue({ success: false, error: "Subscription read-only" });
    expect((await POST(post({ name: "New Person" }), params())).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rechecks current owner membership and returns an allowlisted 201 DTO", async () => {
    mocks.actor.mockResolvedValueOnce({ success: false });
    expect((await POST(post({ name: "New Person" }), params())).status).toBe(403);
    const response = await POST(post({ name: " New Person ", email: "" }), params());
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.create).toHaveBeenCalledWith(actor, { name: "New Person", email: undefined, phone: undefined });
    expect(await response.json()).toEqual({ id: "new-id", name: "New Person", email: null, phone: null, joinedAt: "2026-09-28T00:00:00.000Z", completedVisits: 0, lastVisitAt: null });
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/beautyfeel/customers");
  });
});

describe("owner-preview customer history GET", () => {
  it("denies foreign tenants before history read and hides foreign customer existence", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "owner-a", role: "OWNER", businessSlug: "other" } });
    expect((await historyGET(request(), historyParams())).status).toBe(403);
    mocks.history.mockResolvedValue(null);
    expect((await historyGET(request(), historyParams())).status).toBe(404);
    expect(mocks.history).toHaveBeenCalledWith(actor, "customer-a");
  });
});
