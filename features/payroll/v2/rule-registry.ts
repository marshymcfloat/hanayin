import "server-only";
import { z } from "zod";
import { prisma } from "@/prisma/prisma";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { phRulesSchema } from "./statutory";
import { fingerprint, json } from "./command";
import { day } from "./period";
import { dateOnly } from "./schemas";
import { PayrollError } from "./contracts";
import { statutoryFixtureSchema, verifyStatutoryFixtures } from "./rule-fixtures";

const officialHosts = ["bir.gov.ph", "sss.gov.ph", "philhealth.gov.ph", "pagibigfund.gov.ph", "pagibig.gov.ph", "dole.gov.ph", "officialgazette.gov.ph", "pco.gov.ph", "judiciary.gov.ph"];
const source = z.object({ agency: z.string().min(1), url: z.string().url().refine(value => { const url = new URL(value); return url.protocol === "https:" && officialHosts.some(host => url.hostname === host || url.hostname.endsWith("." + host)); }, "Use the issuing agency's official source"), issuance: z.string().min(1), effectiveFrom: dateOnly, verifiedOn: dateOnly });
export const registerRulesSchema = z.object({ id: z.string().regex(/^[A-Z0-9-]{3,100}$/), effectiveFrom: dateOnly, supportedThrough: dateOnly, rules: phRulesSchema, sources: z.array(source).min(5), fixtures: z.array(statutoryFixtureSchema).min(8).max(1000) })
  .refine(value => value.supportedThrough >= value.effectiveFrom)
  .refine(value => ["BIR", "SSS", "PHILHEALTH", "PAGIBIG", "DOLE"].every(agency => value.sources.some(entry => entry.agency === agency)), "Every issuing agency requires a source reference")
  .refine(value => value.rules.exportTemplates.every(template => value.sources.some(entry => entry.agency === template.agency && entry.url === template.source)), "Export layouts must reference the issuing agency manifest");
export const certifyRulesSchema = z.object({ id: z.string(), expectedHash: z.string().regex(/^[a-f0-9]{64}$/), reviewer: z.string().trim().min(3), qualifications: z.string().trim().min(10), evidence: z.string().trim().min(20), fixtureHash: z.string().regex(/^[a-f0-9]{64}$/) });
async function administrator() {
  const auth = await requirePlatformAdmin();
  if (!auth.success || auth.session.user.role !== "PLATFORM_ADMIN") throw new PayrollError("FORBIDDEN", "Platform administrator access is required.");
  return auth.session.user.id;
}
export async function registerRulePackage(input: z.infer<typeof registerRulesSchema>) {
  const userId = await administrator();
  return prisma.$transaction(async tx => {
    if (!await tx.user.findFirst({ where: { id: userId, role: "PLATFORM_ADMIN" }, select: { id: true } })) throw new PayrollError("FORBIDDEN", "Administrator access changed.");
    verifyStatutoryFixtures(input.rules, input.fixtures);
    const hash = fingerprint({ rules: input.rules, sources: input.sources, fixtures: input.fixtures, effectiveFrom: input.effectiveFrom, supportedThrough: input.supportedThrough });
    const existing = await tx.payrollRulePackage.findUnique({ where: { id: input.id } });
    if (existing) { if (existing.content_hash !== hash) throw new PayrollError("CONFLICT", "Register changed rules under a new version."); return { id: existing.id, hash: existing.content_hash, fixtureHash: fingerprint(input.fixtures) }; }
    const packageRecord = await tx.payrollRulePackage.create({ data: { id: input.id, effective_from: day(input.effectiveFrom), supported_through: day(input.supportedThrough), rules: json(input.rules), sources: json(input.sources), fixture_manifest: json(input.fixtures), content_hash: hash } });
    return { id: packageRecord.id, hash: packageRecord.content_hash, fixtureHash: fingerprint(input.fixtures) };
  });
}
export async function certifyRulePackage(input: z.infer<typeof certifyRulesSchema>) {
  const userId = await administrator();
  return prisma.$transaction(async tx => {
    if (!await tx.user.findFirst({ where: { id: userId, role: "PLATFORM_ADMIN" }, select: { id: true } })) throw new PayrollError("FORBIDDEN", "Administrator access changed.");
    const record = await tx.payrollRulePackage.findUnique({ where: { id: input.id } });
    if (!record || record.content_hash !== input.expectedHash || record.certified_at) throw new PayrollError("STALE_REVIEW", "Rule package changed or was already certified.");
    const rules = phRulesSchema.parse(record.rules);
    const fixtures = z.array(statutoryFixtureSchema).parse(record.fixture_manifest);
    verifyStatutoryFixtures(rules, fixtures);
    if (fingerprint(fixtures) !== input.fixtureHash) throw new PayrollError("STALE_REVIEW", "The independent review must reference this exact fixture manifest.");
    if (["BIR", "SSS", "PHILHEALTH", "PAGIBIG"].some(agency => !rules.exportTemplates.some(template => template.agency === agency))) throw new PayrollError("BLOCKED", "Independent review must cover all four government export layouts.");
    const evidence = json({ reviewer: input.reviewer, qualifications: input.qualifications, evidence: input.evidence, fixtureHash: input.fixtureHash });
    await tx.payrollRulePackage.update({ where: { id: record.id }, data: { certified_at: new Date(), certified_by: userId, certification_evidence: JSON.stringify(evidence) } });
    await tx.platformActionLog.create({ data: { actor_user_id: userId, action: "PAYROLL_RULES_CERTIFIED", target_type: "PayrollRulePackage", target_id: record.id, metadata: json({ content_hash: record.content_hash, fixture_hash: input.fixtureHash, certified: true }) } });
    return { id: record.id };
  }, { isolationLevel: "Serializable" });
}
export async function rulePackageInventory() {
  await administrator();
  return prisma.payrollRulePackage.findMany({ orderBy: { effective_from: "desc" }, take: 100, select: { id: true, content_hash: true, certified_at: true, effective_from: true, supported_through: true, fixture_manifest: true } });
}
