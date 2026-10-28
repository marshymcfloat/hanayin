import { z } from "zod";
import { amount, decimal, sum } from "@/features/payroll/money";
import { dateOnly, decimalString } from "@/features/payroll/v2/schemas";
import { PayrollError } from "@/features/payroll/v2/contracts";

export const serviceChargeRulesSchema = z.object({ version: z.string().min(1), taxable: z.boolean(), source: z.string().url().refine(value => new URL(value).hostname === "dole.gov.ph" || new URL(value).hostname.endsWith(".dole.gov.ph"), "Use an official DOLE source"), maxPeriodDays: z.number().int().positive().max(16) });
export const serviceChargeInputSchema = z.object({
  reference: z.string().trim().min(3).max(200), from: dateOnly, to: dateOnly,
  amount: decimalString.refine(value => decimal(value).gt(0) && decimal(value).decimalPlaces() <= 2, "Enter a positive amount with at most two decimal places"),
  collectionEvidence: z.string().trim().min(10).max(1000),
  externalWorkersPresent: z.boolean(),
  roster: z.array(z.object({ employeeId: z.number().int().positive(), eligible: z.boolean(), evidence: z.string().trim().min(10).max(1000) })).min(1).max(500),
}).refine(value => value.from <= value.to, "The collection period end must follow its start")
  .refine(value => new Set(value.roster.map(entry => entry.employeeId)).size === value.roster.length, "Review each employee once");
export type ServiceChargeInput = z.infer<typeof serviceChargeInputSchema>;
export function distributeServiceCharge(pool: string, workers: { employeeId: number; workedMilliseconds: string }[]) {
  const total = decimal(pool);
  if (total.lte(0) || total.decimalPlaces() > 2 || new Set(workers.map(entry => entry.employeeId)).size !== workers.length || workers.some(entry => !Number.isInteger(entry.employeeId) || entry.employeeId <= 0 || !/^\d+$/.test(entry.workedMilliseconds))) throw new PayrollError("BLOCKED", "Verify the pool amount and employee work durations.");
  const active = workers.filter(entry => decimal(entry.workedMilliseconds).gt(0));
  const worked = sum(active.map(entry => entry.workedMilliseconds));
  if (worked.lte(0)) throw new PayrollError("BLOCKED", "No confirmed eligible work is available for this collection period.");
  const cents = total.times(100);
  const shares = active.map(entry => {
    const exact = cents.times(entry.workedMilliseconds).div(worked); const floor = exact.floor();
    return { ...entry, cents: floor, remainder: exact.minus(floor) };
  });
  let residual = cents.minus(sum(shares.map(entry => entry.cents))).toNumber();
  const remainderOrder = [...shares].sort((a, b) => b.remainder.comparedTo(a.remainder) || a.employeeId - b.employeeId);
  for (const entry of remainderOrder) { if (!residual) break; entry.cents = entry.cents.plus(1); residual--; }
  return shares.sort((a, b) => a.employeeId - b.employeeId).map(entry => ({ employeeId: entry.employeeId, workedMilliseconds: entry.workedMilliseconds, amount: amount(entry.cents.div(100)), allocationBasis: "VERIFIED_WORK_TIME" as const }));
}
