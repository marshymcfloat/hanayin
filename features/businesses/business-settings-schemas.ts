import { z } from "zod";
import { BusinessType } from "@/prisma/generated/prisma/enums";
import { getBusinessStructureTemplate, normalizeBusinessStructure } from "@/lib/business-structure";
import { normalizeGrowthToneProfile } from "@/lib/services/growth/tone-profiles";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_SIZE_BYTES } from "@/lib/services/brand-assets/validation";
const text = (max: number) => z.string().max(max);
const numericText = (value: string) => /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) && Number.isFinite(Number(value));
const url = z.string().trim().max(2048).refine(value => !value || /^https:\/\//i.test(value) && z.url().safeParse(value).success, "Invalid image URL.").transform(value => value || null);
const image = z.instanceof(File).refine(file => ALLOWED_IMAGE_TYPES.has(file.type), "Unsupported business image type.").refine(file => file.size <= MAX_UPLOAD_SIZE_BYTES, "Business image must be smaller than 8 MB.").nullable();
const qrImage = z.instanceof(File).refine(file => ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(file.type), "Upload a PNG, JPG, WebP, or HEIC image.").refine(file => file.size <= MAX_UPLOAD_SIZE_BYTES, "The QR image must be smaller than 8 MB.").nullable();
const coordinate = (min: number, max: number) => z.string().max(100).refine(value => !value || numericText(value) && Number(value) >= min && Number(value) <= max, "Invalid coordinates.").transform(value => value ? Number(value) : null);
const rawSchema = z.object({
  name: text(200).min(1).refine(value => value.trim().length > 0, "Business name is required."), initials: text(20).min(1), description: text(10000).nullable(),
  existingImageUrl: url, existingGcashQrImageUrl: url, imageFile: image, gcashQrImageFile: qrImage,
  latitude: coordinate(-90, 90), longitude: coordinate(-180, 180), timezone: text(100), structure: text(100),
  allowEmployeeSelfBooking: text(20).nullable(), managerCanServe: text(20).nullable(), formalScheduleEnabled: text(20).nullable(),
  gcashAccountName: text(200).transform(value => value.trim() || null), gcashMobileNumber: text(50).transform(value => value.replace(/\s+/g, "")).refine(value => !value || /^(?:\+63|0)9\d{9}$/.test(value), "Enter a valid Philippine GCash mobile number.").transform(value => value || null), gcashInstructions: text(10000).transform(value => value.trim() || null),
  growthBusinessType: z.enum(BusinessType), growthMaxDiscountPercent: text(100).refine(value => !value || numericText(value), "Invalid growth discount."),
  growthEnableStudentPromo: text(20).nullable(), growthAvoidCheapWording: text(20).nullable(), growthWeatherHooksEnabled: text(20).nullable(), growthToneProfile: text(100).nullable(),
}).transform(input => {
  const structure = normalizeBusinessStructure(input.structure);
  const template = getBusinessStructureTemplate(structure);
  let timezone = "Asia/Manila";
  if (input.timezone) { try { new Intl.DateTimeFormat("en-US", { timeZone: input.timezone }); timezone = input.timezone; } catch { /* Preserve the legacy fallback. */ } }
  return { ...input, initials: input.initials.toUpperCase(), structure, timezone,
    allowEmployeeSelfBooking: input.allowEmployeeSelfBooking !== null ? input.allowEmployeeSelfBooking.toLowerCase() === "true" : template.allowEmployeeSelfBooking,
    managerCanServe: input.managerCanServe !== null ? input.managerCanServe.toLowerCase() === "true" : template.managerCanServe,
    formalScheduleEnabled: input.formalScheduleEnabled?.toLowerCase() === "true",
    growthMaxDiscountPercent: Math.min(80, Math.max(1, Number.parseFloat(input.growthMaxDiscountPercent || "20") || 20)),
    growthEnableStudentPromo: input.growthEnableStudentPromo === "on", growthAvoidCheapWording: input.growthAvoidCheapWording === "on", growthWeatherHooksEnabled: input.growthWeatherHooksEnabled === "on", growthToneProfile: normalizeGrowthToneProfile(input.growthToneProfile),
  };
});
export type BusinessSettingsInput = z.infer<typeof rawSchema>;
export function parseBusinessSettings(input: unknown): { success: true; data: BusinessSettingsInput } | { success: false; error: string } {
  if (!(input instanceof FormData)) return { success: false, error: "Invalid business settings." };
  const file = (key: string) => { const value = input.get(key); return value instanceof File && value.size === 0 || value === null || value === "" ? null : value; };
  const nullable = ["description", "allowEmployeeSelfBooking", "managerCanServe", "formalScheduleEnabled", "growthEnableStudentPromo", "growthAvoidCheapWording", "growthWeatherHooksEnabled", "growthToneProfile"];
  const optional = ["existingImageUrl", "existingGcashQrImageUrl", "latitude", "longitude", "timezone", "structure", "gcashAccountName", "gcashMobileNumber", "gcashInstructions", "growthMaxDiscountPercent"];
  const values: Record<string, unknown> = { name: input.get("name"), initials: input.get("initials"), growthBusinessType: input.get("growthBusinessType") || "SALON", imageFile: file("imageFile"), gcashQrImageFile: file("gcashQrImageFile") };
  for (const key of nullable) values[key] = input.get(key);
  for (const key of optional) values[key] = input.get(key) ?? "";
  const parsed = rawSchema.safeParse(values);
  return parsed.success ? { success: true, data: parsed.data } : { success: false, error: parsed.error.issues[0]?.message ?? "Invalid business settings." };
}
