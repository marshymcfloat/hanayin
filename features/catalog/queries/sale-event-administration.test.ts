import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SaleEventActorContext } from "@/features/catalog/sale-event-access";
import { saleEventBusinessWhere } from "@/features/catalog/sale-event-access";
const mocks = vi.hoisted(() => ({ list: vi.fn(), business: vi.fn() }));
vi.mock("@/prisma/prisma", () => ({ prisma: { saleEvent: { findMany: mocks.list }, business: { findFirst: mocks.business } } }));
import { listTenantSaleEvents, listPublicActiveSaleEvents, listActiveSaleEventsForTenant, getSaleEventCreationContext } from "@/features/catalog/queries/sale-event-administration";
import { saleEventSelect, saleEventPackageSelect } from "@/features/catalog/sale-event-select";
import { serviceCatalogSelect } from "@/features/catalog/service-catalog-select";
const context = { success: true, businessId: "biz_a", businessSlug: "tenant-a", userId: "owner_a", actorType: "OWNER", ownerId: 8 } as SaleEventActorContext;
const input = { businessSlug: "tenant-a", title: "Promo", startDate: new Date("2026-03-01"), endDate: new Date("2026-03-05"), discountType: "PERCENTAGE" as const, discountValue: 10, serviceIds: [1], packageIds: [2] };
describe("safe tenant and intentionally public sale queries", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.list.mockResolvedValue([]); mocks.business.mockResolvedValue({ id: "biz_a", name: "Business", description: null, services: [{ name: "A", category: "General" }], packages: [{ name: "P" }] }); });
  it("uses verified identity and current owner membership for internal DTO with explicit nested scopes", async () => {
    await listTenantSaleEvents(context);
    expect(mocks.list).toHaveBeenCalledWith({ where: { business_id: "biz_a", business: saleEventBusinessWhere(context) }, select: { ...saleEventSelect, applicable_services: { where: { business_id: "biz_a" }, select: serviceCatalogSelect }, applicable_packages: { where: { business_id: "biz_a" }, select: saleEventPackageSelect } }, orderBy: { created_at: "desc" } });
  });
  it("uses exact current employee identity on internal reads without requiring catalog management", async () => {
    const employee = { ...context, actorType: "EMPLOYEE", ownerId: null, employeeId: 12 } as SaleEventActorContext;
    await listTenantSaleEvents(employee);
    expect(mocks.list.mock.calls[0][0].where.business).toMatchObject({ employees: { some: { id: 12, user_id: "owner_a", business_id: "biz_a", user: { role: "EMPLOYEE" } } } });
  });
  it("keeps inclusive instant bounds and excludes foreign nested records and booking counts", async () => {
    const now = new Date("2026-03-01");
    mocks.list.mockResolvedValue([{ id: 1, slot_limit: 10, _count: { bookings: 3 } }, { id: 2, slot_limit: 2, _count: { bookings: 4 } }, { id: 3, slot_limit: null, _count: { bookings: 7 } }]);
    expect(await listPublicActiveSaleEvents("tenant-a", now)).toEqual([{ id: 1, slot_limit: 10, slots_remaining: 7 }, { id: 2, slot_limit: 2, slots_remaining: 0 }, { id: 3, slot_limit: null, slots_remaining: null }]);
    expect(mocks.list).toHaveBeenCalledWith({ where: { business: { slug: "tenant-a" }, start_date: { lte: now }, end_date: { gte: now } }, select: { ...saleEventSelect, applicable_services: { where: { business: { slug: "tenant-a" } }, select: { id: true } }, applicable_packages: { where: { business: { slug: "tenant-a" } }, select: { id: true } }, _count: { select: { bookings: { where: { status: { not: "CANCELLED" }, business: { slug: "tenant-a" } } } } } } });
  });
  it("uses transaction connection and current tenant-scoped references for creation", async () => {
    const transactionBusiness = vi.fn().mockResolvedValue({ id: "biz_a", name: "Business", description: null, services: [{ name: "A", category: "General" }], packages: [{ name: "P" }] });
    await getSaleEventCreationContext(context, input, { business: { findFirst: transactionBusiness } } as unknown as Parameters<typeof getSaleEventCreationContext>[2]);
    expect(transactionBusiness).toHaveBeenCalledWith({ where: saleEventBusinessWhere(context), select: { id: true, name: true, description: true, services: { where: { business_id: "biz_a", id: { in: [1] } }, select: { name: true, category: true } }, packages: { where: { business_id: "biz_a", id: { in: [2] } }, select: { name: true } } } });
    expect(mocks.business).not.toHaveBeenCalled();
  });
  it("reads pricing sales using the supplied transaction and verified business ID at inclusive bounds", async () => {
    const now = new Date("2026-09-17T04:00:00Z");
    const list = vi.fn().mockResolvedValue([{ id: 1, slot_limit: 3, _count: { bookings: 1 } }, { id: 2, slot_limit: null, _count: { bookings: 7 } }]);
    expect(await listActiveSaleEventsForTenant("biz_a", { saleEvent: { findMany: list } } as unknown as Parameters<typeof listActiveSaleEventsForTenant>[1], now)).toEqual([{ id: 1, slot_limit: 3, slots_remaining: 2 }, { id: 2, slot_limit: null, slots_remaining: null }]);
    expect(list).toHaveBeenCalledWith({ where: { business_id: "biz_a", start_date: { lte: now }, end_date: { gte: now } }, select: { ...saleEventSelect, applicable_services: { where: { business_id: "biz_a" }, select: { id: true } }, applicable_packages: { where: { business_id: "biz_a" }, select: { id: true } }, _count: { select: { bookings: { where: { status: { not: "CANCELLED" }, business_id: "biz_a" } } } } } });
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it.each([{ record: null, error: "Forbidden" }, { record: { services: [], packages: [{ name: "P" }] }, error: "One or more selected services are invalid for this business." }, { record: { services: [{ name: "A" }], packages: [] }, error: "One or more selected packages are invalid for this business." }])("rejects absent or foreign creation context $error", async ({ record, error }) => {
    mocks.business.mockResolvedValue(record);
    await expect(getSaleEventCreationContext(context, input)).rejects.toThrow(error);
  });
});
