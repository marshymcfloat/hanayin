import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceCatalogActor } from "@/features/catalog/types/service-administration";
import { serviceCatalogSelect, serviceCatalogFlowSelect } from "@/features/catalog/service-catalog-select";

const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/prisma/prisma", () => ({ prisma: { service: { findMany } } }));
import { listTenantCatalogServices, listTenantServiceCategories } from "./service-catalog";

const actor = { businessId: "biz_a" } as ServiceCatalogActor;
describe("tenant catalog queries", () => {
  beforeEach(() => vi.resetAllMocks());
  it("preserves supported catalog and flow results within verified tenant", async () => {
    const services = [{ id: 1, name: "Cut", flow_triggers: [{ suggested_service: { id: 2 } }] }];
    findMany.mockResolvedValue(services);
    expect(await listTenantCatalogServices(actor)).toBe(services);
    expect(findMany).toHaveBeenCalledWith({ where: { business_id: "biz_a" }, orderBy: [{ category: "asc" }, { name: "asc" }], select: { ...serviceCatalogSelect, flow_triggers: { where: { business_id: "biz_a", suggested_service: { business_id: "biz_a" } }, select: serviceCatalogFlowSelect } } });
  });
  it("returns distinct tenant category strings without new sorting", async () => {
    findMany.mockResolvedValue([{ category: "Spa" }, { category: "Hair" }]);
    expect(await listTenantServiceCategories(actor)).toEqual(["Spa", "Hair"]);
    expect(findMany).toHaveBeenCalledWith({ where: { business_id: "biz_a" }, select: { category: true }, distinct: ["category"] });
  });
});
