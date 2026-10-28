import { OwnerPermission } from "@/prisma/generated/prisma/enums";

const validPermissions = new Set<string>(Object.values(OwnerPermission));

export function sanitizeOwnerPermissions(input: unknown): OwnerPermission[] {
  if (!Array.isArray(input)) return [];
  const cleaned = new Set<OwnerPermission>();
  for (const raw of input) {
    if (typeof raw === "string" && validPermissions.has(raw)) cleaned.add(raw as OwnerPermission);
  }
  if (cleaned.has(OwnerPermission.REPORTS_VIEW_FULL)) cleaned.delete(OwnerPermission.REPORTS_VIEW_SALES_ONLY);
  return Array.from(cleaned);
}
