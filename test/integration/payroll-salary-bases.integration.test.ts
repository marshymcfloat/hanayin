import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { prisma } from "@/prisma/prisma";
import { fingerprint } from "@/features/payroll/v2/command";
import { day } from "@/features/payroll/v2/period";
import { testEligibility, testRules } from "@/features/payroll/v2/fixtures.test-support";
import { prepareRun, approveStatement, publishStatement } from "@/features/payroll/v2/lifecycle";
import { cleanupSalaryBasisFixture } from "./payroll-basis-fixture-cleanup";

vi.mock("server-only", () => ({}));
requireTestDatabase();
const factory = createSharedWorkflowFactory({ namespace: "payroll-basis", now: new Date("2026-09-01T00:00:00Z") });
const cases = ["rate-change", "leave", "hourly"].map((name, index) => ({
  business: factory.business({ id: `payroll-basis-${name}`, slug: `payroll-basis-${name}` }),
  owner: factory.user({ id: `payroll-basis-${name}-owner`, role: "OWNER", contactNumber: `63917009821${index + 1}` }),
  user: factory.user({ id: `payroll-basis-${name}-employee`, role: "EMPLOYEE", contactNumber: `63917009820${index + 2}` }),
  employeeId: 0,
}));
const ruleId = "SYNTHETIC-payroll-basis-rules";
const rules = { ...testRules,
  wages: [...testRules.wages, { region: "TEST_HOURLY", category: "TEST", from: "2026-01-01", to: null, dailyMinimum: "500" }],
  holidays: [{ date: "2026-09-16", region: "TEST_HOURLY", type: "regular" as const, evidence: "Synthetic calendar holiday for overnight calculation only" }],
};
const identity = (index: number) => ({ businessSlug: cases[index].business.slug, userId: cases[index].owner.id });
const fixtureUserIds = [factory.user().id, ...cases.flatMap(entry => [entry.owner.id, entry.user.id])];
async function prepare(index: number, start: string, end: string, paymentDate = end) {
  const result = await prepareRun(identity(index), { key: randomUUID(), expectedRevision: 0, start, end, paymentDate, kind: "REGULAR", employeeIds: [cases[index].employeeId] });
  expect(result.success).toBe(true); if (!result.success) throw new Error(result.error);
  return prisma.payrollStatement.findFirstOrThrow({ where: { run_id: result.id }, include: { lines: true } });
}
async function publish(index: number, id: string) {
  const command = async () => ({ key: randomUUID(), statementId: id, expectedRevision: (await prisma.payrollStatement.findUniqueOrThrow({ where: { id } })).revision });
  expect(await approveStatement(identity(index), await command())).toMatchObject({ success: true });
  expect(await publishStatement(identity(index), await command())).toMatchObject({ success: true });
}
beforeAll(async () => {
  await cleanupSalaryBasisFixture(cases.map(entry => entry.business.id), fixtureUserIds, ruleId);
  await prisma.user.createMany({ data: cases.flatMap(entry => [entry.owner, entry.user]).map(user => ({ id: user.id, name: user.name, contact_number: user.contactNumber, role: user.role, hashed_password: user.hashedPassword })) });
  await prisma.payrollRulePackage.create({ data: { id: ruleId, rules, sources: ["SYNTHETIC TEST ONLY"], content_hash: fingerprint(rules), effective_from: day("2026-01-01"), supported_through: day("2026-12-31"), certified_at: new Date(), certified_by: "TEST FIXTURE", certification_evidence: "Synthetic salary fixtures; never production certification" } });
  for (const [index, entry] of cases.entries()) {
    const owner = entry.owner;
    await prisma.business.create({ data: { id: entry.business.id, slug: entry.business.slug, name: entry.business.name, initials: entry.business.initials } });
    await prisma.owner.create({ data: { business_id: entry.business.id, user_id: owner.id, permissions: ["PAYROLL_MANAGE", "WORKFORCE_MANAGE"] } });
    entry.employeeId = (await prisma.employee.create({ data: { business_id: entry.business.id, user_id: entry.user.id, salary: 0, employment_start: day("2026-09-01") } })).id;
    for (const weekday of [1, 2, 3, 4, 5]) await prisma.businessHours.create({ data: { business_id: entry.business.id, day_of_week: weekday, open_time: "09:00", close_time: "17:00" } });
    const eligibility = { ...testEligibility, sss: false, philhealth: false, pagibig: false, withholding: false, exemptionEvidence: "Verified synthetic test exclusions for contribution/tax shares" };
    const region = index === 2 ? "TEST_HOURLY" : "TEST";
    const opening = { year: 2026, taxable: "0", taxWithheld: "0", basicEarned: "0", thirteenthPaid: "0", benefitsReceived: "0", previousEmployer: false, confirmed: true };
    await prisma.employeePayrollProfile.create({ data: { business_id: entry.business.id, employee_id: entry.employeeId, encrypted_identifiers: "synthetic-envelope", eligibility, eligibility_history: [{ from: "2026-01-01", region, category: "TEST", eligibility }], work_region: region, wage_category: "TEST", monthly_basic: "31000", monthly_basic_history: [{ from: "2026-01", basic: "31000" }], ytd_opening: opening, opening_history: { "2026": opening }, opening_confirmed_at: new Date() } });
    await prisma.payrollSettings.create({ data: { business_id: entry.business.id, calculation_policy: "GOVERNMENT", mode: "ACTIVE", rule_package_id: ruleId, opening_confirmed_at: new Date() } });
    const base = { business_id: entry.business.id, employee_id: entry.employeeId, normal_hours: index === 2 ? "4" : "8", commission_rate: "0", commission_basis: "ORIGINAL_PRICE", created_by: owner.id };
    if (index === 0) {
      await prisma.compensationAgreement.createMany({ data: [{ ...base, effective_from: day("2026-09-01"), effective_to: day("2026-09-10"), basis: "MONTHLY", rate: "30000", monthly_divisor: "22" }, { ...base, effective_from: day("2026-09-11"), basis: "MONTHLY", rate: "45000", monthly_divisor: "22" }] });
    } else await prisma.compensationAgreement.create({ data: { ...base, effective_from: day("2026-09-01"), basis: index === 2 ? "HOURLY" : "MONTHLY", rate: index === 2 ? "100" : "31000", monthly_divisor: index === 2 ? null : "22" } });
    if (index < 2) for (let number = 1; number <= 30; number++) {
      const date = `2026-09-${String(number).padStart(2, "0")}`;
      if (![1, 2, 3, 4, 5].includes(day(date).getUTCDay()) || (index === 1 && number === 2)) continue;
      const absent = index === 1 && number === 16;
      await prisma.employeeAttendance.create({ data: { employee_id: entry.employeeId, date: new Date(date + "T00:00:00+08:00"), status: absent ? "ABSENT" : "PRESENT", time_in: absent ? null : new Date(date + "T09:00:00+08:00"), time_out: absent ? null : new Date(date + "T17:00:00+08:00"), payroll_confirmed_at: new Date(), payroll_confirmed_by: owner.id } });
    }
  }
  const request = await prisma.leaveRequest.create({ data: { business_id: cases[1].business.id, employee_id: cases[1].employeeId, start_date: new Date("2026-09-02T00:00:00+08:00"), end_date: new Date("2026-09-02T00:00:00+08:00"), reason: "Synthetic approved paid leave", status: "APPROVED", is_paid: true } });
  await prisma.leaveAllocation.create({ data: { business_id: cases[1].business.id, employee_id: cases[1].employeeId, leave_request_id: request.id, work_date: day("2026-09-02"), units: "1", paid: true, benefit_code: "DISCRETIONARY", funding: "EMPLOYER" } });
  const start = new Date("2026-09-15T21:59:30+08:00"); const end = new Date("2026-09-16T06:00:30+08:00");
  await prisma.employeeAttendance.create({ data: { employee_id: cases[2].employeeId, date: new Date("2026-09-15T00:00:00+08:00"), status: "PRESENT", time_in: start, time_out: end, payroll_confirmed_at: new Date(), payroll_confirmed_by: cases[2].owner.id } });
  await prisma.workforceSession.create({ data: { business_id: cases[2].business.id, employee_id: cases[2].employeeId, work_date: day("2026-09-15"), started_at: start, ended_at: end, breaks: [{ start: new Date("2026-09-16T00:00:00+08:00").toISOString(), end: new Date("2026-09-16T00:30:00+08:00").toISOString() }], confirmed_at: new Date(), confirmed_by: cases[2].owner.id } });
}, 60000);
afterAll(async () => { await cleanupSalaryBasisFixture(cases.map(entry => entry.business.id), fixtureUserIds, ruleId); await prisma.$disconnect(); });

describe.sequential("real PostgreSQL monthly and hourly salary bases", () => {
  it("prorates calendar salary across a mid-cutoff rate change and preserves both source agreements", async () => {
    // September: 10 × 1000 + 20 × 1500 = 40000; first cutoff includes five new-rate days.
    const first = await prepare(0, "2026-09-01", "2026-09-15");
    expect(first.issues).toEqual([]); expect(first.gross.toFixed(2)).toBe("17500.00");
    await publish(0, first.id);
    const second = await prepare(0, "2026-09-16", "2026-09-30");
    expect(second.issues).toEqual([]); expect(second.gross.toFixed(2)).toBe("22500.00");
    expect(first.gross.plus(second.gross).toFixed(2)).toBe("40000.00");
    const agreements = await prisma.compensationAgreement.findMany({ where: { employee_id: cases[0].employeeId }, orderBy: { effective_from: "asc" } });
    const sourceAgreementIds = first.lines.filter(line => line.code === "BASIC").map(line => (line.source as { agreementId: string }).agreementId);
    expect(sourceAgreementIds.filter(id => id === agreements[0].id)).toHaveLength(10);
    expect(sourceAgreementIds.filter(id => id === agreements[1].id)).toHaveLength(5);
    expect(await prisma.payrollEarning.count({ where: { employee_id: cases[0].employeeId, source_type: "WORKDAY", statement_id: first.id } })).toBe(15);
  });
  it("includes paid leave once and reconciles an absence using the verified divisor despite a negative daily allocation", async () => {
    // 31000 calendar pay minus one 31000/22 absence = 29590.91, with no extra paid-leave salary.
    const first = await prepare(1, "2026-09-01", "2026-09-15");
    expect(first.gross.toFixed(2)).toBe("15500.00"); expect(first.issues).toEqual([]);
    const paidLeave = first.lines.filter(line => line.description === "2026-09-02 · paid leave");
    expect(paidLeave).toHaveLength(1); expect(paidLeave[0].amount.toFixed(2)).toBe("1033.34");
    await publish(1, first.id);
    const second = await prepare(1, "2026-09-16", "2026-09-30");
    expect(second.issues).toEqual([]); expect(second.gross.toFixed(2)).toBe("14090.91");
    expect(first.gross.plus(second.gross).toFixed(2)).toBe("29590.91");
    const absence = second.lines.find(line => line.description === "2026-09-16 · basic pay");
    expect(absence?.amount.toFixed(2)).toBe("-375.76"); expect(absence?.category).toBe("EARNING");
    await publish(1, second.id);
    expect((await prisma.payrollStatement.findUniqueOrThrow({ where: { id: second.id } })).net.toFixed(2)).toBe("14090.91");
  });
  it("retains actual seconds, excludes the overnight break, and applies next-calendar-day holiday premiums", async () => {
    // 7h31m worked: ordinary4h; holiday ordinary1h59m30s; holiday OT3h31m.
    // Basic400 + holiday premium199.17 + OT914.33 + night151.05 = 1664.55.
    const statement = await prepare(2, "2026-09-15", "2026-09-15", "2026-09-16");
    expect(statement.issues).toEqual([]); expect(statement.gross.toFixed(2)).toBe("1664.55");
    expect(Object.fromEntries(statement.lines.filter(line => line.category === "EARNING").map(line => [line.code, line.amount.toFixed(2)]))).toEqual({ BASIC: "400.00", PREMIUM: "199.17", OVERTIME: "914.33", NIGHT: "151.05" });
    const earning = await prisma.payrollEarning.findFirstOrThrow({ where: { employee_id: cases[2].employeeId, code: "BASIC" } });
    expect(earning.units.toFixed(6)).toBe("4.000000");
    expect(earning.snapshot).toMatchObject({ workMs: 27060000, basis: "HOURLY" });
    await publish(2, statement.id);
    await expect(prisma.workforceSession.updateMany({ where: { employee_id: cases[2].employeeId }, data: { breaks: [] } })).rejects.toThrow();
  });
});
