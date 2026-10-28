import { z } from "zod";

const money = z.number().finite().nonnegative().max(2147483647);
const ids = z.array(z.number().int().positive()).min(1).max(100).refine(values => new Set(values).size === values.length, "Choose each service only once.");
export const serviceRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("SERVICES"), serviceIds: ids }),
  z.object({ kind: z.literal("CATEGORY"), category: z.string().trim().min(1).max(200), minPrice: money.optional(), maxPrice: money.optional() }).refine(value => value.minPrice === undefined || value.maxPrice === undefined || value.minPrice <= value.maxPrice, "Maximum price must not be below minimum price."),
]);
export const packageChoiceSchema = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), label: z.string().trim().min(1).max(120), rule: serviceRuleSchema });
export const packageChoicesSchema = z.array(packageChoiceSchema).max(20).refine(values => new Set(values.map(value => value.id)).size === values.length, "Choice identifiers must be unique.");
export const conditionalSaleSchema = z.object({ version: z.literal(1), groups: z.tuple([serviceRuleSchema, serviceRuleSchema]), target: z.enum(["BOTH", "FIRST", "SECOND"]) });
export type ServiceRule = z.infer<typeof serviceRuleSchema>;
export type PackageChoice = z.infer<typeof packageChoiceSchema>;
export type ConditionalSale = z.infer<typeof conditionalSaleSchema>;
export type RuleService = { id: number; category: string; price: number };

export function matchesServiceRule(rule: ServiceRule, service: RuleService) {
  return rule.kind === "SERVICES" ? rule.serviceIds.includes(service.id) : service.category === rule.category && (rule.minPrice === undefined || service.price >= rule.minPrice) && (rule.maxPrice === undefined || service.price <= rule.maxPrice);
}
export function readPackageChoices(value: unknown): PackageChoice[] {
  if (value == null) return [];
  return packageChoicesSchema.parse(value);
}
export function readConditionalSale(value: unknown): ConditionalSale | null {
  return value == null ? null : conditionalSaleSchema.parse(value);
}
export function ruleLabel(rule: ServiceRule) {
  if (rule.kind === "SERVICES") return `one of ${rule.serviceIds.length} selected services`;
  const range = rule.minPrice !== undefined && rule.maxPrice !== undefined ? ` (₱${rule.minPrice}–₱${rule.maxPrice})` : rule.maxPrice !== undefined ? ` (up to ₱${rule.maxPrice})` : rule.minPrice !== undefined ? ` (from ₱${rule.minPrice})` : "";
  return `one ${rule.category} service${range}`;
}
export function conditionalSaleSummary(sale: ConditionalSale, type: string, value: number) {
  const target = sale.target === "BOTH" ? "both services" : sale.target === "FIRST" ? "the first service" : "the second service";
  return `Book ${ruleLabel(sale.groups[0])} and ${ruleLabel(sale.groups[1])}. Get ${type === "PERCENTAGE" ? `${value}%` : `₱${value}`} off ${target}. Once per booking. Separate services only. Cannot combine with a voucher.`;
}
