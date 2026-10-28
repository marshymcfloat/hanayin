import "server-only";
import type { LeaveRequest, Prisma } from "@/prisma/generated/prisma/client";
import { payrollDecimal as decimal, PayrollError } from "@/features/payroll/public";

export async function allocateApprovedLeave(tx: Prisma.TransactionClient, request: Pick<LeaveRequest, "id" | "employee_id" | "business_id" | "start_date" | "end_date" | "benefit_code">, paid: boolean) {
  const employee = await tx.employee.findFirst({ where: { id: request.employee_id, business_id: request.business_id, archived_at: null }, include: { schedule: true, business: { select: { formal_schedule_enabled: true, business_hours: true } } } });
  if (!employee) throw new PayrollError("NOT_FOUND", "Employee not found.");
  const statutory = request.benefit_code !== "DISCRETIONARY";
  const start = new Date(request.start_date.getTime() + 8 * 3600000); const end = new Date(request.end_date.getTime() + 8 * 3600000);
  const entitlement = statutory ? await tx.leaveEntitlement.findFirst({ where: { business_id: request.business_id, employee_id: employee.id, benefit_code: request.benefit_code, period_start: { lte: start }, period_end: { gte: end } }, include: { allocations: { where: { cancelled_at: null } } } }) : null;
  if (statutory && (!paid || !entitlement)) throw new PayrollError("BLOCKED", "Verify the statutory paid-leave entitlement before approval.");
  let consumed = entitlement?.allocations.reduce((total, row) => total.plus(row.units), entitlement.converted_units) ?? decimal(0);
  let count = 0;
  for (let date = start; date <= end; date = new Date(date.getTime() + 86400000)) {
    const weekday = date.getUTCDay();
    const scheduled = employee.business.formal_schedule_enabled && employee.schedule.length ? employee.schedule.some(row => row.day_of_week === weekday) : !employee.recurring_days_off.includes(weekday) && employee.business.business_hours.some(row => row.day_of_week === weekday && !row.is_closed);
    if (!scheduled && !["MATERNITY", "SPECIAL_WOMEN"].includes(request.benefit_code)) continue;
    if ((employee.employment_start && date < employee.employment_start) || (employee.employment_end && date > employee.employment_end)) throw new PayrollError("BLOCKED", "Leave dates must fall within confirmed employment.");
    const existing = await tx.employeeAttendance.findFirst({ where: { employee_id: employee.id, date: new Date(date.getTime() - 8 * 3600000) } });
    if (existing?.paid_in_payslip_id || (existing && ["PRESENT", "LATE"].includes(existing.status))) throw new PayrollError("BLOCKED", "Leave conflicts with recorded or paid work. Review attendance first.");
    if (await tx.payrollEarning.findFirst({ where: { business_id: request.business_id, employee_id: employee.id, source_type: { in: ["WORKDAY", "LEAVE_AWARD"] }, earned_on: date, statement: { is: { status: "PUBLISHED" } } }, select: { id: true } })) throw new PayrollError("BLOCKED", "Published work requires a payroll adjustment.");
    consumed = consumed.plus(1);
    if (entitlement && consumed.gt(entitlement.granted_units)) throw new PayrollError("BLOCKED", "This request exceeds the verified available leave balance.");
    await tx.leaveAllocation.create({ data: { business_id: request.business_id, employee_id: employee.id, leave_request_id: request.id, work_date: date, units: 1, paid, benefit_code: request.benefit_code, entitlement_id: entitlement?.id, funding: entitlement?.funding ?? "EMPLOYER" } });
    count++;
  }
  if (!count) throw new PayrollError("BLOCKED", "No eligible scheduled leave dates were found. Verify the employee's schedule.");
}
