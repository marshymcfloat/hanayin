/**
 * Reject obviously-invalid `[businessSlug]` route params before any
 * Prisma query runs. Catches:
 *   - JS undefined / null (defensive — Next.js usually gives a string)
 *   - The string "undefined" / "null" produced when client code
 *     interpolates a missing value into a `<Link href>`
 *   - Empty / whitespace-only strings
 *
 * Without this guard, downstream `prisma.business.findUnique({
 * where: { slug } })` calls produce a `PrismaClientValidationError`
 * (slug must not be undefined) and surface in Sentry as noise.
 */
export function isValidBusinessSlug(
  slug: string | null | undefined,
): slug is string {
  if (slug === null || slug === undefined) return false;
  const trimmed = slug.trim();
  if (trimmed.length === 0) return false;
  if (trimmed === "undefined" || trimmed === "null") return false;
  return true;
}
