import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/prisma/prisma";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { saveCompensation } from "@/features/payroll/v2/setup";
import { saveSimpleSettings, createSimpleAdjustment } from "@/features/payroll/v2/simple-setup";
import { reconcileLegacy } from "@/features/payroll/v2/legacy-reconciliation";
import { prepareRun, saveSimplePayslip, recordPayment } from "@/features/payroll/v2/lifecycle";
import { cleanupPayrollFixture } from "./payroll-fixture-cleanup";

vi.mock("server-only", () => ({}));
requireTestDatabase();
const factory = createSharedWorkflowFactory({ namespace: "payroll-lifecycle-simple-setup", now: new Date("2026-09-07T00:00:00Z") });
const fixtures = ["fresh", "drift"].map((name, index) => ({
  business: factory.business({ id: `payroll-lifecycle-simple-setup-${name}`, slug: `payroll-lifecycle-simple-setup-${name}` }),
  owner: factory.user({ id: `payroll-lifecycle-simple-setup-${name}-owner`, contactNumber: `63917009791${index}` }),
  employees: Array.from({ length: index === 0 ? 2 : 1 }, (_, employeeIndex) => ({
    user: factory.user({ id: `payroll-lifecycle-simple-setup-${name}-employee-${employeeIndex}`, role: "EMPLOYEE", contactNumber: `6391700979${index}${employeeIndex + 2}` }), id: 0,
  })),
  ruleId: `SYNTHETIC-simple-setup-${name}-unused`,
}));
const identity = (index: number) => ({ businessSlug: fixtures[index].business.slug, userId: fixtures[index].owner.id });
const revision = async (index: number) => (await prisma.payrollSettings.findUnique({ where: { business_id: fixtures[index].business.id } }))?.revision ?? 0;
const settingsInput = async (index: number, phase: "SETUP" | "ACTIVATE") => ({ key: randomUUID(), expectedRevision: await revision(index), cadence: "SEMIMONTHLY" as const, payDays: [15, 30], smsEnabled: false, effectiveFrom: "2026-09-01", confirmation: "RECONCILED" as const, phase });
const terms = async (employeeId: number) => ({ key: randomUUID(), expectedRevision: (await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } })).financial_revision, employeeId, from: "2026-09-01", employmentStart: "2026-09-01", basis: "MONTHLY" as const, rate: "30000", hours: "8", commissionRate: "0", commissionBasis: "ORIGINAL_PRICE" as const });

beforeAll(async () => {
  for (const fixture of fixtures) {
    const users = [fixture.owner, ...fixture.employees.map(entry => entry.user)];
    await cleanupPayrollFixture(fixture.business.id, users.map(entry => entry.id), fixture.ruleId);
    await prisma.business.create({ data: { id: fixture.business.id, slug: fixture.business.slug, name: fixture.business.name, initials: fixture.business.initials } });
    await prisma.user.createMany({ data: users.map(user => ({ id: user.id, name: user.name, contact_number: user.contactNumber, role: user.role, hashed_password: user.hashedPassword })) });
    await prisma.owner.create({ data: { business_id: fixture.business.id, user_id: fixture.owner.id, is_primary: true, permissions: ["PAYROLL_MANAGE", "WORKFORCE_MANAGE"] } });
    for (const employee of fixture.employees) employee.id = (await prisma.employee.create({ data: { business_id: fixture.business.id, user_id: employee.user.id, salary: 0, employment_start: new Date("2026-09-01T00:00:00Z") } })).id;
  }
  await prisma.businessHours.create({ data: { business_id: fixtures[0].business.id, day_of_week: 1, open_time: "09:00", close_time: "17:00" } });
}, 60000);
afterAll(async () => {
  for (const fixture of fixtures) await cleanupPayrollFixture(fixture.business.id, [fixture.owner.id, ...fixture.employees.map(entry => entry.user.id)], fixture.ruleId);
  await prisma.$disconnect();
});

describe.sequential("real PostgreSQL simple setup and source compatibility", () => {
  it("allows monthly pay terms before settings without requiring IDs, a rule package, or a divisor", async () => {
    expect(await prisma.payrollSettings.findUnique({ where: { business_id: fixtures[0].business.id } })).toBeNull();
    expect(await saveCompensation(identity(0), await terms(fixtures[0].employees[1].id))).toMatchObject({ success: true });
    const agreement = await prisma.compensationAgreement.findFirstOrThrow({ where: { employee_id: fixtures[0].employees[1].id } });
    expect(agreement.basis).toBe("MONTHLY");
    expect(agreement.monthly_divisor).toBeNull();
    expect(await prisma.employeePayrollProfile.count({ where: { business_id: fixtures[0].business.id } })).toBe(0);
    expect(await prisma.payrollSettings.findUnique({ where: { business_id: fixtures[0].business.id } })).toBeNull();
  });

  it("starts in simple comparison mode and requires pay terms plus reviewed historical records before activation", async () => {
    expect(await saveSimpleSettings(identity(0), await settingsInput(0, "SETUP"))).toMatchObject({ success: true });
    let settings = await prisma.payrollSettings.findUniqueOrThrow({ where: { business_id: fixtures[0].business.id } });
    expect(settings).toMatchObject({ mode: "SHADOW", calculation_policy: "SIMPLE", rule_package_id: null, employer_identifiers: null });
    expect(await saveSimpleSettings(identity(0), await settingsInput(0, "ACTIVATE"))).toMatchObject({ success: false, code: "BLOCKED" });
    expect(await reconcileLegacy(identity(0), { key: randomUUID(), expectedRevision: await revision(0), confirmOpening: true })).toMatchObject({ success: true });
    const missingTerms = await saveSimpleSettings(identity(0), await settingsInput(0, "ACTIVATE"));
    expect(missingTerms).toMatchObject({ success: false, code: "BLOCKED" });
    if (!missingTerms.success) expect(missingTerms.error).toContain("pay and effective dates");
    expect(await saveCompensation(identity(0), await terms(fixtures[0].employees[0].id))).toMatchObject({ success: true });
    expect(await reconcileLegacy(identity(0), { key: randomUUID(), expectedRevision: await revision(0), confirmOpening: true })).toMatchObject({ success: true });
    expect(await saveSimpleSettings(identity(0), await settingsInput(0, "ACTIVATE"))).toMatchObject({ success: true });
    settings = await prisma.payrollSettings.findUniqueOrThrow({ where: { business_id: fixtures[0].business.id } });
    expect(settings).toMatchObject({ mode: "ACTIVE", calculation_policy: "SIMPLE", rule_package_id: null, employer_identifiers: null, reconciliation: { legacyCount: 0, migrated: 0, unresolved: 0 } });
    expect(await prisma.employeePayrollProfile.count({ where: { business_id: fixtures[0].business.id } })).toBe(0);
  });

  it("freezes a draft run's policy at the database and saves zero net as unpaid without inventing a payment", async () => {
    const employeeId = fixtures[0].employees[0].id;
    await prisma.employeeAttendance.create({ data: { employee_id: employeeId, date: new Date("2026-09-07T00:00:00+08:00"), status: "PRESENT", time_in: new Date("2026-09-07T09:00:00+08:00"), time_out: new Date("2026-09-07T17:00:00+08:00"), payroll_confirmed_at: new Date(), payroll_confirmed_by: fixtures[0].owner.id } });
    expect(await createSimpleAdjustment(identity(0), { key: randomUUID(), expectedRevision: (await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } })).financial_revision, employeeId, label: "Reviewed full cash advance recovery", amount: "-1000.00", reason: "Owner reviewed the separately paid cash advance", earnedOn: "2026-09-07" })).toMatchObject({ success: true });
    const prepared = await prepareRun(identity(0), { key: randomUUID(), expectedRevision: await revision(0), start: "2026-09-07", end: "2026-09-07", paymentDate: "2026-09-15", kind: "REGULAR", employeeIds: [employeeId] });
    expect(prepared.success).toBe(true); if (!prepared.success) throw new Error(prepared.error);
    const draft = await prisma.payrollStatement.findFirstOrThrow({ where: { run_id: prepared.id } });
    expect(draft.gross.toFixed(2)).toBe("1000.00");
    expect(draft.net.toFixed(2)).toBe("0.00");
    expect(draft.issues).toEqual([]);
    await expect(prisma.payrollRun.update({ where: { id: prepared.id }, data: { calculation_policy: "GOVERNMENT" } })).rejects.toThrow("original calculation policy");
    expect((await prisma.payrollRun.findUniqueOrThrow({ where: { id: prepared.id } })).calculation_policy).toBe("SIMPLE");
    expect(await saveSimplePayslip(identity(0), { key: randomUUID(), statementId: draft.id, expectedRevision: draft.revision })).toMatchObject({ success: true });
    const published = await prisma.payrollStatement.findUniqueOrThrow({ where: { id: draft.id }, include: { payments: true } });
    expect(published).toMatchObject({ status: "PUBLISHED", payment_state: "UNPAID" });
    expect(published.paid_amount.toFixed(2)).toBe("0.00");
    expect(published.payments).toEqual([]);
    expect(await recordPayment(identity(0), { key: randomUUID(), statementId: draft.id, expectedRevision: published.revision, amount: "0.01", date: "2026-09-15", method: "CASH", reference: "Synthetic invalid zero-balance payment" })).toMatchObject({ success: false, code: "INVALID_INPUT" });
  });

  it("blocks activation and repeat reconciliation if a checkpointed legacy amount or paid status changes", async () => {
    const employeeId = fixtures[1].employees[0].id;
    expect(await saveCompensation(identity(1), await terms(employeeId))).toMatchObject({ success: true });
    const original = await prisma.payslip.create({ data: { employee_id: employeeId, starting_date: new Date("2026-08-01T00:00:00+08:00"), ending_date: new Date("2026-08-02T23:59:00+08:00"), total_salary: 500, status: "PENDING" } });
    expect(await saveSimpleSettings(identity(1), await settingsInput(1, "SETUP"))).toMatchObject({ success: true });
    expect(await reconcileLegacy(identity(1), { key: randomUUID(), expectedRevision: await revision(1), confirmOpening: true })).toMatchObject({ success: true });
    const checkpoint = await prisma.payrollStatement.findUniqueOrThrow({ where: { legacy_payslip_id: original.id } });
    expect(checkpoint.net.toFixed(2)).toBe("500.00");
    await prisma.user.update({ where: { id: fixtures[1].employees[0].user.id }, data: { name: "Renamed synthetic employee" } });
    expect(await reconcileLegacy(identity(1), { key: randomUUID(), expectedRevision: await revision(1), confirmOpening: true })).toMatchObject({ success: true });
    expect((await prisma.payrollStatement.findUniqueOrThrow({ where: { id: checkpoint.id } })).snapshot).toMatchObject({ employeeName: fixtures[1].employees[0].user.name, legacyEvidenceVersion: 2 });
    await prisma.payslip.update({ where: { id: original.id }, data: { total_salary: 550 } });
    expect(await saveSimpleSettings(identity(1), await settingsInput(1, "ACTIVATE"))).toMatchObject({ success: false, code: "BLOCKED" });
    expect(await reconcileLegacy(identity(1), { key: randomUUID(), expectedRevision: await revision(1), confirmOpening: true })).toMatchObject({ success: false, code: "BLOCKED" });
    await prisma.payslip.update({ where: { id: original.id }, data: { total_salary: 500, status: "PAID", released_at: new Date("2026-08-03T12:00:00+08:00") } });
    const changedStatus = await saveSimpleSettings(identity(1), await settingsInput(1, "ACTIVATE"));
    expect(changedStatus).toMatchObject({ success: false, code: "BLOCKED" });
    if (!changedStatus.success) expect(changedStatus.error).toContain("Historical payslips changed");
    expect((await prisma.payrollSettings.findUniqueOrThrow({ where: { business_id: fixtures[1].business.id } })).mode).toBe("SHADOW");
    const preserved = await prisma.payrollStatement.findUniqueOrThrow({ where: { id: checkpoint.id } });
    expect(preserved.net.toFixed(2)).toBe("500.00");
    expect(preserved.payment_state).toBe("UNPAID");
  });
});
