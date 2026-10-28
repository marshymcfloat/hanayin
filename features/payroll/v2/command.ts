import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/prisma/prisma";
import type { Prisma } from "@/prisma/generated/prisma/client";
import type { OwnerPermission } from "@/prisma/generated/prisma/enums";
import { logAudit } from "@/lib/services/audit";
import { logger } from "@/lib/logger";
import { payrollOwner } from "./access";
import { PayrollError, type PayrollIdentity, type PayrollCommandResult } from "./contracts";

export function fingerprint(value: unknown): string {
  function normalize(input: unknown): unknown {
    if (input instanceof Date) return input.toISOString();
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      if ("toJSON" in input && typeof input.toJSON === "function") return normalize(input.toJSON());
      return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, normalize(entry)]));
    }
    return input;
  }
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}
export function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
export function stale(actual: number, expected: number) {
  if (actual !== expected) throw new PayrollError("STALE_REVIEW", "These records changed. Refresh and review the updated amounts.");
}
export async function payrollCommand<T extends { key: string }>(
  identity: PayrollIdentity, operation: string, input: T,
  work: (tx: Prisma.TransactionClient, actor: Awaited<ReturnType<typeof payrollOwner>>) => Promise<{ id: string; revision?: number }>,
  permission: OwnerPermission = "PAYROLL_MANAGE",
): Promise<PayrollCommandResult> {
  const payloadHash = fingerprint({ operation, input });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const actor = await payrollOwner(identity, tx, permission);
        const existing = await tx.payrollCommand.findUnique({ where: { business_id_key: { business_id: actor.businessId, key: input.key } } });
        if (existing) {
          if (existing.actor_id !== actor.userId || existing.operation !== operation || existing.payload_hash !== payloadHash) throw new PayrollError("CONFLICT", "This request key was already used for different data.");
          return { success: true as const, ...(existing.result as { id: string; revision?: number }) };
        }
        const result = await work(tx, actor);
        await tx.payrollCommand.create({ data: { business_id: actor.businessId, actor_id: actor.userId, key: input.key, operation, payload_hash: payloadHash, result: json(result) } });
        await logAudit(tx, { businessId: actor.businessId, actorId: actor.userId, entityType: "Payroll", entityId: result.id, action: "UPDATED", changes: { after: { operation, command_key: input.key, revision: result.revision ?? null } } });
        return { success: true as const, ...result };
      }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 20000 });
    } catch (error) {
      if (error instanceof PayrollError) return { success: false, code: error.code, error: error.message };
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if ((code === "P2034" || code === "P2002") && attempt < 2) continue;
      logger.warn("Payroll command failed", { operation, code: typeof code === "string" ? code : "UNEXPECTED" });
      return { success: false, code: code === "P2034" || code === "P2002" ? "CONFLICT" : "UNAVAILABLE", error: "Unable to save payroll. Your request can be retried safely." };
    }
  }
  return { success: false, code: "CONFLICT", error: "Another change is being saved. Refresh and try again." };
}
