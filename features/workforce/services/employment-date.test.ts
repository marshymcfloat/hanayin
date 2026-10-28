import { beforeEach, expect, it, vi } from "vitest";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { employmentDateChangeError } from "@/features/workforce/services/employment-date";

const employee: Parameters<typeof employmentDateChangeError>[2] = { id: 7, employment_start: new Date("2026-01-01"), employment_end: null, financial_revision: 3 };
const delegates = () => Object.fromEntries(["payrollStatement", "payslip", "compensationAgreement", "payrollEarning", "employeeAttendance", "workforceSession"].map(name => [name, { findFirst: vi.fn().mockResolvedValue(null) }]));
let mocks: ReturnType<typeof delegates>;
beforeEach(() => { mocks = delegates(); });
const check = (next: string | null, revision = 3, person = employee) => employmentDateChangeError(mocks as unknown as Prisma.TransactionClient, "business", person, next, revision);

it("rejects stale corrections before history reads", async () => {
  expect(await check("2025-12-01", 2)).toContain("records changed");
  expect(mocks.payrollStatement.findFirst).not.toHaveBeenCalled();
});
it.each(["payrollStatement", "payslip"])("blocks changing a recorded joining date linked to %s", async name => {
  mocks[name].findFirst.mockResolvedValue({ id: "saved" });
  expect(await check("2025-12-01")).toContain("reviewed correction");
});
it.each(["compensationAgreement", "payrollEarning", "employeeAttendance", "workforceSession"])("rejects Joined on later than recorded %s", async name => {
  mocks[name].findFirst.mockResolvedValue({ id: "earlier" });
  expect(await check("2026-02-01")).toContain("later than recorded");
  expect(mocks[name].findFirst.mock.calls[0][0].where).toMatchObject(name === "employeeAttendance" ? { employee_id: 7, employee: { business_id: "business" } } : { business_id: "business", employee_id: 7 });
});
it("allows a first verified date before legacy history without fabricating or editing history", async () => {
  mocks.payslip.findFirst.mockResolvedValueOnce({ id: "legacy" }).mockResolvedValueOnce(null);
  expect(await check("2025-12-01", 3, { ...employee, employment_start: null })).toBeNull();
  expect(Object.values(mocks).every(delegate => Object.keys(delegate).length === 1)).toBe(true);
});
it("allows a correction when no work or pay exists and rejects clearing recorded work", async () => {
  expect(await check("2025-12-01")).toBeNull();
  mocks.compensationAgreement.findFirst.mockResolvedValue({ id: "terms" });
  expect(await check(null)).toContain("cannot be cleared");
});
it("rejects a joining date after separation", async () => {
  expect(await check("2026-03-01", 3, { ...employee, employment_end: new Date("2026-02-01") })).toContain("employment end");
});
