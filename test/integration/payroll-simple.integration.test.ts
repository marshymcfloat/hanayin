import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/prisma/prisma";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { prepareRun, prepareNextEmployee, saveSimplePayslip, recordPayment, refreshStatement, approveStatement } from "@/features/payroll/v2/lifecycle";
import { createSimpleAdjustment } from "@/features/payroll/v2/simple-setup";
import { day } from "@/features/payroll/v2/period";
import { cleanupPayrollFixture } from "./payroll-fixture-cleanup";
import { saveCompensation } from "@/features/payroll/v2/setup";
import { employeePaySettings } from "@/features/payroll/queries/employee-pay-settings";

vi.mock("server-only", () => ({}));
requireTestDatabase();
const factory = createSharedWorkflowFactory({ namespace: "payroll-lifecycle-simple", now: new Date("2026-09-07T00:00:00Z") });
const business = factory.business({ id: "payroll-lifecycle-simple-business", slug: "payroll-lifecycle-simple" });
const owner = factory.user({ id: "payroll-lifecycle-simple-owner", contactNumber: "639170097801" });
const people = ["daily", "hourly", "monthly"].map((name, index) => ({
  name, user: factory.user({ id: "payroll-lifecycle-simple-" + name, role: "EMPLOYEE", contactNumber: "63917009780" + (index + 2) }), id: 0, statementId: "",
}));
const identity = { businessSlug: business.slug, userId: owner.id };
const ruleId = "SYNTHETIC-payroll-simple-unused";
let runId = "";
const actorCommand = async (statementId: string) => ({ key: randomUUID(), statementId, expectedRevision: (await prisma.payrollStatement.findUniqueOrThrow({ where: { id: statementId } })).revision });
const users = [owner.id, ...people.map(entry => entry.user.id)];

beforeAll(async () => {
  await cleanupPayrollFixture(business.id, users, ruleId);
  await prisma.business.create({ data: { id: business.id, slug: business.slug, name: business.name, initials: business.initials } });
  await prisma.user.createMany({ data: [owner, ...people.map(entry => entry.user)].map(user => ({ id: user.id, name: user.name, contact_number: user.contactNumber, role: user.role, hashed_password: user.hashedPassword })) });
  await prisma.owner.create({ data: { business_id: business.id, user_id: owner.id, is_primary: true, permissions: ["PAYROLL_MANAGE", "WORKFORCE_MANAGE"] } });
  await prisma.businessHours.create({ data: { business_id: business.id, day_of_week: 1, open_time: "09:00", close_time: "17:00" } });
  await prisma.payrollSettings.create({ data: { business_id: business.id, calculation_policy: "SIMPLE", simple_effective_from: day("2026-09-01"), mode: "ACTIVE", sms_enabled: false } });
  for (const [index, person] of people.entries()) {
    person.id = (await prisma.employee.create({ data: { business_id: business.id, user_id: person.user.id, salary: 0, employment_start: day("2026-09-01") } })).id;
    await prisma.compensationAgreement.create({ data: { business_id: business.id, employee_id: person.id, effective_from: day("2026-09-01"), basis: index === 0 ? "DAILY" : index === 1 ? "HOURLY" : "MONTHLY", rate: index === 0 ? "1000" : index === 1 ? "125" : "30000", normal_hours: "8", monthly_divisor: null, commission_rate: "0", commission_basis: "ORIGINAL_PRICE", created_by: owner.id } });
    await prisma.employeeAttendance.create({ data: { employee_id: person.id, date: new Date("2026-09-07T00:00:00+08:00"), status: "PRESENT", time_in: new Date("2026-09-07T09:00:00+08:00"), time_out: new Date("2026-09-07T17:00:00+08:00"), payroll_confirmed_at: new Date(), payroll_confirmed_by: owner.id } });
  }
}, 60000);
afterAll(async () => {
  await cleanupPayrollFixture(business.id, users, ruleId);
  await prisma.$disconnect();
});

describe.sequential("real PostgreSQL simple payroll", () => {
  it("records named adjustments once and prepares daily, hourly, and monthly pay without statutory setup", async () => {
    const employeeRevision = async () => (await prisma.employee.findUniqueOrThrow({ where: { id: people[0].id } })).financial_revision;
    const addition = { key: randomUUID(), expectedRevision: await employeeRevision(), employeeId: people[0].id, label: "Travel allowance", amount: "200.00", reason: "Reviewed travel paid with this period", earnedOn: "2026-09-07" };
    const created = await createSimpleAdjustment(identity, addition);
    expect(created).toMatchObject({ success: true });
    expect(await createSimpleAdjustment(identity, addition)).toEqual(created);
    expect(await createSimpleAdjustment(identity, { key: randomUUID(), expectedRevision: await employeeRevision(), employeeId: people[0].id, label: "Outside contribution calculation", amount: "-100.00", reason: "Amount independently reviewed by the owner", earnedOn: "2026-09-07" })).toMatchObject({ success: true });
    expect(await prisma.payrollEarning.count({ where: { business_id: business.id, source_type: "ADJUSTMENT" } })).toBe(2);
    const input = { key: randomUUID(), expectedRevision: 0, start: "2026-09-07", end: "2026-09-07", paymentDate: "2026-09-15", kind: "REGULAR" as const, employeeIds: people.map(entry => entry.id) };
    const prepared = await prepareRun(identity, input);
    expect(prepared.success).toBe(true); if (!prepared.success) throw new Error(prepared.error);
    runId = prepared.id;
    expect(await prepareRun(identity, input)).toEqual(prepared);
    for (let count = 1; count < people.length; count++) {
      const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } });
      expect(await prepareNextEmployee(identity, { key: randomUUID(), runId, expectedRevision: run.revision })).toMatchObject({ success: true });
    }
    const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId }, include: { statements: { include: { lines: true, assessments: true } } } });
    expect(run.calculation_policy).toBe("SIMPLE");
    expect(run.statements).toHaveLength(3);
    for (const person of people) {
      const statement = run.statements.find(entry => entry.employee_id === person.id)!;
      person.statementId = statement.id;
      expect(statement.status).toBe("DRAFT");
      expect(statement.payment_state).toBe("UNPAID");
      expect(statement.issues).toEqual([]);
      expect(statement.assessments).toEqual([]);
      expect(statement.lines.filter(line => line.code === "BASIC").reduce((total, line) => total + Number(line.amount), 0)).toBe(1000);
      expect(statement.net.toFixed(2)).toBe(person.name === "daily" ? "1100.00" : "1000.00");
    }
    expect(await prisma.employeePayrollProfile.count({ where: { business_id: business.id } })).toBe(0);
    const manual = run.statements.find(entry => entry.employee_id === people[0].id)!.lines.find(line => line.description === "Travel allowance")!;
    expect(manual.source).toMatchObject({ manual: true, label: "Travel allowance", actorId: owner.id, reason: addition.reason });
  });

  it("saves a payslip ready to pay without marking earnings as paid and safely replays its command", async () => {
    const command = await actorCommand(people[0].statementId);
    const result = await saveSimplePayslip(identity, command);
    expect(result).toMatchObject({ success: true });
    expect(await saveSimplePayslip(identity, command)).toEqual(result);
    const statement = await prisma.payrollStatement.findUniqueOrThrow({ where: { id: command.statementId }, include: { payments: true, notifications: true } });
    expect(statement.status).toBe("PUBLISHED");
    expect(statement.payment_state).toBe("UNPAID");
    expect(statement.paid_amount.toFixed(2)).toBe("0.00");
    expect(statement.payments).toHaveLength(0);
    expect(statement.notifications).toHaveLength(1);
    expect(await prisma.payrollEarning.count({ where: { statement_id: statement.id } })).toBe(3);
  });

  it("records partial and full cross-month payments with exact allocations and duplicate prevention", async () => {
    const first = { ...await actorCommand(people[0].statementId), amount: "400.00", date: "2026-10-01", method: "CASH" as const, reference: "Synthetic actual partial cash" };
    const paid = await recordPayment(identity, first);
    expect(paid).toMatchObject({ success: true });
    expect(await recordPayment(identity, first)).toEqual(paid);
    expect((await prisma.payrollStatement.findUniqueOrThrow({ where: { id: first.statementId } })).payment_state).toBe("PARTIAL");
    expect(await recordPayment(identity, { ...await actorCommand(first.statementId), amount: "700.01", date: "2026-10-02", method: "CASH", reference: "Excess synthetic payment" })).toMatchObject({ success: false, code: "INVALID_INPUT" });
    expect(await recordPayment(identity, { ...await actorCommand(first.statementId), amount: "700.00", date: "2026-10-02", method: "BANK", reference: "Synthetic actual settlement" })).toMatchObject({ success: true });
    const statement = await prisma.payrollStatement.findUniqueOrThrow({ where: { id: first.statementId }, include: { lines: true, payments: { include: { allocations: true } } } });
    expect(statement.payment_state).toBe("PAID");
    expect(statement.paid_amount.toFixed(2)).toBe("1100.00");
    expect(statement.payments).toHaveLength(2);
    expect(await prisma.payrollPaymentReconciliation.count({ where: { statement_id: statement.id } })).toBe(0);
    for (const line of statement.lines) expect(statement.payments.flatMap(payment => payment.allocations).filter(entry => entry.line_id === line.id).reduce((total, entry) => total + Number(entry.amount), 0)).toBe(Number(line.amount));
  });

  it("rolls back publication, reservations, notification and command when a combined payment fails", async () => {
    const command = { ...await actorCommand(people[1].statementId), payment: { amount: "1000.01", date: "2026-10-01", method: "CASH" as const, reference: "Synthetic invalid combined payment" } };
    expect(await saveSimplePayslip(identity, command)).toMatchObject({ success: false, code: "INVALID_INPUT" });
    const statement = await prisma.payrollStatement.findUniqueOrThrow({ where: { id: command.statementId } });
    expect(statement.status).toBe("DRAFT");
    expect(statement.revision).toBe(command.expectedRevision);
    expect(await prisma.payrollEarning.count({ where: { statement_id: statement.id } })).toBe(0);
    expect(await prisma.payrollNotification.count({ where: { statement_id: statement.id } })).toBe(0);
    expect(await prisma.payrollPayment.count({ where: { statement_id: statement.id } })).toBe(0);
    expect(await prisma.payrollCommand.count({ where: { business_id: business.id, key: command.key } })).toBe(0);
    const corrected = { ...command, payment: { ...command.payment, amount: "1000.00" } };
    const result = await saveSimplePayslip(identity, corrected);
    expect(result).toMatchObject({ success: true });
    expect(await saveSimplePayslip(identity, corrected)).toEqual(result);
    expect((await prisma.payrollStatement.findUniqueOrThrow({ where: { id: command.statementId } })).payment_state).toBe("PAID");
    expect(await prisma.payrollPayment.count({ where: { statement_id: statement.id } })).toBe(1);
  });

  it("requires rereview after work changes and preserves the frozen simple policy after settings change", async () => {
    const statementId = people[2].statementId;
    await prisma.employeeAttendance.updateMany({ where: { employee_id: people[2].id }, data: { status: "LATE", revision: { increment: 1 } } });
    expect(await saveSimplePayslip(identity, await actorCommand(statementId))).toMatchObject({ success: false, code: "STALE_REVIEW" });
    expect(await refreshStatement(identity, await actorCommand(statementId))).toMatchObject({ success: true });
    await prisma.payrollSettings.update({ where: { business_id: business.id }, data: { calculation_policy: "GOVERNMENT", revision: { increment: 1 } } });
    expect(await saveSimplePayslip(identity, await actorCommand(statementId))).toMatchObject({ success: true });
    expect((await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } })).calculation_policy).toBe("SIMPLE");
    expect(await recordPayment(identity, { ...await actorCommand(statementId), amount: "1000.00", date: "2026-10-03", method: "WALLET", reference: "Synthetic settlement after settings change" })).toMatchObject({ success: true });
  });

  it("retains government setup gates for new government runs and denies non-owner writes", async () => {
    const settings = await prisma.payrollSettings.findUniqueOrThrow({ where: { business_id: business.id } });
    const result = await prepareRun(identity, { key: randomUUID(), expectedRevision: settings.revision, start: "2026-09-08", end: "2026-09-08", paymentDate: "2026-09-15", kind: "OFF_CYCLE", employeeIds: [people[0].id] });
    expect(result.success).toBe(true); if (!result.success) throw new Error(result.error);
    const statement = await prisma.payrollStatement.findFirstOrThrow({ where: { run_id: result.id }, include: { run: true } });
    expect(statement.run.calculation_policy).toBe("GOVERNMENT");
    expect((statement.issues as { code: string }[]).map(entry => entry.code)).toEqual(expect.arrayContaining(["PROFILE", "IDENTIFIERS", "RULES"]));
    expect(await approveStatement(identity, await actorCommand(statement.id))).toMatchObject({ success: false, code: "BLOCKED" });
    expect(await saveSimplePayslip({ ...identity, userId: people[0].user.id }, await actorCommand(statement.id))).toMatchObject({ success: false, code: "FORBIDDEN" });
  });
  it("shares dated pay settings without changing legacy rates, captured lines, payslips, or payments", async () => {
    const person = await prisma.employee.findUniqueOrThrow({ where: { id: people[0].id } });
    const prior = await prisma.payrollStatement.findUniqueOrThrow({ where: { id: people[0].statementId }, include: { lines: true, payments: true } });
    const input = { key: randomUUID(), employeeId: person.id, expectedRevision: person.financial_revision, employmentStart: "1990-01-01", employmentEnd: "2099-01-01", from: "2026-11-01", basis: "DAILY" as const, rate: "1200", hours: "8", commissionRate: "10", commissionBasis: "ORIGINAL_PRICE" as const };
    const saved = await saveCompensation(identity, input);
    expect(saved).toMatchObject({ success: true });
    expect(await saveCompensation(identity, input)).toEqual(saved);
    const settings = await employeePaySettings(identity, person.id);
    expect(settings.employee.agreements.find(entry => entry.from === "2026-11-01")).toMatchObject({ rate: "1200", commissionRate: "10" });
    expect(settings.employee.agreements.find(entry => entry.from === "2026-09-01")?.to).toBe("2026-10-31");
    const after = await prisma.employee.findUniqueOrThrow({ where: { id: person.id } });
    expect(after.daily_rate).toEqual(person.daily_rate);
    expect(after.commission_percentage).toEqual(person.commission_percentage);
    expect(after.employment_start).toEqual(person.employment_start);
    expect(after.employment_end).toEqual(person.employment_end);
    expect(await prisma.payrollStatement.findUniqueOrThrow({ where: { id: people[0].statementId }, include: { lines: true, payments: true } })).toEqual(prior);
  });
  it("rejects a backdated rate change over published work without altering pay history", async () => {
    const person = await prisma.employee.findUniqueOrThrow({ where: { id: people[0].id } });
    const agreements = await prisma.compensationAgreement.findMany({ where: { employee_id: person.id }, orderBy: { effective_from: "asc" } });
    expect(await saveCompensation(identity, { key: randomUUID(), employeeId: person.id, expectedRevision: person.financial_revision, from: "2026-09-07", basis: "DAILY", rate: "2000", hours: "8", commissionRate: "0", commissionBasis: "ORIGINAL_PRICE" })).toMatchObject({ success: false, code: "BLOCKED" });
    expect(await prisma.compensationAgreement.findMany({ where: { employee_id: person.id }, orderBy: { effective_from: "asc" } })).toEqual(agreements);
  });
});
