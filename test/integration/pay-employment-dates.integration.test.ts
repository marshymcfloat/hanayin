import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/prisma/prisma";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { saveCompensation } from "@/features/payroll/v2/setup";
import { updateEmployeeAdministration } from "@/features/workforce/services/employee-administration";
import { cleanupPayrollFixture } from "@/test/integration/payroll-fixture-cleanup";

vi.mock("server-only", () => ({}));
requireTestDatabase();
const factory = createSharedWorkflowFactory({ namespace: "payroll-lifecycle-employment-dates", now: new Date("2026-09-01") });
const business = factory.business({ id: "payroll-lifecycle-employment-dates", slug: "payroll-lifecycle-employment-dates" });
const owner = factory.user({ id: business.id + "-owner", contactNumber: "639170097971" });
const person = factory.user({ id: business.id + "-employee", role: "EMPLOYEE", contactNumber: "639170097972" });
const users = [owner.id, person.id]; const identity = { businessSlug: business.slug, userId: owner.id };
let employeeId = 0;
const record = () => prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
beforeAll(async () => {
  await cleanupPayrollFixture(business.id, users, "SYNTHETIC-employment-dates-unused");
  await prisma.business.create({ data: { id: business.id, slug: business.slug, name: business.name, initials: business.initials } });
  await prisma.user.createMany({ data: [owner, person].map(user => ({ id: user.id, name: user.name, contact_number: user.contactNumber, role: user.role, hashed_password: user.hashedPassword })) });
  await prisma.owner.create({ data: { business_id: business.id, user_id: owner.id, permissions: ["EMPLOYEES_MANAGE", "PAYROLL_MANAGE"] } });
  employeeId = (await prisma.employee.create({ data: { business_id: business.id, user_id: person.id, salary: 0, daily_rate: 350, commission_percentage: 10 } })).id;
}, 60000);
afterAll(async () => { await cleanupPayrollFixture(business.id, users, "SYNTHETIC-employment-dates-unused"); await prisma.$disconnect(); });

it("keeps pay, employment dates, legacy rates and saved payslips independently preserved", async () => {
  async function pay(from: string) { return saveCompensation(identity, { key: randomUUID(), expectedRevision: (await record()).financial_revision, employeeId, from, basis: "DAILY", rate: "400", hours: "8", commissionRate: "10", commissionBasis: "ORIGINAL_PRICE" }); }
  expect(await pay("2026-09-01")).toMatchObject({ success: true });
  expect((await record()).employment_start).toBeNull();
  const reviewedRevision = (await record()).financial_revision;
  expect(await updateEmployeeAdministration(identity, employeeId, { name: "Reviewed employee", employment_start: "2026-08-01", expectedFinancialRevision: reviewedRevision })).toMatchObject({ success: true });
  expect((await record()).financial_revision).toBe(reviewedRevision + 1);
  expect(await updateEmployeeAdministration(identity, employeeId, { employment_start: "2026-07-01", expectedFinancialRevision: reviewedRevision })).toMatchObject({ success: false, error: expect.stringContaining("records changed") });
  expect(await pay("2026-11-01")).toMatchObject({ success: true });
  expect(await record()).toMatchObject({ employment_start: new Date("2026-08-01"), employment_end: null, daily_rate: 350, commission_percentage: 10 });
  expect(await updateEmployeeAdministration(identity, employeeId, { employment_start: "2026-09-02", expectedFinancialRevision: (await record()).financial_revision })).toMatchObject({ success: false });
  const saved = await prisma.payslip.create({ data: { employee_id: employeeId, starting_date: new Date("2026-09-01"), ending_date: new Date("2026-09-05"), total_salary: 700, status: "PAID", released_at: new Date("2026-09-06") } });
  expect(await updateEmployeeAdministration(identity, employeeId, { employment_start: "2026-07-01", expectedFinancialRevision: (await record()).financial_revision })).toMatchObject({ success: false, error: expect.stringContaining("reviewed correction") });
  expect(await pay("2026-12-01")).toMatchObject({ success: true });
  expect(await prisma.payslip.findUniqueOrThrow({ where: { id: saved.id } })).toEqual(saved);
  expect((await record()).employment_start).toEqual(new Date("2026-08-01"));
});
