import type { PayrollWorkspaceView } from "@/features/payroll/v2/contracts";

export type PaySettingsEmployee = Pick<PayrollWorkspaceView["employees"][number], "id" | "name" | "revision" | "employmentStart" | "employmentEnd" | "agreements">;
export type EmployeePaySettings = {
  employee: PaySettingsEmployee;
  policy: "SIMPLE" | "GOVERNMENT";
  mode: "LEGACY" | "SHADOW" | "ACTIVE";
  legacy: { dailyRate: string; commissionRate: string };
};
export type PaySettingsDraft = {
  employeeId: number; expectedRevision: number; from: string;
  basis: "DAILY" | "HOURLY" | "MONTHLY"; rate: string; hours: string;
  commissionRate: string; commissionBasis: "ORIGINAL_PRICE" | "DISCOUNTED_PRICE";
  monthlyDivisor?: string;
};
export function currentPayTerms(employee: PaySettingsEmployee, date: string) {
  return employee.agreements.find(entry => entry.from <= date && (!entry.to || entry.to >= date));
}
export function paySettingsDraft(employee: PaySettingsEmployee, date: string): PaySettingsDraft {
  const terms = currentPayTerms(employee, date) ?? [...employee.agreements].filter(entry => entry.from > date).sort((a, b) => a.from.localeCompare(b.from))[0];
  return { employeeId: employee.id, expectedRevision: employee.revision, from: employee.employmentStart && employee.employmentStart > date ? employee.employmentStart : date, basis: (terms?.basis ?? "DAILY") as PaySettingsDraft["basis"], rate: terms?.rate ?? "", hours: terms?.hours ?? "8", commissionRate: terms?.commissionRate ?? "0", commissionBasis: terms?.commissionBasis === "DISCOUNTED_PRICE" ? "DISCOUNTED_PRICE" : "ORIGINAL_PRICE", monthlyDivisor: terms?.monthlyDivisor ?? undefined };
}
