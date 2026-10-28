// Colocated action regression test.
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthMock = vi.hoisted(() => vi.fn());
const requireStaffPermissionMock = vi.hoisted(() => vi.fn());
const resolveTenantActorContextMock = vi.hoisted(() => vi.fn());
const hasCurrentCatalogWriteAccessMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  business: {
    findUnique: vi.fn(),
  },
  service: {
    count: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
  },
  serviceFlow: { deleteMany: vi.fn(), createMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/auth/staff-access", () => ({
  requireStaffPermission: requireStaffPermissionMock,
  resolveTenantActorContext: resolveTenantActorContextMock,
}));
vi.mock("@/features/catalog/catalog-access", () => ({ hasCurrentCatalogWriteAccess: hasCurrentCatalogWriteAccessMock }));

vi.mock("@/prisma/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { createServiceAction, updateServiceAction, deleteServiceAction, getServicesAction, getServiceCategoriesAction } from "./services";
import { revalidatePath, revalidateTag } from "next/cache";
import { serviceCatalogSelect, serviceCatalogFlowSelect } from "@/features/catalog/service-catalog-select";

const actor = { success: true, actorType: "OWNER", ownerId: 1, role: "OWNER", userId: "user_a", businessId: "biz_a", businessSlug: "tenant-a" };
const validInput = { name: "Cut", category: "Hair", price: 100 };
const flow = { suggested_service_id: 99, delay_duration: 7, delay_unit: "DAYS", type: "SUGGESTED" } as const;
const serviceRecord = {
  id: 123,
  name: "Cut",
  description: null,
  category: "Hair",
  price: 100,
  estimated_cost: 0,
  duration: null,
  business_id: "biz_a",
  is_demo: false,
  created_at: new Date("2026-09-01T00:00:00.000Z"),
  updated_at: new Date("2026-09-01T00:00:00.000Z"),
  availed_services: [{ id: 501 }, { id: 502 }],
};
const serviceMutationData = {
  id: 123,
  name: "Cut",
  description: null,
  category: "Hair",
  price: 100,
  estimatedCost: 0,
  durationMinutes: null,
  monthlyBookings: 2,
};

describe("service server actions tenant boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireAuthMock.mockResolvedValue({
      success: true,
      businessSlug: "tenant-a",
      session: { user: { id: "user_a" } },
    });
    requireStaffPermissionMock.mockResolvedValue({
      success: true,
      context: actor,
    } as never);
    prismaMock.business.findUnique.mockResolvedValue({ id: "biz_a" });
    resolveTenantActorContextMock.mockResolvedValue(actor);
    hasCurrentCatalogWriteAccessMock.mockResolvedValue(true);
    prismaMock.service.count.mockResolvedValue(1);
    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
    prismaMock.service.findFirst.mockResolvedValue({ id: 123 });
    prismaMock.service.update.mockResolvedValue(serviceRecord);
    prismaMock.service.create.mockResolvedValue(serviceRecord);
  });

  it("rejects flow suggestions that do not belong to the authenticated tenant", async () => {
    prismaMock.service.count.mockResolvedValue(0);

    const result = await createServiceAction({
      name: "Color",
      price: 1000,
      category: "Hair",
      flows: [
        {
          suggested_service_id: 99,
          delay_duration: 7,
          delay_unit: "DAYS",
          type: "SUGGESTED",
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: "One or more suggested services are invalid for this business.",
      }),
    );
    expect(prismaMock.service.create).not.toHaveBeenCalled();
  });

  it("rejects updates for services outside tenant scope", async () => {
    prismaMock.service.count.mockResolvedValue(0);
    prismaMock.service.findFirst.mockResolvedValue(null);

    const result = await updateServiceAction(123, {
      name: "Updated",
      category: "Hair",
      price: 1200,
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: "Service not found or unauthorized",
      }),
    );
  });

  it("preserves create defaults", async () => {
    expect(await createServiceAction({ name: "Cut", category: "Hair", price: 100, description: "", duration: 0 })).toEqual({ success: true, data: serviceMutationData });
    expect(prismaMock.service.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ description: null, duration: null, estimated_cost: 0, business_id: "biz_a" }) }));
  });

  it("preserves explicit create description, cost and duration", async () => {
    await createServiceAction({ ...validInput, description: "Premium cut", estimated_cost: 25, duration: 30, flows: [] });
    expect(prismaMock.service.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ description: "Premium cut", estimated_cost: 25, duration: 30, flow_triggers: { createMany: { data: [] } } }) }));
    expect(prismaMock.service.count).not.toHaveBeenCalled();
  });

  it("omitted flows keep existing flows and patch only supplied values", async () => {
    await updateServiceAction(123, { price: 200 });
    expect(prismaMock.service.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ price: 200 }) }));
    expect(prismaMock.serviceFlow.deleteMany).not.toHaveBeenCalled();
  });

  it("empty flows clear existing flows", async () => {
    await updateServiceAction(123, { flows: [] });
    expect(prismaMock.serviceFlow.deleteMany).toHaveBeenCalledWith({ where: { trigger_service_id: 123, business_id: "biz_a" } });
    expect(prismaMock.serviceFlow.createMany).not.toHaveBeenCalled();
  });

  it("retains service sorting and suggested flow relation", async () => {
    prismaMock.service.findMany.mockResolvedValue([]);
    expect(await getServicesAction()).toEqual({ success: true, data: [] });
    expect(prismaMock.service.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ category: "asc" }, { name: "asc" }], select: { ...serviceCatalogSelect, flow_triggers: { where: { business_id: "biz_a", suggested_service: { business_id: "biz_a" } }, select: serviceCatalogFlowSelect } } }));
  });

  it("retains category result shape", async () => {
    prismaMock.service.findMany.mockResolvedValue([{ category: "Hair" }]);
    expect(await getServiceCategoriesAction()).toEqual({ success: true, data: ["Hair"] });
  });

  it("retains missing deletion result", async () => {
    prismaMock.service.deleteMany.mockResolvedValue({ count: 0 });
    expect(await deleteServiceAction(123)).toEqual({ success: false, error: "Service not found or unauthorized" });
  });

  it("strips client identities and preserves distinct suggestion membership validation inside transaction", async () => {
    await createServiceAction({ ...validInput, business_id: "evil", userId: "evil", flows: [{ ...flow, business_id: "evil" }, flow] } as never);
    expect(prismaMock.business.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.service.count).toHaveBeenCalledWith({ where: { business_id: "biz_a", id: { in: [99] } } });
    expect(prismaMock.service.create).toHaveBeenCalledWith({ select: expect.objectContaining({ ...serviceCatalogSelect, availed_services: expect.any(Object) }), data: { ...validInput, description: null, estimated_cost: 0, duration: null, business_id: "biz_a", flow_triggers: { createMany: { data: [{ ...flow, business_id: "biz_a" }, { ...flow, business_id: "biz_a" }] } } } });
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
    expect(prismaMock.$transaction.mock.invocationCallOrder[0]).toBeLessThan(prismaMock.service.count.mock.invocationCallOrder[0]);
    expect(revalidatePath).toHaveBeenCalledWith("/app/tenant-a/services");
    expect(revalidateTag).toHaveBeenCalledWith(expect.stringContaining("biz_a"), "max");
  });

  it("scopes patch and replacement writes and preserves zero patch values", async () => {
    await updateServiceAction(123, { estimated_cost: 0, duration: 0, description: "", flows: [flow] });
    expect(prismaMock.service.update).toHaveBeenCalledWith({ where: { id: 123, business_id: "biz_a" }, data: { estimated_cost: 0, duration: 0, description: "" }, select: expect.objectContaining({ ...serviceCatalogSelect, availed_services: expect.any(Object) }) });
    expect(prismaMock.serviceFlow.createMany).toHaveBeenCalledWith({ data: [{ ...flow, trigger_service_id: 123, business_id: "biz_a" }] });
  });

  it("does not mutate a target when a suggestion is foreign", async () => {
    prismaMock.service.count.mockResolvedValue(0);
    expect(await updateServiceAction(123, { flows: [flow] })).toEqual({ success: false, error: "One or more suggested services are invalid for this business." });
    expect(prismaMock.service.update).not.toHaveBeenCalled();
    expect(prismaMock.serviceFlow.deleteMany).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("scopes successful deletion", async () => {
    prismaMock.service.deleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteServiceAction(123)).toEqual({ success: true, data: { id: 123 } });
    expect(prismaMock.service.deleteMany).toHaveBeenCalledWith({ where: { id: 123, business_id: "biz_a" } });
    expect(revalidatePath).toHaveBeenNthCalledWith(1, "/app/tenant-a/services");
    expect(revalidatePath).toHaveBeenNthCalledWith(2, "/owner-dashboard-preview/tenant-a/services");
  });

  it.each([0, -1, 1.5, 2147483648, NaN, Infinity, "123", null])("rejects invalid service ID %s before authentication", async (id) => {
    expect(await updateServiceAction(id as never, {})).toEqual({ success: false, error: "Invalid input" });
    expect(await deleteServiceAction(id as never)).toEqual({ success: false, error: "Invalid input" });
    expect(requireAuthMock).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("validates payload before authentication", async () => {
    expect(await createServiceAction({ ...validInput, price: Infinity })).toEqual({ success: false, error: "Invalid input" });
    expect(await updateServiceAction(123, { flows: [ { ...flow, type: "EVIL" } ] } as never)).toEqual({ success: false, error: "Invalid input" });
    expect(requireAuthMock).not.toHaveBeenCalled();
  });

  it.each(["Unauthorized", "Forbidden", "Subscription read only"])("preserves auth denial %s", async (error) => {
    requireAuthMock.mockResolvedValue({ success: false, error });
    for (const action of [() => createServiceAction(validInput), () => updateServiceAction(123, {}), () => deleteServiceAction(123), getServicesAction, getServiceCategoriesAction]) {
      expect(await action()).toEqual({ success: false, error });
    }
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.service.findMany).not.toHaveBeenCalled();
  });

  it("retains CATALOG_MANAGE and write subscription guard for all mutations", async () => {
    requireStaffPermissionMock.mockResolvedValue({ success: false, error: "Forbidden" });
    for (const action of [() => createServiceAction(validInput), () => updateServiceAction(123, {}), () => deleteServiceAction(123)]) {
      expect(await action()).toEqual({ success: false, error: "Forbidden" });
    }
    expect(requireStaffPermissionMock).toHaveBeenCalledTimes(3);
    expect(requireStaffPermissionMock).toHaveBeenCalledWith("tenant-a", "CATALOG_MANAGE", { write: true });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rechecks current catalog membership inside every mutation", async () => {
    hasCurrentCatalogWriteAccessMock.mockResolvedValue(false);
    for (const action of [() => createServiceAction(validInput), () => updateServiceAction(123, {}), () => deleteServiceAction(123)]) expect(await action()).toEqual({ success: false, error: "Forbidden" });
    expect(hasCurrentCatalogWriteAccessMock).toHaveBeenCalledWith(prismaMock, actor);
    expect(prismaMock.service.create).not.toHaveBeenCalled();
    expect(prismaMock.service.update).not.toHaveBeenCalled();
    expect(prismaMock.service.deleteMany).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("denies stale actor read context", async () => {
    resolveTenantActorContextMock.mockResolvedValue({ success: false, error: "Forbidden" });
    expect(await getServicesAction()).toEqual({ success: false, error: "Forbidden" });
    expect(await getServiceCategoriesAction()).toEqual({ success: false, error: "Forbidden" });
    expect(prismaMock.service.findMany).not.toHaveBeenCalled();
  });

  it("denies missing authenticated identity before protected reads", async () => {
    requireAuthMock.mockResolvedValue({ success: true, businessSlug: "tenant-a", session: { user: {} } });
    expect(await getServicesAction()).toEqual({ success: false, error: "Unauthorized" });
    expect(await getServiceCategoriesAction()).toEqual({ success: false, error: "Unauthorized" });
    expect(resolveTenantActorContextMock).not.toHaveBeenCalled();
  });

  it.each(["create", "update", "delete", "flows", "count", "transaction"])("contains %s persistence failures and avoids cache invalidation", async (stage) => {
    const internal = new Error("database internal secret");
    const action = stage === "create" ? () => createServiceAction(validInput) : stage === "delete" ? () => deleteServiceAction(123) : () => updateServiceAction(123, { flows: [flow] });
    if (stage === "create") prismaMock.service.create.mockRejectedValue(internal);
    if (stage === "update") prismaMock.service.update.mockRejectedValue(internal);
    if (stage === "delete") prismaMock.service.deleteMany.mockRejectedValue(internal);
    if (stage === "flows") prismaMock.serviceFlow.createMany.mockRejectedValue(internal);
    if (stage === "count") prismaMock.service.count.mockRejectedValue(internal);
    if (stage === "transaction") prismaMock.$transaction.mockRejectedValue(internal);
    const result = await action();
    expect(result).toEqual({ success: false, error: `Failed to ${stage === "create" ? "create" : stage === "delete" ? "delete" : "update"} service` });
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([getServicesAction, getServiceCategoriesAction])("contains protected read persistence errors", async (action) => {
    prismaMock.service.findMany.mockRejectedValue(new Error("private database error"));
    expect(await action()).toEqual({ success: false, error: action === getServicesAction ? "Failed to fetch services" : "Failed to fetch categories" });
  });

  it("returns safe conflict failures without caches", async () => {
    prismaMock.$transaction.mockRejectedValue({ code: "P2034", message: "private" });
    expect(await updateServiceAction(123, { flows: [] })).toEqual({ success: false, error: "Service catalog changed. Refresh and try again." });
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
