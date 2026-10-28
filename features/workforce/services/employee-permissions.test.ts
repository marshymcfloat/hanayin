import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantActorContext } from "@/lib/auth/staff-access";
import { StaffPermission, StaffProfile } from "@/prisma/generated/prisma/enums";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  audit: vi.fn(),
  committed: vi.fn(),
}));
vi.mock("@/prisma/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/services/audit", () => ({ logAudit: mocks.audit }));

import { getDefaultPermissionsForProfile } from "@/lib/auth/staff-access";
import { setEmployeePermissions } from "./employee-permissions";

const context = {
  success: true,
  actorType: "OWNER",
  userId: "owner-user",
  businessId: "biz-1",
} as Extract<TenantActorContext, { success: true; actorType: "OWNER" }>;
const tx = { employee: { findFirst: mocks.findFirst, updateMany: mocks.updateMany } };
const input = { context, employeeId: 101, permissions: [StaffPermission.PAYMENT_COLLECT] };

describe("atomic employee permission update", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(async (callback) => {
      const result = await callback(tx);
      mocks.committed();
      return result;
    });
    mocks.findFirst.mockResolvedValue({
      id: 101,
      profile: StaffProfile.STAFF,
      permissions: [StaffPermission.BOOKING_CREATE],
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("reads and conditionally replaces tenant-scoped state before audit and commit", async () => {
    expect(await setEmployeePermissions(input)).toEqual({
      result: { success: true, employeeId: 101, permissions: input.permissions },
      changed: true,
    });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: 101, business_id: "biz-1" },
      select: { id: true, profile: true, permissions: true },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: 101,
        business_id: "biz-1",
        profile: StaffProfile.STAFF,
        permissions: { equals: [StaffPermission.BOOKING_CREATE] },
      },
      data: { permissions: input.permissions },
    });
    expect(mocks.audit).toHaveBeenCalledWith(tx, expect.objectContaining({
      businessId: "biz-1", actorId: "owner-user", entityId: "101",
    }));
    expect(mocks.updateMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.audit.mock.invocationCallOrder[0]);
    expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.committed.mock.invocationCallOrder[0]);
  });

  it.each([0, 2])("aborts an incomplete affected-row count: %s", async (count) => {
    mocks.updateMany.mockResolvedValue({ count });
    expect(await setEmployeePermissions(input)).toEqual({
      result: { success: false, error: "Employee permissions changed. Refresh and try again." },
      changed: false,
    });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.committed).not.toHaveBeenCalled();
  });

  it("returns missing membership without writes or audit", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await setEmployeePermissions(input)).toEqual({
      result: { success: false, error: "Employee not found.", code: "NOT_FOUND" },
      changed: false,
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(Object.values(StaffProfile))("uses %s defaults for an empty permission list", async (profile) => {
    mocks.findFirst.mockResolvedValue({ id: 101, profile, permissions: [] });
    const permissions = getDefaultPermissionsForProfile(profile);
    expect(await setEmployeePermissions({ ...input, permissions: [] })).toEqual({
      result: { success: true, employeeId: 101, permissions },
      changed: true,
    });
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { permissions } }));
  });

  it("treats reordered and repeated permissions as a no-op", async () => {
    const permissions = [StaffPermission.PAYMENT_COLLECT, StaffPermission.BOOKING_CREATE];
    mocks.findFirst.mockResolvedValue({ id: 101, profile: StaffProfile.STAFF, permissions });
    const result = await setEmployeePermissions({
      ...input,
      permissions: [permissions[1], permissions[0], permissions[1]],
    });
    expect(result.changed).toBe(false);
    expect(result.result.success).toBe(true);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("does not commit when required audit fails", async () => {
    mocks.audit.mockRejectedValue(new Error("private audit SQL"));
    expect(await setEmployeePermissions(input)).toEqual({
      result: { success: false, error: "Unable to update employee permissions." },
      changed: false,
    });
    expect(mocks.committed).not.toHaveBeenCalled();
  });

  it("maps serialization conflicts to a safe retry outcome", async () => {
    mocks.transaction.mockRejectedValue({ code: "P2034", message: "private SQL" });
    expect(await setEmployeePermissions(input)).toEqual({
      result: { success: false, error: "Employee permissions changed. Refresh and try again." },
      changed: false,
    });
  });

  it("denies non-owner contexts even at the internal service boundary", async () => {
    expect(await setEmployeePermissions({
      ...input,
      context: { ...context, actorType: "EMPLOYEE" } as unknown as typeof context,
    })).toEqual({
      result: { success: false, error: "Forbidden", code: "Forbidden" },
      changed: false,
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
