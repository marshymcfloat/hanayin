"use server";
import { registerRulesSchema, certifyRulesSchema, registerRulePackage, certifyRulePackage, rulePackageInventory } from "@/features/payroll/v2/rule-registry";
import { fingerprint } from "@/features/payroll/v2/command";
import { PayrollError } from "@/features/payroll/v2/contracts";

export async function registerPayrollRulesAction(input: unknown) {
  const parsed = registerRulesSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Invalid rule package or official source manifest." };
  try { return { success: true as const, ...await registerRulePackage(parsed.data) }; }
  catch (error) { return { success: false as const, error: error instanceof PayrollError ? error.message : "Could not register this rule package." }; }
}
export async function getPayrollRuleInventoryAction() {
  try { const records = await rulePackageInventory(); return { success: true as const, data: records.map(entry => ({ id: entry.id, hash: entry.content_hash, fixtureHash: fingerprint(entry.fixture_manifest), certified: Boolean(entry.certified_at), from: entry.effective_from.toISOString().slice(0, 10), through: entry.supported_through.toISOString().slice(0, 10) })) }; }
  catch (error) { return { success: false as const, error: error instanceof PayrollError ? error.message : "Rule-package inventory is unavailable." }; }
}
export async function certifyPayrollRulesAction(input: unknown) {
  const parsed = certifyRulesSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Independent reviewer evidence and fixture hash are required." };
  try { return { success: true as const, ...await certifyRulePackage(parsed.data) }; }
  catch (error) { return { success: false as const, error: error instanceof PayrollError ? error.message : "Could not certify this rule package." }; }
}
