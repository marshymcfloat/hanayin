import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/prisma/generated/prisma/client";
import type { OwnerActorContext } from "@/lib/auth/owner-access";

vi.mock("@/prisma/prisma", () => ({ prisma: {} }));
import { getOwnerPreviewEmployees, getOwnerPreviewOwners } from "./owner-preview-directory";

const actor = { businessId: "business-a", businessSlug: "beautyfeel", userId: "owner-a", ownerId: 7 } as OwnerActorContext;
const db = (findFirst: ReturnType<typeof vi.fn>) => ({ business: { findFirst } }) as unknown as Pick<Prisma.TransactionClient, "business">;
const expectedWhere = {
  id: "business-a", slug: "beautyfeel",
  owners: { some: { id: 7, user_id: "owner-a", business_id: "business-a", user: { role: "OWNER" } } },
};

describe("owner-preview people directories", () => {
  it("reads an allowlisted employee DTO behind exact current owner membership", async () => {
    const findFirst = vi.fn().mockResolvedValue({ name: "BeautyFeel", employees: [{ id: 3, profile: "MANAGER", specialties: ["Hair"], recurring_days_off: [0], user: { name: "Mika", contact_number: "0912", hashed_password: "secret" }, daily_rate: 900 }] });
    const result = await getOwnerPreviewEmployees(actor, db(findFirst));
    expect(result).toEqual({ businessName: "BeautyFeel", canManagePay: false, employees: [{ id: 3, name: "Mika", contactNumber: "0912", profile: "MANAGER", specialties: ["Hair"], recurringDaysOff: [0] }] });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("daily_rate");
    expect(findFirst.mock.calls[0][0].where).toEqual(expectedWhere);
    expect(findFirst.mock.calls[0][0].select.employees.select).toEqual({ id: true, profile: true, specialties: true, recurring_days_off: true, user: { select: { name: true, contact_number: true } } });
  });
  it("exposes only the current owner's payroll capability, not salary data", async () => {
    const findFirst = vi.fn().mockResolvedValue({ name: "Studio", owners: [{ permissions: ["PAYROLL_MANAGE"] }], employees: [] });
    expect(await getOwnerPreviewEmployees(actor, db(findFirst))).toMatchObject({ canManagePay: true, employees: [] });
    expect(findFirst.mock.calls[0][0].select.owners.where).toEqual({ id: 7, user_id: "owner-a" });
  });

  it("reads an allowlisted owner DTO behind exact current owner membership", async () => {
    const findFirst = vi.fn().mockResolvedValue({ name: "BeautyFeel", services: [{ category: "Hair" }], owners: [{ id: 2, is_primary: true, specialties: [], permissions: ["SETTINGS_MANAGE"], user: { name: "Ellaine", contact_number: "0999", hashed_password: "secret" } }] });
    const result = await getOwnerPreviewOwners(actor, db(findFirst));
    expect(result).toEqual({ businessName: "BeautyFeel", administration: { currentOwnerId: 7, canManage: false, categories: ["Hair"] }, owners: [{ id: 2, name: "Ellaine", contactNumber: "0999", isPrimary: true, specialties: [], permissions: ["SETTINGS_MANAGE"] }] });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(findFirst.mock.calls[0][0].where).toEqual(expectedWhere);
    expect(findFirst.mock.calls[0][0].select.owners.select).toEqual({ id: true, is_primary: true, specialties: true, permissions: true, user: { select: { name: true, contact_number: true } } });
    expect(findFirst.mock.calls[0][0].select.owners.where).toEqual({ business_id: "business-a", user: { role: "OWNER" } });
    expect(findFirst.mock.calls[0][0].select.services).toEqual({ where: { business_id: "business-a" }, select: { category: true }, distinct: ["category"], orderBy: { category: "asc" } });
  });

  it.each([[["SETTINGS_MANAGE"], true], [["CATALOG_MANAGE"], false], [[], false]])("derives management access from the current owner's stored permissions %j", async (permissions, canManage) => {
    const findFirst = vi.fn().mockResolvedValue({ name: "Studio", services: [], owners: [{ id: 7, is_primary: false, specialties: [], permissions, user: { name: "Current owner", contact_number: "0999" } }] });
    expect((await getOwnerPreviewOwners(actor, db(findFirst)))?.administration).toEqual({ currentOwnerId: 7, canManage, categories: [] });
  });

  it("fails closed when current owner membership is absent", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    expect(await getOwnerPreviewEmployees(actor, db(findFirst))).toBeNull();
    expect(await getOwnerPreviewOwners(actor, db(findFirst))).toBeNull();
  });
});
