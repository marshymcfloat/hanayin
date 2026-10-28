import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => vi.fn());
const resolve = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({
  business: { findUnique: vi.fn(), findFirst: vi.fn() },
  voucher: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: auth }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: resolve }));
vi.mock("@/prisma/prisma", () => ({ prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("crypto", () => ({ default: { randomInt: vi.fn(() => 0) } }));
import { revalidatePath } from "next/cache";
import { createVoucherAction, deleteVoucherAction, generateVoucherCodeAction, getVouchersAction, setVoucherActiveAction, updateVoucherAction, verifyVoucherAction } from "./vouchers";

const input = { code: "  vo-summer  ", type: "PERCENTAGE" as const, value: 20, minimum_amount: 50, expires_at: new Date("2030-01-01") };
const voucher = { id: 1, ...input, code: "VO-SUMMER", is_active: true, business_id: "biz", used_by_id: null, used_by: null, business: { slug: "demo" } };
const voucherMutationData = { id: 1, code: "VO-SUMMER", type: "PERCENTAGE", value: 20, minimumAmount: 50, expiresAt: "2030-01-01T00:00:00.000Z", status: "active", redemptions: 0 };
const context = { success: true, actorType: "OWNER", role: "OWNER", businessId: "biz", businessSlug: "demo", userId: "user", ownerId: 7 };
describe("voucher action contracts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers(); vi.setSystemTime(new Date("2029-01-01"));
    auth.mockResolvedValue({ success: true, businessSlug: "demo", session: { user: { id: "user" } } });
    resolve.mockResolvedValue(context);
    prisma.business.findUnique.mockResolvedValue({ id: "biz", initials: "vo" });
    prisma.business.findFirst.mockResolvedValue({ id: "biz", initials: "vo" });
    prisma.voucher.findMany.mockResolvedValue([voucher]);
    prisma.voucher.findUnique.mockResolvedValue(null);
    prisma.voucher.findFirst.mockResolvedValue(voucher);
    prisma.voucher.create.mockResolvedValue(voucher);
    prisma.voucher.update.mockResolvedValue(voucher);
    prisma.voucher.updateMany.mockResolvedValue({ count: 1 });
    prisma.voucher.deleteMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  });
  afterEach(() => vi.useRealTimers());
  it("lists newest vouchers and only usage id/date", async () => {
    expect(await getVouchersAction("demo")).toEqual({ success: true, data: [voucher] });
    expect(prisma.voucher.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { created_at: "desc" } }));
  });
  it("rejects a different requested tenant", async () => {
    expect(await getVouchersAction("other")).toEqual({ success: false, error: "Unauthorized" });
    expect(prisma.voucher.findMany).not.toHaveBeenCalled();
  });
  it("normalizes creation and preserves current-member subscription write gate", async () => {
    expect(await createVoucherAction(input)).toEqual({ success: true, data: voucherMutationData });
    expect(auth).toHaveBeenCalledWith({ write: true });
    expect(prisma.voucher.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ code: "VO-SUMMER", business_id: "biz", is_active: true }) }));
    expect(revalidatePath).toHaveBeenCalledWith("/app/demo/vouchers");
    expect(revalidatePath).toHaveBeenCalledWith("/owner-dashboard-preview/demo/vouchers");
  });
  it("rejects globally duplicated codes", async () => {
    prisma.voucher.findUnique.mockResolvedValue({ id: 88 });
    expect(await createVoucherAction(input)).toEqual({ success: false, error: "Voucher code already exists" });
  });
  it("deletes an own voucher", async () => {
    prisma.voucher.findUnique.mockResolvedValue(voucher);
    expect(await deleteVoucherAction(1)).toEqual({ success: true, data: { id: 1 } });
  });
  it("updates and archives an own voucher", async () => {
    expect(await updateVoucherAction(1, input)).toEqual({ success: true, data: voucherMutationData });
    expect(prisma.voucher.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1 }, data: expect.objectContaining({ code: "VO-SUMMER" }) }));
    prisma.voucher.findFirst.mockResolvedValue({ ...voucher, is_active: false });
    expect(await setVoucherActiveAction(1, false)).toEqual({ success: true, data: { ...voucherMutationData, status: "archived" } });
    expect(prisma.voucher.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 1, business_id: "biz" }), data: { is_active: false } }));
    expect(revalidatePath).toHaveBeenCalledWith("/app/demo/vouchers");
  });
  it("generates normalized prefix plus six Crockford characters without reservation", async () => {
    const result = await generateVoucherCodeAction();
    expect(result).toEqual({ success: true, code: "VO-AAAAAA" });
    expect(prisma.voucher.create).not.toHaveBeenCalled();
  });
  it("stops after ten global code collisions", async () => {
    prisma.voucher.findUnique.mockResolvedValue({ id: 2 });
    expect(await generateVoucherCodeAction()).toEqual({ success: false, error: "Couldn't generate a unique code. Try again." });
    expect(prisma.voucher.findUnique).toHaveBeenCalledTimes(10);
  });
  it("verifies publicly with normalization, minimum equality and percentage arithmetic", async () => {
    prisma.voucher.findUnique.mockResolvedValue(voucher);
    expect(await verifyVoucherAction(" vo-summer ", "demo", 50)).toEqual({ success: true, data: { id: 1, code: "VO-SUMMER", type: "PERCENTAGE", value: 20, discountAmount: 10, finalPrice: 40, minAmount: 50 } });
    expect(auth).not.toHaveBeenCalled(); expect(prisma.voucher.create).not.toHaveBeenCalled();
  });
  it("clamps flat discount to total", async () => {
    const flat = { ...voucher, type: "FLAT", value: 90 };
    prisma.voucher.findUnique.mockResolvedValue(flat); prisma.voucher.findFirst.mockResolvedValue(flat);
    expect((await verifyVoucherAction("VO-SUMMER", "demo", 50)).data).toMatchObject({ discountAmount: 50, finalPrice: 0 });
  });
  it("supports expiry equality", async () => {
    vi.setSystemTime(input.expires_at); prisma.voucher.findUnique.mockResolvedValue(voucher);
    expect((await verifyVoucherAction("VO-SUMMER", "demo", 50)).success).toBe(true);
  });
  it("supports empty and absent code errors", async () => {
    expect(await verifyVoucherAction(" ", "demo", 50)).toEqual({ success: false, error: "Voucher code can't be empty" });
    prisma.voucher.findFirst.mockResolvedValue(null);
    expect(await verifyVoucherAction("MISSING", "demo", 50)).toEqual({ success: false, error: "Voucher code not found" });
  });
  const protectedCalls = [
    { name: "list", run: () => getVouchersAction("demo"), write: false, fallback: "Failed to fetch vouchers" },
    { name: "create", run: () => createVoucherAction(input), write: true, fallback: "Failed to create voucher" },
    { name: "update", run: () => updateVoucherAction(1, input), write: true, fallback: "Failed to update voucher" },
    { name: "status", run: () => setVoucherActiveAction(1, false), write: true, fallback: "Failed to update voucher status" },
    { name: "delete", run: () => deleteVoucherAction(1), write: true, fallback: "Failed to delete voucher" },
    { name: "generate", run: () => generateVoucherCodeAction(), write: true, fallback: "Failed to generate code" },
  ];
  for (const call of protectedCalls) {
    it(`${call.name} returns gate denial without context or persistence`, async () => { auth.mockResolvedValue({ success: false, error: "Read only" }); expect(await call.run()).toEqual({ success: false, error: call.write ? "Read only" : "Unauthorized" }); expect(resolve).not.toHaveBeenCalled(); expect(prisma.$transaction).not.toHaveBeenCalled(); });
    it(`${call.name} denies missing session user`, async () => { auth.mockResolvedValue({ success: true, businessSlug: "demo", session: { user: {} } }); expect(await call.run()).toEqual({ success: false, error: "Unauthorized" }); expect(resolve).not.toHaveBeenCalled(); });
    it(`${call.name} denies revoked/transferred context`, async () => { resolve.mockResolvedValue({ success: false, error: "Forbidden" }); expect(await call.run()).toEqual({ success: false, error: "Forbidden" }); expect(prisma.$transaction).not.toHaveBeenCalled(); });
    it(`${call.name} redacts authentication infrastructure failure`, async () => { auth.mockRejectedValue(new Error("private token")); expect(await call.run()).toEqual({ success: false, error: call.fallback }); });
    it(`${call.name} accepts verified staff without new catalog permission gate`, async () => { resolve.mockResolvedValue({ ...context, actorType: "EMPLOYEE", role: "EMPLOYEE", employeeId: 3, ownerId: null, permissions: [] }); expect((await call.run()).success).toBe(true); });
  }
  for (const call of protectedCalls.filter(call => ["create", "update", "status", "delete"].includes(call.name))) {
    it(`${call.name} preserves committed success when cache fails`, async () => { vi.mocked(revalidatePath).mockImplementation(() => { throw new Error("cache private"); }); expect((await call.run()).success).toBe(true); expect(prisma.$transaction).toHaveBeenCalledTimes(1); });
    it(`${call.name} redacts database failure and never invalidates`, async () => { prisma.$transaction.mockRejectedValue(new Error("SQL private")); expect(await call.run()).toEqual({ success: false, error: call.fallback }); expect(revalidatePath).not.toHaveBeenCalled(); });
    it(`${call.name} maps conflict safely without invalidation`, async () => { prisma.$transaction.mockRejectedValue({ code: "P2034", message: "SQL" }); expect(await call.run()).toEqual({ success: false, error: "Voucher changed. Refresh and try again." }); expect(revalidatePath).not.toHaveBeenCalled(); });
  }
  it("P2002 race returns approved duplicate code error", async () => { prisma.voucher.create.mockRejectedValue({ code: "P2002", message: "private" }); expect(await createVoucherAction(input)).toEqual({ success: false, error: "Voucher code already exists" }); expect(revalidatePath).not.toHaveBeenCalled(); });
  it("current membership disappeared inside transaction prevents create/delete", async () => { prisma.business.findFirst.mockResolvedValue(null); expect(await createVoucherAction(input)).toEqual({ success: false, error: "Business not found" }); expect(await deleteVoucherAction(1)).toEqual({ success: false, error: "Voucher not found or unauthorized" }); expect(prisma.voucher.create).not.toHaveBeenCalled(); expect(prisma.voucher.deleteMany).not.toHaveBeenCalled(); });
  it("foreign conditional deletion returns safe not-found", async () => { prisma.voucher.deleteMany.mockResolvedValue({ count: 0 }); expect(await deleteVoucherAction(99)).toEqual({ success: false, error: "Voucher not found or unauthorized" }); expect(revalidatePath).not.toHaveBeenCalled(); });
  it("malformed create/update/status/id/list validates before auth or persistence", async () => { expect(await createVoucherAction({ ...input, value: Infinity })).toEqual({ success: false, error: "Invalid voucher input." }); expect(await updateVoucherAction(-1, input)).toEqual({ success: false, error: "Invalid voucher input." }); expect(await setVoucherActiveAction(1, "no" as never)).toEqual({ success: false, error: "Invalid voucher input." }); expect(await deleteVoucherAction(-1)).toEqual({ success: false, error: "Invalid voucher input." }); expect(await getVouchersAction("../demo")).toEqual({ success: false, error: "Invalid business slug" }); expect(auth).not.toHaveBeenCalled(); });
  it("empty creation code keeps legacy error", async () => expect(await createVoucherAction({ ...input, code: " " })).toEqual({ success: false, error: "Voucher code can't be empty" }));
  it("public malformed totals cannot cause negative discount or writes", async () => { expect(await verifyVoucherAction("A", "demo", -1)).toEqual({ success: false, error: "Invalid voucher input." }); expect(prisma.voucher.findFirst).not.toHaveBeenCalled(); expect(auth).not.toHaveBeenCalled(); });
  it("public foreign code preserves legacy error with no foreign DTO", async () => { prisma.voucher.findFirst.mockResolvedValue(null); prisma.voucher.findUnique.mockResolvedValue({ id: 99 }); expect(await verifyVoucherAction("FOREIGN", "demo", 50)).toEqual({ success: false, error: "Invalid voucher for this business" }); });
  it("public database failure is safe", async () => { prisma.voucher.findFirst.mockRejectedValue(new Error("private SQL")); expect(await verifyVoucherAction("A", "demo", 50)).toEqual({ success: false, error: "Failed to verify voucher" }); });
  it("list query failure is safe", async () => { prisma.voucher.findMany.mockRejectedValue(new Error("private SQL")); expect(await getVouchersAction("demo")).toEqual({ success: false, error: "Failed to fetch vouchers" }); });
  it("generate lookup failure is safe", async () => { prisma.business.findFirst.mockRejectedValue(new Error("private SQL")); expect(await generateVoucherCodeAction()).toEqual({ success: false, error: "Failed to generate code" }); });
});
