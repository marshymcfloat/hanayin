import { prisma } from "@/prisma/prisma";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";

export async function cleanupBenefitFixture(businessIds: string[], userIds: string[], ruleId: string) {
  requireTestDatabase();
  if (!businessIds.length || businessIds.some(id => !id.startsWith("payroll-benefit-")) || userIds.some(id => !id.startsWith("payroll-benefit-")) || !ruleId.startsWith("SYNTHETIC-payroll-benefit-")) throw new Error("Invalid benefit fixture namespace");
  await prisma.$transaction(async tx => {
    // Retention is bypassed only inside this verified disposable fixture transaction.
    await tx.$executeRaw`SELECT set_config('session_replication_role', 'replica', true)`;
    for (const businessId of businessIds) {
      for (const table of ["PayrollNotification", "PayrollPaymentAllocation", "PayrollPayment", "PayrollPaymentReconciliation", "PayrollStatementLine", "PayrollAssessment", "PayrollAdjustment", "PayrollEarning", "PayrollStatement", "PayrollRun", "PayrollCommand", "PayrollSettings", "PayrollServiceChargePool", "LeaveAllocation", "LeaveEntitlement", "AttendanceRevision", "AttendanceCorrectionRequest", "WorkforceSession", "EmployeePayrollProfile", "CompensationAgreement", "LeaveRequest", "OutboxMessage", "AuditLog", "BusinessHours"]) await tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE business_id=$1`, businessId);
      for (const table of ["EmployeeAttendance", "EmployeeSchedule", "Payslip"]) await tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE employee_id IN (SELECT id FROM "Employee" WHERE business_id=$1)`, businessId);
      await tx.employee.deleteMany({ where: { business_id: businessId } });
      await tx.owner.deleteMany({ where: { business_id: businessId } });
      await tx.business.deleteMany({ where: { id: businessId } });
    }
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
    await tx.payrollRulePackage.deleteMany({ where: { id: ruleId } });
  });
}
