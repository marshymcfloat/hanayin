import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAuthenticatedOwnerPermission, requireOwnerPermission } from "./owner-access";
import { OwnerPermission } from "@/prisma/generated/prisma/enums";

const mocks = vi.hoisted(() => ({ session: vi.fn(), subscription: vi.fn(), actor: vi.fn(), owner: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/features/billing/subscription-service", () => ({ getTenantAccessState: mocks.subscription, SUBSCRIPTION_READ_ONLY_ERROR: "Subscription is read only" }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/prisma/prisma", () => ({ prisma: { owner: { findFirst: mocks.owner } } }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "fixture-user", role: "OWNER", businessSlug: "fixture-slug" } });
  mocks.subscription.mockResolvedValue({ exists: true, readOnly: false });
  mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", ownerId: 7, userId: "fixture-user", businessId: "fixture-business", businessSlug: "fixture-slug" });
  mocks.owner.mockResolvedValue({ id: 7 });
});

describe("session-derived owner write capability", () => {
  it("authenticates once and derives the tenant and actor from the verified session", async () => {
    expect((await requireAuthenticatedOwnerPermission(OwnerPermission.SETTINGS_MANAGE)).success).toBe(true);
    expect(mocks.session).toHaveBeenCalledTimes(1);
    expect(mocks.subscription).toHaveBeenCalledExactlyOnceWith("fixture-slug");
    expect(mocks.actor).toHaveBeenCalledExactlyOnceWith("fixture-slug", "fixture-user");
    expect(mocks.owner).toHaveBeenCalledWith({ where: { id: 7, business_id: "fixture-business", user_id: "fixture-user", user: { role: "OWNER" }, permissions: { has: "SETTINGS_MANAGE" } }, select: { id: true } });
  });

  it.each([null, { user: { id: "fixture-user", role: "OWNER" } }])("denies missing identity or tenant %j", async session => {
    mocks.session.mockResolvedValue(session);
    expect(await requireAuthenticatedOwnerPermission(OwnerPermission.SETTINGS_MANAGE)).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.owner).not.toHaveBeenCalled();
  });

  it.each(["STAFF", "MANAGER", "CASHIER", "PLATFORM_ADMIN"])("does not grant tenant owner capability to %s", async profile => {
    mocks.session.mockResolvedValue({ user: { id: "fixture-user", businessSlug: "fixture-slug", role: profile === "PLATFORM_ADMIN" ? "PLATFORM_ADMIN" : "EMPLOYEE", profile } });
    expect(await requireAuthenticatedOwnerPermission(OwnerPermission.SETTINGS_MANAGE)).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.owner).not.toHaveBeenCalled();
  });

  it("applies the subscription write gate before membership reads", async () => {
    mocks.subscription.mockResolvedValue({ exists: true, readOnly: true });
    expect(await requireAuthenticatedOwnerPermission(OwnerPermission.SETTINGS_MANAGE)).toEqual({ success: false, error: "Subscription is read only" });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.owner).not.toHaveBeenCalled();
  });

  it.each([{ success: false, error: "Forbidden" }, { success: true, actorType: "EMPLOYEE" }])("denies stale owner membership %j", async actor => {
    mocks.actor.mockResolvedValue(actor);
    expect(await requireAuthenticatedOwnerPermission(OwnerPermission.SETTINGS_MANAGE)).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.owner).not.toHaveBeenCalled();
  });

  it("does not implicitly grant a missing capability", async () => {
    mocks.owner.mockResolvedValue(null);
    expect(await requireAuthenticatedOwnerPermission(OwnerPermission.SETTINGS_MANAGE)).toEqual({ success: false, error: "Forbidden" });
  });
});

describe("delegated owner write capability", () => {
  it("requires current owner membership and the exact requested stored capability", async () => {
    const result = await requireOwnerPermission("fixture-slug", OwnerPermission.SETTINGS_MANAGE);
    expect(result.success).toBe(true);
    expect(mocks.subscription).toHaveBeenCalledWith("fixture-slug");
    expect(mocks.actor).toHaveBeenCalledWith("fixture-slug", "fixture-user");
    expect(mocks.owner).toHaveBeenCalledWith({ where: { id: 7, business_id: "fixture-business", user_id: "fixture-user", user: { role: "OWNER" }, permissions: { has: "SETTINGS_MANAGE" } }, select: { id: true } });
  });

  it.each([null, { user: { id: "fixture-user", role: "OWNER" } }])("denies missing identity or tenant %j", async session => {
    mocks.session.mockResolvedValue(session);
    expect(await requireOwnerPermission("fixture-slug", OwnerPermission.SETTINGS_MANAGE)).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.owner).not.toHaveBeenCalled();
  });

  it("denies mismatched tenant before tenant subscription/membership queries", async () => {
    expect(await requireOwnerPermission("foreign-slug", OwnerPermission.SETTINGS_MANAGE)).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.subscription).not.toHaveBeenCalled();
    expect(mocks.actor).not.toHaveBeenCalled();
  });

  it.each(["STAFF", "MANAGER", "CASHIER", "PLATFORM_ADMIN"])("does not grant owner settings to %s", async profile => {
    mocks.session.mockResolvedValue({ user: { id: "fixture-user", businessSlug: "fixture-slug", role: profile === "PLATFORM_ADMIN" ? "PLATFORM_ADMIN" : "EMPLOYEE", profile } });
    expect(await requireOwnerPermission("fixture-slug", OwnerPermission.SETTINGS_MANAGE)).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.owner).not.toHaveBeenCalled();
  });

  it("retains the subscription read-only gate before membership/capability reads", async () => {
    mocks.subscription.mockResolvedValue({ exists: true, readOnly: true });
    expect(await requireOwnerPermission("fixture-slug", OwnerPermission.SETTINGS_MANAGE)).toEqual({ success: false, error: "Subscription is read only" });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.owner).not.toHaveBeenCalled();
  });

  it("denies stale owner identity and owner sessions whose current role is employee", async () => {
    mocks.actor.mockResolvedValueOnce({ success: false, error: "Forbidden" });
    expect(await requireOwnerPermission("fixture-slug", OwnerPermission.SETTINGS_MANAGE)).toEqual({ success: false, error: "Forbidden" });
    mocks.actor.mockResolvedValueOnce({ success: true, actorType: "EMPLOYEE" });
    expect(await requireOwnerPermission("fixture-slug", OwnerPermission.SETTINGS_MANAGE)).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.owner).not.toHaveBeenCalled();
  });

  it.each([true, false])("does not implicitly bypass missing permissions for primary=%s", async isPrimary => {
    mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", ownerId: 7, userId: "fixture-user", businessId: "fixture-business", is_primary: isPrimary });
    mocks.owner.mockResolvedValue(null);
    expect(await requireOwnerPermission("fixture-slug", OwnerPermission.SETTINGS_MANAGE)).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.owner.mock.calls[0][0].where.permissions).toEqual({ has: "SETTINGS_MANAGE" });
    expect(mocks.owner.mock.calls[0][0].where).not.toHaveProperty("is_primary");
  });
});
