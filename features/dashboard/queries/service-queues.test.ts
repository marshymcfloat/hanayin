import { beforeEach, expect, it, vi } from "vitest";
import type { TenantActorContext } from "@/lib/auth/staff-access";
import { getTenantPendingServiceQueue, getTenantOwnerClaimedServiceQueue, getTenantOwnerRecentlyCompletedServiceQueue } from "@/features/dashboard/queries/service-queues";

const mocks = vi.hoisted(() => ({ employee: vi.fn(), services: vi.fn() }));
vi.mock("@/prisma/prisma", () => ({ prisma: { employee: { findFirst: mocks.employee }, availedService: { findMany: mocks.services } } }));
const owner = { actorType: "OWNER", ownerId: 1, userId: "verified-user", businessId: "verified-business" } as Extract<TenantActorContext, { success: true; actorType: "OWNER" }>;
const employee = { actorType: "EMPLOYEE", employeeId: 3, userId: "verified-user", businessId: "verified-business" } as Extract<TenantActorContext, { success: true; actorType: "EMPLOYEE" }>;
const rows = [{ id: 1, service: { category: " SPA " } }, { id: 2, service: { category: "NAILS" } }];
beforeEach(() => { vi.resetAllMocks(); mocks.services.mockResolvedValue(rows); mocks.employee.mockResolvedValue({ specialties: ["spa"] }); });

it("scopes owner pending rows and every display relation to verified tenant", async () => {
  expect(await getTenantPendingServiceQueue(owner)).toEqual(rows);
  expect(mocks.employee).not.toHaveBeenCalled();
  const query = mocks.services.mock.calls[0][0];
  expect(query.where).toEqual({ status: "PENDING", booking: { business_id: owner.businessId, status: { in: ["ACCEPTED"] }, business: { owners: { some: { id: 1, user_id: owner.userId, user: { role: "OWNER" } } } }, OR: [{ customer_id: null }, { customer: { business_id: owner.businessId } }] }, service: { business_id: owner.businessId }, OR: [{ package_id: null }, { package: { business_id: owner.businessId } }] });
  expect(query.orderBy).toEqual({ scheduled_at: "asc" });
  expect(query.select).toEqual({ id: true, price: true, scheduled_at: true, package_id: true, package: { select: { name: true } }, service: { select: { id: true, name: true, duration: true, category: true } }, booking: { select: { customer: { select: { name: true } }, scheduled_at: true, created_at: true, downpayment: true, downpayment_status: true, grand_total: true, amount_paid: true, payment_status: true } } });
});
it("reads exact current employee specialty membership before filtering", async () => {
  expect(await getTenantPendingServiceQueue(employee)).toEqual([rows[0]]);
  expect(mocks.employee).toHaveBeenCalledWith({ where: { id: 3, user_id: employee.userId, business_id: employee.businessId, user: { role: "EMPLOYEE" } }, select: { specialties: true } });
  expect(mocks.services.mock.calls[0][0].where.booking.business).toEqual({ employees: { some: { id: 3, user_id: employee.userId, user: { role: "EMPLOYEE" } } } });
});
it("denies revoked/transferred employee membership before protected queue reads", async () => {
  mocks.employee.mockResolvedValue(null); expect(await getTenantPendingServiceQueue(employee)).toEqual([]); expect(mocks.services).not.toHaveBeenCalled();
});
it.each([{ specialties: [] }, { specialties: ["GENERALIST"] }])("preserves generalist pending visibility $specialties", async ({ specialties }) => {
  mocks.employee.mockResolvedValue({ specialties }); expect(await getTenantPendingServiceQueue(employee)).toEqual(rows);
});
it("scopes claimed rows to verified serving owner and supported display fields", async () => {
  expect(await getTenantOwnerClaimedServiceQueue(owner)).toEqual(rows);
  const query = mocks.services.mock.calls[0][0];
  expect(query.where.served_by_owner_id).toBe(1); expect(query.where.status).toEqual({ in: ["CLAIMED", "SERVING"] });
  expect(query.where.booking.business_id).toBe(owner.businessId); expect(query.where.booking.business.owners.some.user_id).toBe(owner.userId);
  expect(query.where.booking.OR).toEqual([{ customer_id: null }, { customer: { business_id: owner.businessId } }]); expect(query.where.service.business_id).toBe(owner.businessId);
  expect(query.select).toEqual({ id: true, price: true, final_price: true, discount: true, discount_reason: true, scheduled_at: true, claimed_at: true, status: true, package_id: true, package: { select: { name: true } }, service: { select: { name: true, duration: true } }, booking: { select: { customer: { select: { name: true } }, scheduled_at: true, created_at: true } } });
  expect(query.orderBy).toEqual({ scheduled_at: "asc" });
});
it("offers undo only for recent unpaid services completed by the verified owner", async () => {
  const since = new Date("2026-09-28T00:00:00Z");
  expect(await getTenantOwnerRecentlyCompletedServiceQueue(owner, { take: 10, since })).toEqual(rows);
  const query = mocks.services.mock.calls[0][0];
  expect(query.where).toMatchObject({
    status: "COMPLETED", served_by_owner_id: 1, served_by_id: null,
    served_by_type: "OWNER", paid_in_payslip_id: null, cancelled_at: null,
    completed_at: { gte: since },
    booking: { business_id: owner.businessId, status: { in: ["ACCEPTED", "COMPLETED"] }, business: { owners: { some: { id: 1, user_id: owner.userId, user: { role: "OWNER" } } } } },
    service: { business_id: owner.businessId },
  });
  expect(query.take).toBe(10);
  expect(query.orderBy).toEqual({ completed_at: "desc" });
});
it("applies an explicit bounded queue limit without changing default callers", async () => {
  await getTenantPendingServiceQueue(owner, { take: 20 });
  expect(mocks.services.mock.calls[0][0].take).toBe(20);
  await getTenantOwnerClaimedServiceQueue(owner, { take: 20 });
  expect(mocks.services.mock.calls[1][0].take).toBe(20);
});
it.each([{ context: owner }, { context: employee }])("preserves anonymous pending DTOs and specialty filtering for $context.actorType", async ({ context }) => {
  const anonymous = rows.map(row => ({ ...row, booking: { customer: null } }));
  mocks.services.mockResolvedValue(anonymous);
  expect(await getTenantPendingServiceQueue(context)).toEqual(context.actorType === "OWNER" ? anonymous : [anonymous[0]]);
  const where = mocks.services.mock.calls[0][0].where;
  expect(where.booking.OR).toEqual([{ customer_id: null }, { customer: { business_id: context.businessId } }]);
  expect(where.booking.business_id).toBe(context.businessId); expect(where.service.business_id).toBe(context.businessId);
  expect(where.OR).toEqual([{ package_id: null }, { package: { business_id: context.businessId } }]);
});
it("preserves anonymous owner-claimed DTOs without relaxing assignment or parent tenant predicates", async () => {
  const anonymous = { ...rows[0], booking: { customer: null } };
  mocks.services.mockResolvedValue([anonymous]);
  expect(await getTenantOwnerClaimedServiceQueue(owner)).toEqual([anonymous]);
  expect(mocks.services.mock.calls[0][0].where).toMatchObject({ served_by_owner_id: owner.ownerId, status: { in: ["CLAIMED", "SERVING"] }, booking: { business_id: owner.businessId, OR: [{ customer_id: null }, { customer: { business_id: owner.businessId } }] } });
});
