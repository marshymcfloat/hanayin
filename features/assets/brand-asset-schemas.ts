import { z } from "zod";
import { BrandAssetKind, ReferenceSubject } from "@/prisma/generated/prisma/enums";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_SIZE_BYTES } from "@/lib/services/brand-assets/validation";
const referenceId = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().max(2147483647));
export const brandAssetIdSchema = z.string().trim().min(1).max(200);
export const brandAssetKindSchema = z.enum(BrandAssetKind).optional();
const uploadSchema = z.object({
  file: z.instanceof(File, { error: "No file uploaded" }).refine(file => ALLOWED_IMAGE_TYPES.has(file.type), "Unsupported file type. Allowed: JPG, PNG, WEBP, GIF.").refine(file => file.size > 0 && file.size <= MAX_UPLOAD_SIZE_BYTES, "File too large (max 8MB)."),
  kind: z.enum(BrandAssetKind, { error: "Invalid asset kind." }), alt: z.string().max(2000, "Alt text too long (max 2000 characters).").nullable(),
  serviceId: z.number().nullable(), employeeId: z.number().nullable(), referenceSubject: z.enum(ReferenceSubject).nullable(),
});
export type BrandAssetUpload = z.infer<typeof uploadSchema>;
export function parseBrandAssetUpload(input: unknown): { success: true; data: BrandAssetUpload } | { success: false; error: string } {
  if (!(input instanceof FormData)) return { success: false, error: "Invalid upload data." };
  const kind = input.get("kind");
  if (!z.enum(BrandAssetKind).safeParse(kind).success) return { success: false, error: "Invalid asset kind." };
  let serviceId: number | null = null; let employeeId: number | null = null;
  if (kind === BrandAssetKind.SERVICE || kind === BrandAssetKind.EMPLOYEE) {
    const id = referenceId.safeParse(input.get(kind === BrandAssetKind.SERVICE ? "serviceId" : "employeeId"));
    if (!id.success) return { success: false, error: kind === BrandAssetKind.SERVICE ? "Service ID required for SERVICE kind." : "Employee ID required for EMPLOYEE kind." };
    if (kind === BrandAssetKind.SERVICE) serviceId = id.data; else employeeId = id.data;
  }
  let referenceSubject: ReferenceSubject | null = null;
  const subject = input.get("referenceSubject");
  if (kind === BrandAssetKind.REFERENCE && subject !== null && subject !== "") {
    const parsed = z.enum(ReferenceSubject).safeParse(subject);
    if (!parsed.success) return { success: false, error: "Invalid reference type." };
    referenceSubject = parsed.data;
  }
  const rawAlt = input.get("alt");
  const result = uploadSchema.safeParse({ file: input.get("file"), kind, alt: rawAlt === null || rawAlt === "" ? null : rawAlt, serviceId, employeeId, referenceSubject });
  if (!result.success) return { success: false, error: result.error.issues[0].message };
  return { success: true, data: result.data };
}
export function brandAssetExtension(mime: string) {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[mime] ?? null;
}
