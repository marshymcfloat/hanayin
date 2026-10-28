import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { prisma } from "@/prisma/prisma";
import { prepareRun, approveStatement, publishStatement, recordPayment, refreshStatement } from "@/features/payroll/v2/lifecycle";
import { fingerprint } from "@/features/payroll/v2/command";
import { testRules, testEligibility } from "@/features/payroll/v2/fixtures.test-support";
import { day } from "@/features/payroll/v2/period";
import { correctPayrollAttendance } from "@/features/workforce/services/payroll-attendance";
import { randomUUID } from "node:crypto";
import { cleanupPayrollFixture } from "./payroll-fixture-cleanup";
import { previewPaymentDate, reconcilePaymentDate } from "@/features/payroll/v2/payment-reconciliation";
import { decideReviewedLeave } from "@/features/workforce/services/leave-review";
import { decideAdjustment } from "@/features/payroll/v2/setup";
import { phDay } from "@/features/payroll/v2/period";

vi.mock("server-only", () => ({}));
requireTestDatabase();
const fixtures = createSharedWorkflowFactory({ namespace: "payroll-lifecycle", now: new Date("2026-09-07T00:00:00Z") });
const business = fixtures.business();
const ownerUser = fixtures.user({ contactNumber: "639170099001" });
const employeeUser = fixtures.user({ id: "payroll-lifecycle-employee", role: "EMPLOYEE", contactNumber: "639170099002" });
const identity = { businessSlug: business.slug, userId: ownerUser.id };
let employeeId: number;
let statementId: string;
let commissionServiceId: number;
let commissionStatementId: string;
const rulesId = "SYNTHETIC-payroll-lifecycle";
const command = async () => {
  const entry = await prisma.payrollStatement.findUniqueOrThrow({ where: { id: statementId } });
  return { statementId, key: randomUUID(), expectedRevision: entry.revision };
};
beforeAll(async () => {
  await cleanupPayrollFixture(business.id, [ownerUser.id, employeeUser.id], rulesId);
  await prisma.business.create({ data: { id: business.id, name: business.name, slug: business.slug, initials: business.initials } });
  await prisma.user.createMany({ data: [ownerUser, employeeUser].map(user => ({ id: user.id, name: user.name, contact_number: user.contactNumber, role: user.role, hashed_password: user.hashedPassword })) });
  await prisma.owner.create({ data: { business_id: business.id, user_id: ownerUser.id, is_primary: true, permissions: ["PAYROLL_MANAGE", "WORKFORCE_MANAGE", "EMPLOYEES_MANAGE"] } });
  employeeId = (await prisma.employee.create({ data: { business_id: business.id, user_id: employeeUser.id, salary: 0, employment_start: day("2026-09-07") } })).id;
  await prisma.businessHours.create({ data: { business_id: business.id, day_of_week: 1, open_time: "09:00", close_time: "17:00" } });
  await prisma.compensationAgreement.create({ data: { business_id: business.id, employee_id: employeeId, effective_from: day("2026-09-07"), basis: "DAILY", rate: "1000", normal_hours: "8", commission_rate: "10", commission_basis: "ORIGINAL_PRICE", created_by: ownerUser.id } });
  await prisma.employeePayrollProfile.create({ data: { business_id: business.id, employee_id: employeeId, encrypted_identifiers: "synthetic-test-envelope", eligibility: testEligibility, eligibility_history: [{ from: "2026-01-01", region: "TEST", category: "TEST", eligibility: testEligibility }], work_region: "TEST", wage_category: "TEST", monthly_basic: "20000", monthly_basic_history: [{ from: "2026-01", basic: "20000" }], ytd_opening: { taxable: "0", taxWithheld: "0", basicEarned: "0", thirteenthPaid: "0", previousEmployer: false, confirmed: true, year: 2026 }, opening_confirmed_at: new Date() } });
  await prisma.payrollRulePackage.create({ data: { id: rulesId, rules: testRules, sources: ["SYNTHETIC TEST ONLY"], content_hash: fingerprint(testRules), effective_from: day("2026-01-01"), supported_through: day("2026-12-31"), certified_at: new Date(), certified_by: "TEST FIXTURE", certification_evidence: "TEST ONLY: never deploy" } });
  await prisma.payrollSettings.create({ data: { business_id: business.id, calculation_policy: "GOVERNMENT", mode: "ACTIVE", rule_package_id: rulesId, opening_confirmed_at: new Date() } });
  await prisma.employeeAttendance.create({ data: { employee_id: employeeId, date: new Date("2026-09-07T00:00:00+08:00"), status: "LATE", time_in: new Date("2026-09-07T09:10:00+08:00"), time_out: new Date("2026-09-07T17:00:00+08:00") } });
}, 60000);
afterAll(async () => {
  await cleanupPayrollFixture(business.id, [ownerUser.id, employeeUser.id], rulesId);
  await prisma.$disconnect();
});
describe.sequential("real PostgreSQL payroll lifecycle", () => {
  it("prepares full daily pay for LATE and does not mark the statement paid", async () => {
    const input = { key: randomUUID(), expectedRevision: 0, start: "2026-09-07", end: "2026-09-07", paymentDate: "2026-09-15", kind: "REGULAR" as const, employeeIds: [employeeId] };
    const result = await prepareRun(identity, input);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    const statement = await prisma.payrollStatement.findFirstOrThrow({ where: { run_id: result.id } }); statementId = statement.id;
    expect(statement.gross.toFixed(2)).toBe("1000.00");
    expect(statement.net.toFixed(2)).toBe("50.00");
    expect(statement.status).toBe("DRAFT"); expect(statement.payment_state).toBe("UNPAID");
    expect(await prepareRun(identity, input)).toEqual(result);
    expect(await prisma.payrollRun.count({ where: { business_id: business.id } })).toBe(1);
  });
  it("rejects foreign and revoked actors before mutation", async () => {
    expect(await approveStatement({ ...identity, userId: employeeUser.id }, await command())).toMatchObject({ success: false, code: "FORBIDDEN" });
    await prisma.owner.updateMany({ where: { user_id: ownerUser.id }, data: { permissions: ["WORKFORCE_MANAGE"] } });
    expect(await approveStatement(identity, await command())).toMatchObject({ success: false, code: "FORBIDDEN" });
    await prisma.owner.updateMany({ where: { user_id: ownerUser.id }, data: { permissions: ["PAYROLL_MANAGE", "WORKFORCE_MANAGE"] } });
  });
  it("rejects a changed attendance snapshot and requires rereview", async () => {
    await prisma.employeeAttendance.updateMany({ where: { employee_id: employeeId }, data: { time_out: new Date("2026-09-07T16:00:00+08:00"), revision: { increment: 1 } } });
    expect(await approveStatement(identity, await command())).toMatchObject({ success: false, code: "STALE_REVIEW" });
    expect(await refreshStatement(identity, await command())).toMatchObject({ success: true });
    expect(await approveStatement(identity, await command())).toMatchObject({ success: true });
  });
  it("removes obsolete salary earnings after an absence correction", async () => {
    // Refresh an approved draft before changing its unissued facts.
    expect(await refreshStatement(identity, await command())).toMatchObject({ success: true });
    await prisma.employeeAttendance.updateMany({ where: { employee_id: employeeId }, data: { status: "ABSENT" } });
    expect(await refreshStatement(identity, await command())).toMatchObject({ success: true });
    expect((await prisma.payrollStatement.findUniqueOrThrow({ where: { id: statementId } })).gross.toFixed(2)).toBe("0.00");
    expect(await prisma.payrollEarning.count({ where: { business_id: business.id, source_type: "WORKDAY", reversed_at: null } })).toBe(0);
    await prisma.employeeAttendance.updateMany({ where: { employee_id: employeeId }, data: { status: "LATE" } });
    expect(await refreshStatement(identity, await command())).toMatchObject({ success: true });
    const approval = await command();
    const approvals = await Promise.all([approveStatement(identity, approval), approveStatement(identity, approval)]);
    expect(approvals.every(result => result.success)).toBe(true);
  });
  it("publishes exactly once with a private notification and independent unpaid state", async () => {
    const input = await command();
    const result = await publishStatement(identity, input);
    expect(result).toMatchObject({ success: true });
    expect(await publishStatement(identity, input)).toEqual(result);
    const statement = await prisma.payrollStatement.findUniqueOrThrow({ where: { id: statementId } });
    expect(statement.status).toBe("PUBLISHED"); expect(statement.payment_state).toBe("UNPAID"); expect(statement.paid_amount.toFixed(2)).toBe("0.00");
    expect(await prisma.payrollNotification.count({ where: { statement_id: statementId, user_id: employeeUser.id } })).toBe(1);
  });
  it("preserves published sources and prevents cascade deletion", async () => {
    const attendance = await prisma.employeeAttendance.findFirstOrThrow({ where: { employee_id: employeeId } });
    const input = { key: randomUUID(), expectedRevision: attendance.revision, employeeId, date: "2026-09-07", status: "ABSENT" as const, breaks: [], reason: "Reviewed source correction", confirmFullDay: false };
    expect(await correctPayrollAttendance(identity, input)).toMatchObject({ success: false, code: "BLOCKED" });
    await expect(prisma.payrollStatement.update({ where: { id: statementId }, data: { net: "0" } })).rejects.toThrow();
    await expect(prisma.employee.delete({ where: { id: employeeId } })).rejects.toThrow();
  });
  it("records installments once and cannot pay beyond the outstanding amount", async () => {
    const first = { ...await command(), amount: "20.00", date: "2026-09-15", method: "BANK" as const, reference: "SYNTHETIC-PARTIAL" };
    const result = await recordPayment(identity, first); expect(result.success).toBe(true);
    await expect(previewPaymentDate(identity, statementId, "2026-10-01", "1.00")).rejects.toThrow("contribution month");
    expect(await recordPayment(identity, first)).toEqual(result);
    expect((await prisma.payrollStatement.findUniqueOrThrow({ where: { id: statementId } })).payment_state).toBe("PARTIAL");
    expect(await recordPayment(identity, { ...await command(), amount: "100.00", date: "2026-09-15", method: "CASH", reference: "SYNTHETIC-EXCESS" })).toMatchObject({ success: false, code: "INVALID_INPUT" });
    const remaining = (await prisma.payrollStatement.findUniqueOrThrow({ where: { id: statementId } })).net.minus("20").toFixed(2);
    const input = { ...await command(), amount: remaining, date: "2026-09-16", method: "CASH" as const, reference: "SYNTHETIC-FINAL" };
    expect(await recordPayment(identity, input)).toMatchObject({ success: false, code: "BLOCKED" });
    const preview = await previewPaymentDate(identity, statementId, input.date, input.amount);
    const reconciliation = await reconcilePaymentDate(identity, { ...input, key: randomUUID(), expectedHash: preview.expectedHash, reason: "Verified actual payment date and tax allocation" });
    expect(reconciliation.success).toBe(true); if (!reconciliation.success) throw new Error(reconciliation.error);
    expect(await recordPayment(identity, { ...input, key: randomUUID(), reconciliationId: reconciliation.id })).toMatchObject({ success: true });
    const statement = await prisma.payrollStatement.findUniqueOrThrow({ where: { id: statementId } }); expect(statement.payment_state).toBe("PAID"); expect(statement.paid_amount.eq(statement.net)).toBe(true);
    expect(await prisma.payrollPayment.count({ where: { statement_id: statementId } })).toBe(2);
    const lines = await prisma.payrollStatementLine.findMany({ where: { statement_id: statementId }, include: { payment_allocations: true } });
    for (const line of lines) expect(line.payment_allocations.reduce((total, allocation) => total.plus(allocation.amount), line.amount.minus(line.amount)).eq(line.amount)).toBe(true);
  });
  it("captures zero commission bases and requires full customer payment independently of status", async () => {
    const catalog = await prisma.service.create({ data: { business_id: business.id, name: "Synthetic commission work", category: "GENERAL", price: 1000, duration: 30 } });
    const booking = await prisma.booking.create({ data: { business_id: business.id, status: "COMPLETED", payment_status: "UNPAID", grand_total: 1000, amount_paid: 0, total_discount: 0, is_anonymous_walk_in: true, customer_label: "Synthetic payroll work" } });
    const work = await prisma.availedService.create({ data: { booking_id: booking.id, service_id: catalog.id, served_by_id: employeeId, status: "COMPLETED", price: 1000, final_price: 800, commission_base: 0, completed_at: new Date("2026-09-07T10:00:00+08:00") } });
    expect(work).not.toHaveProperty("payroll_commission_rate");
    const original = await prisma.payrollEarning.findFirstOrThrow({ where: { source_type: "SERVICE", source_id: String(work.id), reversed_at: null } });
    expect(original.amount.toFixed(2)).toBe("0.00"); expect(original.rate.toString()).toBe("10"); expect(original.payable_on).toBeNull();
    await prisma.booking.update({ where: { id: booking.id }, data: { payment_status: "PAID", amount_paid: 500 } });
    expect((await prisma.payrollEarning.findUniqueOrThrow({ where: { id: original.id } })).payable_on).toBeNull();
    await prisma.booking.update({ where: { id: booking.id }, data: { amount_paid: 1000 } });
    expect((await prisma.payrollEarning.findUniqueOrThrow({ where: { id: original.id } })).payable_on?.toISOString().slice(0, 10)).toBe(phDay(new Date()));
  });
  it("preserves captured work rates and labels late-paid commissions by their original work period", async () => {
    const catalog = await prisma.service.findFirstOrThrow({ where: { business_id: business.id } });
    const booking = await prisma.booking.create({ data: { business_id: business.id, status: "COMPLETED", payment_status: "PAID", grand_total: 20000, amount_paid: 20000, total_discount: 0, is_anonymous_walk_in: true, customer_label: "Synthetic payroll work" } });
    const work = await prisma.availedService.create({ data: { booking_id: booking.id, service_id: catalog.id, served_by_id: employeeId, status: "COMPLETED", price: 20000, final_price: 18000, commission_base: 18000, completed_at: new Date("2026-09-07T10:00:00+08:00") } });
    commissionServiceId = work.id;
    await prisma.employee.update({ where: { id: employeeId }, data: { commission_percentage: 90 } });
    const earning = await prisma.payrollEarning.findFirstOrThrow({ where: { source_type: "SERVICE", source_id: String(work.id), reversed_at: null } });
    expect(earning.amount.toFixed(2)).toBe("2000.00"); expect(earning.rate.toString()).toBe("10");
    const date = phDay(new Date());
    const prepared = await prepareRun(identity, { key: randomUUID(), expectedRevision: 0, start: date, end: date, paymentDate: date, kind: "OFF_CYCLE", employeeIds: [employeeId] });
    expect(prepared.success).toBe(true); if (!prepared.success) throw new Error(prepared.error);
    const statement = await prisma.payrollStatement.findFirstOrThrow({ where: { run_id: prepared.id } }); commissionStatementId = statement.id;
    const line = await prisma.payrollStatementLine.findFirstOrThrow({ where: { statement_id: statement.id, earning_id: earning.id } });
    expect(line.source).toMatchObject({ priorPeriod: true, earnedOn: "2026-09-07" });
    expect(await approveStatement(identity, { key: randomUUID(), expectedRevision: statement.revision, statementId: statement.id })).toMatchObject({ success: true });
    const approved = await prisma.payrollStatement.findUniqueOrThrow({ where: { id: statement.id } });
    expect(await publishStatement(identity, { key: randomUUID(), expectedRevision: approved.revision, statementId: statement.id })).toMatchObject({ success: true });
  });
  it("handles successive source corrections without silently recovering a published commission twice", async () => {
    await prisma.availedService.update({ where: { id: commissionServiceId }, data: { commission_base: 19000 } });
    const first = await prisma.payrollAdjustment.findFirstOrThrow({ where: { business_id: business.id, original_statement_id: commissionStatementId, disposition: "PENDING" } });
    expect(first.amount.toFixed(2)).toBe("-100.00");
    expect(await decideAdjustment(identity, { key: randomUUID(), expectedRevision: first.revision, adjustmentId: first.id, disposition: "APPROVED", reason: "Verified and authorized source recovery" })).toMatchObject({ success: true });
    await prisma.availedService.update({ where: { id: commissionServiceId }, data: { cancelled_at: new Date() } });
    const pending = await prisma.payrollAdjustment.findMany({ where: { business_id: business.id, original_statement_id: commissionStatementId, disposition: "PENDING" } });
    expect(pending).toHaveLength(1); expect(pending[0].amount.toFixed(2)).toBe("-1900.00");
    expect((await prisma.payrollStatement.findUniqueOrThrow({ where: { id: commissionStatementId } })).paid_amount.toFixed(2)).toBe("0.00");
    expect((await prisma.payrollEarning.findFirstOrThrow({ where: { source_type: "SERVICE", source_id: String(commissionServiceId), statement_id: commissionStatementId } })).amount.toFixed(2)).toBe("2000.00");
    await expect(prisma.availedService.delete({ where: { id: commissionServiceId } })).rejects.toThrow();
  });
  it("serializes two different payment submissions against the same remaining balance", async () => {
    const statement = await prisma.payrollStatement.findUniqueOrThrow({ where: { id: commissionStatementId } });
    const input = { statementId: statement.id, expectedRevision: statement.revision, amount: "800.00", date: phDay(new Date()), method: "BANK" as const };
    const results = await Promise.all([recordPayment(identity, { ...input, key: randomUUID(), reference: "SYNTHETIC-CONCURRENT-A" }), recordPayment(identity, { ...input, key: randomUUID(), reference: "SYNTHETIC-CONCURRENT-B" })]);
    expect(results.filter(result => result.success)).toHaveLength(1);
    expect((await prisma.payrollStatement.findUniqueOrThrow({ where: { id: statement.id } })).paid_amount.toFixed(2)).toBe("800.00");
    await expect(prisma.payrollStatement.update({ where: { id: statement.id }, data: { paid_amount: "900.00" } })).rejects.toThrow();
  });
  it("approves future leave once without creating future attendance", async () => {
    const date = new Date(day(phDay(new Date())).getTime() + 8 * 86400000); while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() + 1);
    const request = await prisma.leaveRequest.create({ data: { business_id: business.id, employee_id: employeeId, start_date: new Date(date.getTime() - 8 * 3600000), end_date: new Date(date.getTime() - 8 * 3600000), type: "VACATION", reason: "Synthetic future approved leave" } });
    const input = { requestId: request.id, expectedRevision: 0, decision: "APPROVED" as const, paid: true, reason: "Verified future scheduled paid leave" };
    const results = await Promise.all([decideReviewedLeave(identity, { ...input, key: randomUUID() }), decideReviewedLeave(identity, { ...input, key: randomUUID() })]);
    expect(results.filter(result => result.success)).toHaveLength(1);
    expect(await prisma.leaveAllocation.count({ where: { leave_request_id: request.id } })).toBe(1);
    expect(await prisma.employeeAttendance.count({ where: { employee_id: employeeId, date: new Date(date.getTime() - 8 * 3600000) } })).toBe(0);
  });
});



