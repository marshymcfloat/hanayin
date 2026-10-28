import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VoucherActorContext } from "@/features/catalog/voucher-access";
const db = vi.hoisted(() => ({ business: { findFirst: vi.fn() }, voucher: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() } }));
vi.mock("@/prisma/prisma", () => ({ prisma: db }));
vi.mock("@/features/catalog/voucher-code", () => ({ generateVoucherSuffix: vi.fn(() => "ABC234"), VOUCHER_CODE_MAX_ATTEMPTS: 10 }));
import { generateVoucherSuffix } from "@/features/catalog/voucher-code";
import { listTenantVouchers, generateTenantVoucherCode, verifyPublicVoucher } from "./voucher-administration";
import { voucherBusinessWhere } from "@/features/catalog/voucher-access";
import { voucherSelect, publicVoucherSelect } from "@/features/catalog/voucher-select";
const owner = { success: true, actorType: "OWNER", role: "OWNER", businessId: "biz", businessSlug: "demo", userId: "user", ownerId: 7 } as VoucherActorContext;
const employee = { ...owner, actorType: "EMPLOYEE", role: "EMPLOYEE", employeeId: 3, ownerId: null } as VoucherActorContext;
const now = new Date("2030-01-01");
const voucher = { id: 1, code: "VO-A", type: "FLAT" as const, value: 10, minimum_amount: 0, expires_at: now, is_active: true, used_by_id: null };
describe("voucher queries", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(generateVoucherSuffix).mockReturnValue("ABC234"); db.business.findFirst.mockResolvedValue({ initials: "vo" }); db.voucher.findUnique.mockResolvedValue(null); db.voucher.findFirst.mockResolvedValue(voucher); db.voucher.findMany.mockResolvedValue([]); });
  for (const [name, context] of [["owner", owner], ["employee", employee]] as const) {
    it(`${name} list scopes parent and linked usage with explicit scalar contract`, async () => { expect(await listTenantVouchers(context)).toEqual([]); expect(db.voucher.findMany).toHaveBeenCalledWith({ where: { business_id: "biz", business: voucherBusinessWhere(context) }, orderBy: { created_at: "desc" }, select: { ...voucherSelect, used_by: { where: { business_id: "biz" }, select: { id: true, created_at: true } } } }); });
    it(`${name} generate rechecks membership and does not reserve`, async () => { expect(await generateTenantVoucherCode(context)).toEqual({ success: true, code: "VO-ABC234" }); expect(db.business.findFirst).toHaveBeenCalledWith({ where: voucherBusinessWhere(context), select: { initials: true } }); });
  }
  it("fallback prefix remains VO", async () => { db.business.findFirst.mockResolvedValue({ initials: null }); expect(await generateTenantVoucherCode(owner)).toEqual({ success: true, code: "VO-ABC234" }); });
  it("missing current business denies code generation", async () => { db.business.findFirst.mockResolvedValue(null); expect(await generateTenantVoucherCode(owner)).toEqual({ success: false, error: "Business not found" }); expect(db.voucher.findUnique).not.toHaveBeenCalled(); });
  it("retries collisions globally then succeeds without mutation", async () => { db.voucher.findUnique.mockResolvedValueOnce({ id: 9 }).mockResolvedValueOnce(null); expect(await generateTenantVoucherCode(owner)).toEqual({ success: true, code: "VO-ABC234" }); expect(generateVoucherSuffix).toHaveBeenCalledTimes(2); expect(db.voucher.findUnique).toHaveBeenCalledWith({ where: { code: "VO-ABC234" }, select: { id: true } }); });
  it("ten collisions exhaust exact legacy limit", async () => { db.voucher.findUnique.mockResolvedValue({ id: 1 }); expect(await generateTenantVoucherCode(owner)).toEqual({ success: false, error: "Couldn't generate a unique code. Try again." }); expect(generateVoucherSuffix).toHaveBeenCalledTimes(10); });
  it("public verification only loads business-scoped safe voucher fields", async () => { expect((await verifyPublicVoucher("VO-A", "demo", 10, now)).data).toMatchObject({ discountAmount: 10, finalPrice: 0 }); expect(db.voucher.findFirst).toHaveBeenCalledWith({ where: { code: "VO-A", business: { slug: "demo" } }, select: publicVoucherSelect }); expect(db.voucher.findUnique).not.toHaveBeenCalled(); });
  it("preserves foreign-code error without loading foreign voucher or customer", async () => { db.voucher.findFirst.mockResolvedValue(null); db.voucher.findUnique.mockResolvedValue({ id: 9 }); expect(await verifyPublicVoucher("OTHER", "demo", 10, now)).toEqual({ success: false, error: "Invalid voucher for this business" }); expect(db.voucher.findUnique).toHaveBeenCalledWith({ where: { code: "OTHER" }, select: { id: true } }); });
  it("preserves missing-code error", async () => { db.voucher.findFirst.mockResolvedValue(null); expect(await verifyPublicVoucher("MISSING", "demo", 10, now)).toEqual({ success: false, error: "Voucher code not found" }); });
  it("default time can verify future expiry", async () => { db.voucher.findFirst.mockResolvedValue({ ...voucher, expires_at: new Date("9999-01-01") }); expect((await verifyPublicVoucher("VO-A", "demo", 10)).success).toBe(true); });
  it("propagates persistence errors to safe transport mapping", async () => { const error = new Error("SQL"); db.voucher.findFirst.mockRejectedValue(error); await expect(verifyPublicVoucher("VO-A", "demo", 10, now)).rejects.toBe(error); });
});
