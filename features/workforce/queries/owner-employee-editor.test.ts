import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/prisma/generated/prisma/client";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
vi.mock("@/prisma/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: vi.fn() }));
import { getOwnerEmployeeEditor } from "@/features/workforce/queries/owner-employee-editor";

const actor = { businessId: "business-a", businessSlug: "studio", userId: "owner-a", ownerId: 7 } as OwnerActorContext;
const database = (findFirst: ReturnType<typeof vi.fn>) => ({ business: { findFirst } }) as unknown as Pick<Prisma.TransactionClient, "business">;
describe("employee editor read", () => {
  it("requires exact current owner membership and current tenant employee accounts", async () => {
    const findFirst = vi.fn().mockResolvedValue({ owners: [{ permissions: ["EMPLOYEES_MANAGE", "PAYROLL_MANAGE"] }], payroll_settings: null, services: [{ category: "Nails" }, { category: "general" }, { category: "Hair" }], employees: [{ id: 3, profile: "CASHIER", permissions: [], daily_rate: 600, commission_percentage: 5, specialties: ["Hair"], recurring_days_off: [0], user: { name: "Mika", contact_number: "0912", hashed_password: "must-not-escape" } }] });
    const result = await getOwnerEmployeeEditor(actor, database(findFirst));
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: "business-a", slug: "studio", owners: { some: { id: 7, user_id: "owner-a", business_id: "business-a", user: { role: "OWNER" }, permissions: { has: "EMPLOYEES_MANAGE" } } } });
    expect(findFirst.mock.calls[0][0].select.employees.where).toEqual({ business_id: "business-a", archived_at: null, user: { role: "EMPLOYEE", owner: { is: null } } });
    expect(findFirst.mock.calls[0][0].select.employees.select.user).toEqual({ select: { name: true, contact_number: true } });
    expect(result?.categories).toEqual(["Hair", "Nails"]);
    expect(result?.employees[0]).toMatchObject({ id: 3, name: "Mika", daily_rate: null, commission_percentage: null, permissions: result?.defaults.CASHIER });
    expect(findFirst.mock.calls[0][0].select.employees.select).not.toHaveProperty("daily_rate");
    expect(findFirst.mock.calls[0][0].select.employees.select).not.toHaveProperty("commission_percentage");
    expect(findFirst.mock.calls[0][0].select.employees.select).toMatchObject({ employment_start: true, financial_revision: true });
    expect(JSON.stringify(result)).not.toContain("must-not-escape");
    expect(JSON.stringify(result)).not.toContain("hashed_password");
  });
  it("fails closed for missing membership and represents a real empty business", async () => {
    const findFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ services: [], employees: [] });
    expect(await getOwnerEmployeeEditor(actor, database(findFirst))).toBeNull();
    expect(await getOwnerEmployeeEditor(actor, database(findFirst))).toMatchObject({ employees: [], categories: [] });
  });
});
