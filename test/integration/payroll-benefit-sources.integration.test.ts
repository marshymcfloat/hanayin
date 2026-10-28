import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { prisma } from "@/prisma/prisma";
import { Prisma } from "@/prisma/generated/prisma/client";
import { fingerprint } from "@/features/payroll/v2/command";
import { day, phDay } from "@/features/payroll/v2/period";
import { testEligibility, testRules } from "@/features/payroll/v2/fixtures.test-support";
import { maternityQualifyingWindow, type MaternityInput } from "@/features/payroll/v2/leave-awards-calculation";
import { previewMaternityAward, recordMaternityAward } from "@/features/payroll/v2/leave-awards";
import { previewServiceCharge, recordServiceCharge } from "@/features/payroll/v2/service-charge";
import { prepareRun, refreshStatement, approveStatement, publishStatement } from "@/features/payroll/v2/lifecycle";
import { cleanupBenefitFixture } from "./payroll-benefit-fixture-cleanup";

vi.mock("server-only", () => ({}));
requireTestDatabase();
const factory = createSharedWorkflowFactory({ namespace: "payroll-benefit-sources", now: new Date("2026-09-07T00:00:00Z") });
const business = factory.business();
const foreignBusiness = factory.business({ id: "payroll-benefit-foreign-business", slug: "payroll-benefit-foreign" });
const owner = factory.user({ contactNumber: "639170098101" });
const mother = factory.user({ id: "payroll-benefit-mother", role: "EMPLOYEE", contactNumber: "639170098102" });
const worker = factory.user({ id: "payroll-benefit-worker", role: "EMPLOYEE", contactNumber: "639170098103" });
const foreignOwner = factory.user({ id: "payroll-benefit-foreign-owner", contactNumber: "639170098104" });
const foreignWorker = factory.user({ id: "payroll-benefit-foreign-worker", role: "EMPLOYEE", contactNumber: "639170098105" });
const users = [owner, mother, worker, foreignOwner, foreignWorker];
const ruleId = "SYNTHETIC-payroll-benefit-sources";
const identity = { businessSlug: business.slug, userId: owner.id };
const foreignIdentity = { businessSlug: foreignBusiness.slug, userId: foreignOwner.id };
const today = phDay(new Date());
const afterDays = (date: string, count: number) => new Date(day(date).getTime() + count * 86400000).toISOString().slice(0, 10);
const rules = { ...testRules,
  // These short durations and zero contribution shares are synthetic workflow fixtures.
  sss: testRules.sss.map(row => ({ ...row, employee: "0", employer: "0", ec: "0" })),
  maternity: { version: "SYNTHETIC-MATERNITY", qualifyingMonths: 3, minimumContributions: 2, highestCredits: 2, divisor: "3", salaryCreditCeiling: "200", liveBirthDays: 3, lossDays: 3, soloParentExtraDays: 0, sssTaxable: false, differentialTaxable: false, source: "https://www.sss.gov.ph/synthetic-test-only" },
  serviceCharge: { version: "SYNTHETIC-SERVICE-CHARGE", taxable: false, source: "https://www.dole.gov.ph/synthetic-test-only", maxPeriodDays: 16 },
};
let motherId: number; let workerId: number; let foreignWorkerId: number;
let currentEntitlementId: string; let pastEntitlementId: string; let currentStatementId: string; let poolId: string;

function awardInput(entitlementId: string, date: string): MaternityInput {
  const window = maternityQualifyingWindow(date, 3);
  return { entitlementId, contingencyDate: date, event: "LIVE_BIRTH", soloParent: false, transferredDays: 0,
    contributionEvidence: "Synthetic verified contribution receipts", eligibilityEvidence: "Synthetic verified event and SSS qualification", soloParentEvidence: "",
    fullSalaryAmount: "330.03", fullSalaryEvidence: "Synthetic reviewed full salary for three calendar days", differentialExempt: false, exemptionEvidence: "",
    credits: window.months.map(month => ({ month, salaryCredit: "150.01", contributed: true, paidOn: afterDays(window.semesterStart, -1) })),
  };
}
const chargeInput = (reference: string) => ({ reference, from: "2026-09-15", to: "2026-09-15", amount: "1.00", collectionEvidence: "Synthetic receipt confirms collected service charge", externalWorkersPresent: false,
  roster: [motherId, workerId].map(employeeId => ({ employeeId, eligible: true, evidence: "Verified worker eligibility independent of app role" })),
});
async function statementCommand(id: string) { return { key: randomUUID(), statementId: id, expectedRevision: (await prisma.payrollStatement.findUniqueOrThrow({ where: { id } })).revision }; }
async function prepare(start: string, end: string) {
  const result = await prepareRun(identity, { key: randomUUID(), expectedRevision: 0, start, end, paymentDate: today, kind: "REGULAR", employeeIds: [motherId] });
  expect(result.success).toBe(true); if (!result.success) throw new Error(result.error);
  return prisma.payrollStatement.findFirstOrThrow({ where: { run_id: result.id, employee_id: motherId } });
}
async function createMaternityPeriod(start: string) {
  const entitlement = await prisma.leaveEntitlement.create({ data: { business_id: business.id, employee_id: motherId, benefit_code: "MATERNITY", period_start: day(start), period_end: day(afterDays(start, 2)), granted_units: "3", evidence: "Synthetic verified three-day maternity entitlement", funding: "SSS" } });
  const request = await prisma.leaveRequest.create({ data: { business_id: business.id, employee_id: motherId, start_date: new Date(start + "T00:00:00+08:00"), end_date: new Date(afterDays(start, 2) + "T00:00:00+08:00"), reason: "Synthetic maternity benefit", status: "APPROVED", is_paid: true, benefit_code: "MATERNITY" } });
  await prisma.leaveAllocation.createMany({ data: [0, 1, 2].map(index => ({ business_id: business.id, employee_id: motherId, leave_request_id: request.id, entitlement_id: entitlement.id, work_date: day(afterDays(start, index)), units: "1", paid: true, benefit_code: "MATERNITY", funding: "SSS" })) });
  return entitlement.id;
}

beforeAll(async () => {
  await cleanupBenefitFixture([business.id, foreignBusiness.id], users.map(user => user.id), ruleId);
  await prisma.business.createMany({ data: [business, foreignBusiness].map(record => ({ id: record.id, slug: record.slug, name: record.name, initials: record.initials })) });
  await prisma.user.createMany({ data: users.map(user => ({ id: user.id, name: user.name, contact_number: user.contactNumber, role: user.role, hashed_password: user.hashedPassword })) });
  await prisma.owner.createMany({ data: [{ business_id: business.id, user_id: owner.id }, { business_id: foreignBusiness.id, user_id: foreignOwner.id }].map(record => ({ ...record, permissions: ["PAYROLL_MANAGE", "WORKFORCE_MANAGE"] })) });
  const eligibility = { ...testEligibility, philhealth: false, pagibig: false, withholding: false, exemptionEvidence: "Synthetic verified test contribution exclusions" };
  for (const user of [mother, worker, foreignWorker]) {
    const businessId = user.id === foreignWorker.id ? foreignBusiness.id : business.id;
    const employee = await prisma.employee.create({ data: { business_id: businessId, user_id: user.id, salary: 0, employment_start: day("2026-01-01") } });
    if (user.id === mother.id) motherId = employee.id; else if (user.id === worker.id) workerId = employee.id; else foreignWorkerId = employee.id;
    await prisma.compensationAgreement.create({ data: { business_id: businessId, employee_id: employee.id, effective_from: day("2026-01-01"), basis: "DAILY", rate: "1000", normal_hours: "8", commission_rate: "0", commission_basis: "ORIGINAL_PRICE", created_by: owner.id } });
    const opening = { year: Number(today.slice(0, 4)), taxable: "0", taxWithheld: "0", basicEarned: "0", thirteenthPaid: "0", benefitsReceived: "0", previousEmployer: false, confirmed: true };
    await prisma.employeePayrollProfile.create({ data: { business_id: businessId, employee_id: employee.id, encrypted_identifiers: "synthetic-envelope", eligibility, eligibility_history: [{ from: "2026-01-01", region: "TEST", category: "TEST", eligibility }], work_region: "TEST", wage_category: "TEST", monthly_basic: "20000", monthly_basic_history: [{ from: "2026-01", basic: "20000" }], ytd_opening: opening, opening_history: { [String(opening.year)]: opening }, opening_confirmed_at: new Date() } });
  }
  for (let weekday = 0; weekday < 7; weekday++) await prisma.businessHours.create({ data: { business_id: business.id, day_of_week: weekday, open_time: "09:00", close_time: "17:00" } });
  await prisma.payrollRulePackage.create({ data: { id: ruleId, rules, sources: ["SYNTHETIC TEST ONLY"], content_hash: fingerprint(rules), effective_from: day("2026-01-01"), supported_through: day("2100-12-31"), certified_by: "TEST FIXTURE", certified_at: new Date(), certification_evidence: "Never deploy this synthetic rule package" } });
  await prisma.payrollSettings.createMany({ data: [business.id, foreignBusiness.id].map(business_id => ({ business_id, calculation_policy: "GOVERNMENT" as const, mode: "ACTIVE", rule_package_id: ruleId, opening_confirmed_at: new Date() })) });
  currentEntitlementId = await createMaternityPeriod(today);
  pastEntitlementId = await createMaternityPeriod("2026-09-07");
  for (const [employeeId, hours] of [[motherId, 1], [workerId, 2]]) await prisma.workforceSession.create({ data: { business_id: business.id, employee_id: employeeId, work_date: day("2026-09-15"), started_at: new Date("2026-09-15T09:00:00+08:00"), ended_at: new Date(`2026-09-15T${9 + hours}:00:00+08:00`), confirmed_at: new Date(), confirmed_by: owner.id, breaks: [] } });
});
afterAll(async () => { await cleanupBenefitFixture([business.id, foreignBusiness.id], users.map(user => user.id), ruleId); await prisma.$disconnect(); });

describe.sequential("real PostgreSQL maternity and service-charge sources", () => {
  it("blocks funded maternity allocations without a reviewed award", async () => {
    const statement = await prepare(today, today); currentStatementId = statement.id;
    expect(statement.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "LEAVE_AWARD" })]));
    expect(await prisma.payrollEarning.count({ where: { business_id: business.id, source_type: "LEAVE_AWARD" } })).toBe(0);
  });
  it("binds maternity review to source revisions and records once without future earnings or attendance", async () => {
    const input = awardInput(currentEntitlementId, today);
    const stalePreview = await previewMaternityAward(identity, input);
    expect(stalePreview).toMatchObject({ days: 3, totalSSS: "300.02", employerDifferential: "30.01", total: "330.03" });
    await prisma.employeePayrollProfile.update({ where: { employee_id: motherId }, data: { revision: { increment: 1 } } });
    expect(await recordMaternityAward(identity, { ...input, ...stalePreview, key: randomUUID() })).toMatchObject({ success: false, code: "STALE_REVIEW" });
    const preview = await previewMaternityAward(identity, input);
    const command = { ...input, expectedHash: preview.expectedHash, expectedRevision: preview.expectedRevision, key: randomUUID() };
    const saved = await recordMaternityAward(identity, command); expect(saved.success).toBe(true);
    expect(await recordMaternityAward(identity, command)).toEqual(saved);
    expect(await prisma.payrollEarning.count({ where: { business_id: business.id, source_type: "LEAVE_AWARD" } })).toBe(0);
    expect(await prisma.employeeAttendance.count({ where: { employee_id: motherId } })).toBe(0);
    expect(await refreshStatement(identity, await statementCommand(currentStatementId))).toMatchObject({ success: true });
    const earnings = await prisma.payrollEarning.findMany({ where: { business_id: business.id, source_type: "LEAVE_AWARD" } });
    expect(earnings.map(entry => entry.amount.toFixed(2)).sort()).toEqual(["10.00", "100.01"]);
    expect(earnings.every(entry => entry.earned_on.toISOString().slice(0, 10) === today)).toBe(true);
    expect(await prisma.payrollCommand.count({ where: { business_id: business.id, operation: "MATERNITY_AWARD" } })).toBe(1);
  });
  it("matures each calendar day with exact cent totals and protects published award evidence", async () => {
    const input = awardInput(pastEntitlementId, "2026-09-07"); const preview = await previewMaternityAward(identity, input);
    expect(await recordMaternityAward(identity, { ...input, expectedHash: preview.expectedHash, expectedRevision: preview.expectedRevision, key: randomUUID() })).toMatchObject({ success: true });
    const statement = await prepare("2026-09-07", "2026-09-09");
    expect(statement.gross.toFixed(2)).toBe("330.03"); expect(statement.issues).toEqual([]);
    const earnings = await prisma.payrollEarning.findMany({ where: { source_type: "LEAVE_AWARD", source_id: { startsWith: pastEntitlementId + ":" } } });
    expect(earnings).toHaveLength(6);
    expect(earnings.filter(entry => entry.code === "MATERNITY_SSS").map(entry => entry.amount.toFixed(2))).toEqual(expect.arrayContaining(["100.01", "100.00", "100.01"]));
    expect(earnings.reduce((total, entry) => total.plus(entry.amount), new Prisma.Decimal(0)).toFixed(2)).toBe("330.03");
    expect(await approveStatement(identity, await statementCommand(statement.id))).toMatchObject({ success: true });
    expect(await publishStatement(identity, await statementCommand(statement.id))).toMatchObject({ success: true });
    await expect(prisma.leaveEntitlement.update({ where: { id: pastEntitlementId }, data: { award: Prisma.DbNull } })).rejects.toThrow();
    await expect(prisma.leaveAllocation.updateMany({ where: { entitlement_id: pastEntitlementId }, data: { cancelled_at: new Date() } })).rejects.toThrow();
    await expect(prisma.payrollEarning.update({ where: { id: earnings[0].id }, data: { amount: "0" } })).rejects.toThrow();
    expect((await prisma.payrollStatement.findUniqueOrThrow({ where: { id: statement.id } })).gross.toFixed(2)).toBe("330.03");
  });
  it("requires fresh service-charge sources and atomically distributes exact proportional cents once", async () => {
    const input = chargeInput("SYNTHETIC-COLLECTION-1"); const stalePreview = await previewServiceCharge(identity, input);
    await prisma.workforceSession.updateMany({ where: { business_id: business.id, employee_id: motherId }, data: { revision: { increment: 1 } } });
    expect(await recordServiceCharge(identity, { ...input, expectedHash: stalePreview.expectedHash, expectedRevision: stalePreview.expectedRevision, key: randomUUID() })).toMatchObject({ success: false, code: "STALE_REVIEW" });
    const preview = await previewServiceCharge(identity, input);
    expect(preview.allocations.map(entry => entry.amount)).toEqual(["0.33", "0.67"]);
    const command = { ...input, expectedHash: preview.expectedHash, expectedRevision: preview.expectedRevision, key: randomUUID() };
    const saved = await recordServiceCharge(identity, command); expect(saved.success).toBe(true); if (!saved.success) throw new Error(saved.error); poolId = saved.id;
    expect(await recordServiceCharge(identity, command)).toEqual(saved);
    expect(await prisma.payrollServiceChargePool.count({ where: { business_id: business.id } })).toBe(1);
    const earnings = await prisma.payrollEarning.findMany({ where: { business_id: business.id, source_type: "SERVICE_CHARGE" } });
    expect(earnings.map(entry => entry.amount.toFixed(2)).sort()).toEqual(["0.33", "0.67"]);
    expect(earnings.every(entry => entry.source_id.startsWith(poolId + ":"))).toBe(true);
  });
  it("rejects duplicate collection references, incomplete sessions, and pool mutation", async () => {
    expect(await recordServiceCharge(identity, { ...chargeInput("SYNTHETIC-COLLECTION-1"), expectedHash: "0".repeat(64), expectedRevision: 0, key: randomUUID() })).toMatchObject({ success: false, code: "CONFLICT" });
    await expect(prisma.payrollServiceChargePool.update({ where: { id: poolId }, data: { amount: "2" } })).rejects.toThrow();
    await expect(prisma.payrollServiceChargePool.delete({ where: { id: poolId } })).rejects.toThrow();
    await prisma.workforceSession.updateMany({ where: { business_id: business.id, employee_id: workerId }, data: { confirmed_at: null } });
    await expect(previewServiceCharge(identity, chargeInput("SYNTHETIC-COLLECTION-2"))).rejects.toMatchObject({ code: "BLOCKED" });
  });
  it("denies foreign entitlement and worker references without cross-tenant writes", async () => {
    await expect(previewMaternityAward(foreignIdentity, awardInput(currentEntitlementId, today))).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await recordMaternityAward({ ...identity, userId: foreignOwner.id }, { ...awardInput(currentEntitlementId, today), expectedHash: "0".repeat(64), expectedRevision: 0, key: randomUUID() })).toMatchObject({ success: false, code: "FORBIDDEN" });
    const input = chargeInput("SYNTHETIC-FOREIGN-WORKER"); input.roster[1].employeeId = foreignWorkerId;
    await expect(previewServiceCharge(identity, input)).rejects.toMatchObject({ code: "STALE_REVIEW" });
    expect(await prisma.payrollEarning.count({ where: { business_id: foreignBusiness.id } })).toBe(0);
    expect(await prisma.payrollServiceChargePool.count({ where: { business_id: foreignBusiness.id } })).toBe(0);
  });
});
