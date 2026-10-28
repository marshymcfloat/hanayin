import "server-only";
import { prisma } from "@/prisma/prisma";
import { payrollSelf } from "./access";
import { calculateStatement } from "./calculation";
import { currentWorkPeriod, day, phDay } from "./period";
import type { PayrollIdentity } from "./contracts";

export async function currentPayEstimate(identity: PayrollIdentity) {
  return prisma.$transaction(async tx => {
    const actor = await payrollSelf(identity, tx);
    const settings = await tx.payrollSettings.findUnique({ where: { business_id: actor.businessId }, select: { mode: true, cadence: true, calculation_policy: true, simple_effective_from: true } });
    if (settings?.mode !== "ACTIVE") return null;
    const period = currentWorkPeriod(settings.cadence, phDay(new Date()));
    const start = settings.calculation_policy === "SIMPLE" && settings.simple_effective_from && settings.simple_effective_from > day(period.start) ? settings.simple_effective_from : day(period.start);
    if (start > day(period.end)) return null;
    const result = await calculateStatement(tx, actor.businessId, actor.employeeId, { id: "ESTIMATE", start_date: start, end_date: day(period.end), payment_date: day(period.end), kind: "REGULAR", calculation_policy: settings.calculation_policy }, undefined, false);
    return { start: start.toISOString().slice(0, 10), end: period.end, calculationPolicy: settings.calculation_policy, gross: result.calculation.gross, net: result.calculation.net, issues: result.calculation.issues, lines: result.calculation.lines };
  }, { isolationLevel: "RepeatableRead", timeout: 20000 });
}
