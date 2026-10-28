import { amount, decimal, Decimal, sum } from "@/features/payroll/money";
type PayrollAttendance = {
  id: number;
  date: Date;
  status: string;
  is_paid_leave: boolean;
};
type PayrollService = { commission_base: number | null; price: number; payroll_commission_rate?: string | number | { toString(): string } | null };

export const roundCurrency = (value: number) => Number(amount(value));

export function calculatePayslipCompensation<T extends PayrollAttendance>(
  attendance: T[],
  services: PayrollService[],
  dailyRate: number,
  commissionPercentage: number,
  requestedDeduction = 0,
) {
  const seenDates = new Set<string>();
  const uniqueAttendance = attendance.filter((record) => {
    const key = new Date(record.date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
    if (seenDates.has(key)) return false;
    seenDates.add(key);
    return true;
  });
  const daysPresent = uniqueAttendance.filter((record) => record.status === "PRESENT" || record.status === "LATE").length;
  const paidLeaveDays = uniqueAttendance.filter((record) => record.status === "LEAVE" && record.is_paid_leave).length;
  const basic = decimal(dailyRate).times(daysPresent + paidLeaveDays);
  const commission = sum(services.map(service => decimal(service.commission_base ?? service.price).times(service.payroll_commission_rate?.toString() ?? commissionPercentage).div(100)));
  const gross = basic.plus(commission);
  const normalizedDeduction = Number.isFinite(requestedDeduction) ? Math.max(0, requestedDeduction) : 0;
  const deductionValue = Decimal.min(gross, normalizedDeduction);
  const basicSalary = basic.toNumber(); const commissionTotal = commission.toNumber(); const grossSalary = gross.toNumber(); const deduction = deductionValue.toNumber();
  return {
    uniqueAttendance,
    daysPresent,
    paidLeaveDays,
    basicSalary,
    commissionTotal,
    grossSalary,
    deduction,
    netSalary: gross.minus(deductionValue).toNumber(),
  };
}
