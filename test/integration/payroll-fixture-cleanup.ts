import { prisma } from "@/prisma/prisma";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";

export async function cleanupPayrollFixture(businessId: string, userIds: string[], ruleId: string) {
  requireTestDatabase();
  if (!businessId.startsWith("payroll-lifecycle-") || userIds.some(id => !id.startsWith("payroll-lifecycle-")) || !ruleId.startsWith("SYNTHETIC-")) throw new Error("Invalid payroll fixture namespace");
  await prisma.$transaction(async tx => {
    // Only this disposable fixture transaction bypasses immutable-history triggers.
    await tx.$executeRaw`SELECT set_config('session_replication_role', 'replica', true)`;
    for (const table of ["PayrollNotification", "PayrollPaymentAllocation", "PayrollPayment", "PayrollPaymentReconciliation", "PayrollStatementLine", "PayrollAssessment", "PayrollAdjustment", "PayrollEarning", "PayrollStatement", "PayrollRun", "PayrollCommand", "PayrollSettings", "PayrollServiceChargePool", "LeaveAllocation", "LeaveEntitlement", "AttendanceRevision", "AttendanceCorrectionRequest", "WorkforceSession", "EmployeePayrollProfile", "CompensationAgreement"]) {
      await tx.$executeRawUnsafe('DELETE FROM "' + table + '" WHERE "business_id" = $1', businessId);
    }
    await tx.$executeRaw`DELETE FROM "EmployeeAttendance" WHERE "employee_id" IN (SELECT id FROM "Employee" WHERE "business_id" = ${businessId})`;
    await tx.$executeRaw`DELETE FROM "Payslip" WHERE "employee_id" IN (SELECT id FROM "Employee" WHERE "business_id" = ${businessId})`;
    await tx.$executeRaw`DELETE FROM "LeaveRequest" WHERE "business_id" = ${businessId}`;
    await tx.$executeRaw`DELETE FROM "AvailedService" WHERE "booking_id" IN (SELECT id FROM "Booking" WHERE "business_id" = ${businessId})`;
    await tx.$executeRaw`DELETE FROM "Booking" WHERE "business_id" = ${businessId}`;
    await tx.$executeRaw`DELETE FROM "Service" WHERE "business_id" = ${businessId}`;
    await tx.$executeRaw`DELETE FROM "Customer" WHERE "business_id" = ${businessId}`;
    await tx.$executeRaw`DELETE FROM "Employee" WHERE "business_id" = ${businessId}`;
    await tx.$executeRaw`DELETE FROM "Owner" WHERE "business_id" = ${businessId}`;
    await tx.$executeRaw`DELETE FROM "BusinessHours" WHERE "business_id" = ${businessId}`;
    await tx.$executeRaw`DELETE FROM "AuditLog" WHERE "business_id" = ${businessId}`;
    await tx.$executeRaw`DELETE FROM "Business" WHERE id = ${businessId}`;
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
    await tx.payrollRulePackage.deleteMany({ where: { id: ruleId } });
  });
}
