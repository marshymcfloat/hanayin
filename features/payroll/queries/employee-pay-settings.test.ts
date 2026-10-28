import { beforeEach, expect, it, vi } from "vitest";
import type { Prisma } from "@/prisma/generated/prisma/client";
vi.mock("@/prisma/prisma", () => ({ prisma: {} }));
import { employeePaySettings } from "@/features/payroll/queries/employee-pay-settings";

const owner = vi.fn(); const employee = vi.fn();
const db = { owner: { findFirst: owner }, employee: { findFirst: employee } } as unknown as Prisma.TransactionClient;
const identity = { businessSlug: "studio", userId: "owner-a" };
beforeEach(() => { vi.resetAllMocks(); owner.mockResolvedValue({ id: 7, business_id: "business-a" }); employee.mockResolvedValue({ id: 2, financial_revision: 4, employment_start: null, employment_end: null, daily_rate: 500, commission_percentage: 10, user: { name: "Ana" }, business: { payroll_settings: { mode: "ACTIVE", calculation_policy: "SIMPLE" } }, compensation_agreements: [] }); });
it("reads one tenant-owned employee with current payroll permission and rechecks access", async () => {
  expect(await employeePaySettings(identity, 2, db)).toMatchObject({ legacy: { dailyRate: "500", commissionRate: "10" }, employee: { id: 2, revision: 4, agreements: [] } });
  expect(employee.mock.calls[0][0].where).toMatchObject({ id: 2, business_id: "business-a", archived_at: null, business: { owners: { some: { id: 7, user_id: "owner-a", permissions: { has: "PAYROLL_MANAGE" } } } } });
  expect(owner).toHaveBeenCalledTimes(2);
  expect(employee.mock.calls[0][0].select).not.toHaveProperty("payroll_profile");
  expect(employee.mock.calls[0][0].select.user).toEqual({ select: { name: true } });
});
it("returns no compensation without permission or for another tenant's employee", async () => {
  owner.mockResolvedValueOnce(null);
  await expect(employeePaySettings(identity, 2, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(employee).not.toHaveBeenCalled();
  employee.mockResolvedValueOnce(null);
  await expect(employeePaySettings(identity, 99, db)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("does not return a financial response after access is revoked during the read", async () => {
  owner.mockResolvedValueOnce({ id: 7, business_id: "business-a" }).mockResolvedValueOnce(null);
  await expect(employeePaySettings(identity, 2, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
