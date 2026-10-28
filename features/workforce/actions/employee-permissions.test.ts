import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffPermission, StaffProfile } from "@/prisma/generated/prisma/enums";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  actor: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({
  requireOwnerTenantWriteAccess: mocks.guard,
}));
vi.mock("@/lib/auth/staff-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/staff-access")>()),
  resolveTenantActorContext: mocks.actor,
}));
vi.mock("@/prisma/prisma", () => ({
  prisma: {
    employee: { findFirst: mocks.findFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/services/audit", () => ({ logAudit: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { setEmployeePermissionsAction } from "./employee-permissions";

const input = {
  businessSlug: "test-business",
  employeeId: 101,
  permissions: [StaffPermission.PAYMENT_COLLECT],
};
const tx = {
  employee: {
    findFirst: mocks.findFirst,
    update: mocks.update,
    updateMany: mocks.updateMany,
  },
};

describe("employee permission action", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.guard.mockResolvedValue({
      success: true,
      session: { user: { id: "owner-user" } },
    });
    mocks.actor.mockResolvedValue({
      success: true,
      actorType: "OWNER",
      userId: "owner-user",
      businessId: "biz-1",
      businessSlug: "test-business",
    });
    mocks.findFirst.mockResolvedValue({
      id: 101,
      profile: StaffProfile.STAFF,
      permissions: [StaffPermission.BOOKING_CREATE],
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
  });

  it("rejects invalid input before authentication", async () => {
    expect(await setEmployeePermissionsAction({ ...input, employeeId: -1 })).toEqual({
      success: false,
      error: "Invalid input",
      code: "InvalidInput",
    });
    expect(mocks.guard).not.toHaveBeenCalled();
  });

  it.each(["Unauthorized", "Forbidden", "Subscription is read-only"])(
    "preserves guard denial: %s",
    async (error) => {
      mocks.guard.mockResolvedValue({ success: false, error });
      expect(await setEmployeePermissionsAction(input)).toEqual({
        success: false,
        error,
        code: error === "Unauthorized" || error === "Forbidden" ? error : undefined,
      });
      expect(mocks.actor).not.toHaveBeenCalled();
      expect(mocks.findFirst).not.toHaveBeenCalled();
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it("rejects a non-owner current actor even if the owner guard passed", async () => {
    mocks.actor.mockResolvedValue({
      success: true,
      actorType: "EMPLOYEE",
      businessId: "biz-1",
      userId: "owner-user",
    });
    expect(await setEmployeePermissionsAction(input)).toEqual({
      success: false,
      error: "Forbidden",
      code: "Forbidden",
    });
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("preserves missing employee denial", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await setEmployeePermissionsAction(input)).toEqual({
      success: false,
      error: "Employee not found.",
      code: "NOT_FOUND",
    });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("preserves idempotent duplicate permission semantics", async () => {
    mocks.findFirst.mockResolvedValue({
      id: 101,
      profile: StaffProfile.CASHIER,
      permissions: input.permissions,
    });
    expect(await setEmployeePermissionsAction({
      ...input,
      permissions: [...input.permissions, ...input.permissions],
    })).toEqual({ success: true, employeeId: 101, permissions: input.permissions });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("preserves success shape, audit identity, and tenant invalidation", async () => {
    expect(await setEmployeePermissionsAction(input)).toEqual({
      success: true,
      employeeId: 101,
      permissions: input.permissions,
    });
    expect(mocks.audit).toHaveBeenCalledWith(tx, expect.objectContaining({
      actorId: "owner-user",
      businessId: "biz-1",
      changes: {
        before: { permissions: [StaffPermission.BOOKING_CREATE] },
        after: { permissions: input.permissions, mode: "PERMISSIONS_CHANGED" },
      },
    }));
    expect(mocks.revalidate).toHaveBeenCalledTimes(1);
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/test-business/employees");
  });

  it("denies failed current membership resolution before employee reads", async () => {
    mocks.actor.mockResolvedValue({ success: false, error: "Forbidden" });
    expect(await setEmployeePermissionsAction(input)).toEqual({
      success: false, error: "Forbidden", code: "Forbidden",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("does not invalidate cache on stale permission state", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect(await setEmployeePermissionsAction(input)).toEqual({
      success: false,
      error: "Employee permissions changed. Refresh and try again.",
    });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("returns a safe audit failure without invalidating cache", async () => {
    mocks.audit.mockRejectedValue(new Error("private audit SQL details"));
    expect(await setEmployeePermissionsAction(input)).toEqual({
      success: false,
      error: "Unable to update employee permissions.",
    });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
