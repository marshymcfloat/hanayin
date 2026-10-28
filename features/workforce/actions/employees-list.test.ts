import { beforeEach, describe, expect, it, vi } from "vitest";
import { listBusinessEmployeesAction } from "./employees-list";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/prisma/prisma", () => ({ prisma: { employee: { findMany: mocks.list } } }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ success: true, businessSlug: "verified-slug", session: { user: { id: "verified-user", role: "OWNER" } } });
  mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", role: "OWNER", userId: "verified-user", ownerId: 7, employeeId: null, businessId: "verified-business", businessSlug: "verified-slug", profile: null, permissions: [] });
  mocks.list.mockResolvedValue([]);
});

describe("tenant employee picker", () => {
  it("denies missing authentication before membership and employee reads", async () => {
    mocks.auth.mockResolvedValue({ success: false, error: "Unauthorized" });
    expect(await listBusinessEmployeesAction()).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("denies stale membership before employee reads", async () => {
    mocks.actor.mockResolvedValue({ success: false, error: "Forbidden" });
    expect(await listBusinessEmployeesAction()).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("preserves the verified tenant scope, narrow display selection, sorting and empty result", async () => {
    expect(await listBusinessEmployeesAction()).toEqual({ success: true, employees: [] });
    expect(mocks.actor).toHaveBeenCalledWith("verified-slug", "verified-user");
    expect(mocks.list).toHaveBeenCalledWith({ where: { business_id: "verified-business", archived_at: null }, select: { id: true, profile: true, user: { select: { name: true } } }, orderBy: { user: { name: "asc" } } });
  });

  it.each(["STAFF", "MANAGER", "CASHIER"])("permits current %s members without queue-override grants", async profile => {
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "verified-slug", session: { user: { id: "verified-user", role: "EMPLOYEE" } } });
    mocks.actor.mockResolvedValue({ success: true, actorType: "EMPLOYEE", role: "EMPLOYEE", userId: "verified-user", employeeId: 1, ownerId: null, profile, permissions: [], businessId: "verified-business", businessSlug: "verified-slug" });
    mocks.list.mockResolvedValue([{ id: 1, profile, user: { name: "Fixture", hashed_password: "private-fixture" }, privateField: "private" }]);
    expect(await listBusinessEmployeesAction()).toEqual({ success: true, employees: [{ id: 1, name: "Fixture", profile }] });
  });

  it.each(["auth", "actor", "list"] as const)("returns a safe error for %s infrastructure failures", async target => {
    mocks[target].mockRejectedValue(new Error("private database fixture"));
    expect(await listBusinessEmployeesAction()).toEqual({ success: false, error: "Unable to load employees." });
    if (target !== "list") expect(mocks.list).not.toHaveBeenCalled();
  });
});
