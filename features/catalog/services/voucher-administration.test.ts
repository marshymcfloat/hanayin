import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VoucherActorContext } from "@/features/catalog/voucher-access";
const db = vi.hoisted(() => ({ business: { findFirst: vi.fn() }, voucher: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() }, $transaction: vi.fn() }));
vi.mock("@/prisma/prisma", () => ({ prisma: db }));
import { createTenantVoucher, deleteTenantVoucher, setTenantVoucherActive, updateTenantVoucher, VoucherAdministrationError, voucherAdministrationError } from "./voucher-administration";
import { voucherBusinessWhere } from "@/features/catalog/voucher-access";
import { voucherSelect } from "@/features/catalog/voucher-select";
const owner = { success: true, actorType: "OWNER", role: "OWNER", businessId: "biz", businessSlug: "demo", userId: "user", ownerId: 7 } as VoucherActorContext;
const employee = { ...owner, actorType: "EMPLOYEE", role: "EMPLOYEE", employeeId: 3, ownerId: null } as VoucherActorContext;
const input = { code: "VO-A", type: "FLAT" as const, value: 20, minimum_amount: 0, expires_at: new Date("2030-01-01") };
describe("tenant voucher writes", () => {
  beforeEach(() => { vi.resetAllMocks(); db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db)); db.business.findFirst.mockResolvedValue({ id: "biz" }); db.voucher.findUnique.mockResolvedValue(null); db.voucher.findFirst.mockResolvedValue({ id: 1 }); db.voucher.create.mockResolvedValue({ id: 1 }); db.voucher.update.mockResolvedValue({ id: 1 }); db.voucher.updateMany.mockResolvedValue({ count: 1 }); db.voucher.deleteMany.mockResolvedValue({ count: 1 }); });
  for (const [name, context] of [["owner", owner], ["employee", employee]] as const) {
    it(`${name} create rechecks exact current membership inside bounded transaction`, async () => {
      expect(await createTenantVoucher(context, input)).toEqual({ id: 1 });
      expect(db.business.findFirst).toHaveBeenCalledWith({ where: voucherBusinessWhere(context), select: { id: true } });
      expect(db.voucher.create).toHaveBeenCalledWith({ data: { ...input, business_id: "biz", is_active: true }, select: voucherSelect });
      expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
    });
    it(`${name} current role/membership change prevents creation`, async () => { db.business.findFirst.mockResolvedValue(null); await expect(createTenantVoucher(context, input)).rejects.toThrow("Business not found"); expect(db.voucher.create).not.toHaveBeenCalled(); expect(db.voucher.findUnique).not.toHaveBeenCalled(); });
    it(`${name} delete uses tenant/current-member conditional predicate`, async () => { await deleteTenantVoucher(context, 1); expect(db.voucher.deleteMany).toHaveBeenCalledWith({ where: { id: 1, business_id: "biz", business: voucherBusinessWhere(context) } }); });
    it(`${name} changed membership prevents deletion`, async () => { db.business.findFirst.mockResolvedValue(null); await expect(deleteTenantVoucher(context, 1)).rejects.toThrow("Voucher not found or unauthorized"); expect(db.voucher.deleteMany).not.toHaveBeenCalled(); });
  }
  it("checks global code uniqueness using only id", async () => { db.voucher.findUnique.mockResolvedValue({ id: 88 }); await expect(createTenantVoucher(owner, input)).rejects.toThrow("Voucher code already exists"); expect(db.voucher.findUnique).toHaveBeenCalledWith({ where: { code: "VO-A" }, select: { id: true } }); expect(db.voucher.create).not.toHaveBeenCalled(); });
  it("maps concurrent unique failure safely outside failed PostgreSQL transaction", async () => { db.voucher.create.mockRejectedValue({ code: "P2002", message: "private constraint" }); await expect(createTenantVoucher(owner, input)).rejects.toThrow("Voucher code already exists"); expect(db.$transaction).toHaveBeenCalledTimes(1); });
  it("does not mask nonunique database failure", async () => { const error = new Error("private database"); db.voucher.create.mockRejectedValue(error); await expect(createTenantVoucher(owner, input)).rejects.toBe(error); });
  it("foreign or absent conditional delete rolls back by throwing", async () => { db.voucher.deleteMany.mockResolvedValue({ count: 0 }); await expect(deleteTenantVoucher(owner, 99)).rejects.toThrow("Voucher not found or unauthorized"); });
  it("updates only a tenant-owned voucher after current membership and uniqueness checks", async () => {
    await expect(updateTenantVoucher(owner, 1, input)).resolves.toEqual({ id: 1 });
    expect(db.voucher.findFirst).toHaveBeenNthCalledWith(1, { where: { id: 1, business_id: "biz", business: voucherBusinessWhere(owner) }, select: { id: true } });
    expect(db.voucher.findUnique).toHaveBeenCalledWith({ where: { code: "VO-A" }, select: { id: true } });
    expect(db.voucher.update).toHaveBeenCalledWith({ where: { id: 1 }, data: input, select: voucherSelect });
  });
  it("archives and restores with one tenant/current-member conditional update", async () => {
    await setTenantVoucherActive(owner, 1, false);
    expect(db.voucher.updateMany).toHaveBeenCalledWith({ where: { id: 1, business_id: "biz", business: voucherBusinessWhere(owner) }, data: { is_active: false } });
  });
  it("rejects foreign update and status targets", async () => {
    db.voucher.findFirst.mockResolvedValueOnce(null);
    await expect(updateTenantVoucher(owner, 99, input)).rejects.toThrow("Voucher not found or unauthorized");
    db.voucher.updateMany.mockResolvedValue({ count: 0 });
    await expect(setTenantVoucherActive(owner, 99, false)).rejects.toThrow("Voucher not found or unauthorized");
  });
  it("does not mask delete transaction failure", async () => { const error = new Error("private"); db.$transaction.mockRejectedValue(error); await expect(deleteTenantVoucher(owner, 1)).rejects.toBe(error); });
  it("returns only approved domain messages", () => expect(voucherAdministrationError(new VoucherAdministrationError("Voucher code already exists"), "Fallback")).toBe("Voucher code already exists"));
  it("maps serialization conflict without SQL", () => expect(voucherAdministrationError({ code: "P2034", message: "SQL" }, "Fallback")).toBe("Voucher changed. Refresh and try again."));
  for (const error of [new Error("private"), { code: "P2002", message: "private" }, null, undefined, "private", 1]) it(`redacts unknown ${String(error)}`, () => expect(voucherAdministrationError(error, "Fallback")).toBe("Fallback"));
});
