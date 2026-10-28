import { expect, it } from "vitest";
import { brandAssetExtension, brandAssetIdSchema, brandAssetKindSchema, parseBrandAssetUpload } from "./brand-asset-schemas";
function form(kind = "LOGO", mime = "image/png", size = 1) {
  const data = new FormData(); data.set("kind", kind); data.set("file", new File([new Uint8Array(size)], "photo", { type: mime })); return data;
}
it.each([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"], ["image/gif", "gif"]])("allows %s and infers %s", (mime, ext) => {
  expect(parseBrandAssetUpload(form("LOGO", mime)).success).toBe(true); expect(brandAssetExtension(mime)).toBe(ext);
});
it.each(["LOGO", "HERO", "REFERENCE"])("nulls irrelevant references for %s", kind => {
  const data = form(kind); data.set("serviceId", "invalid"); data.set("employeeId", "invalid");
  expect(parseBrandAssetUpload(data)).toEqual({ success: true, data: { file: expect.any(File), kind, alt: null, serviceId: null, employeeId: null, referenceSubject: null } });
});
it.each(["SERVICE", "EMPLOYEE"])("requires positive32 reference for %s", kind => {
  const key = kind === "SERVICE" ? "serviceId" : "employeeId";
  for (const value of ["", "0", "-1", "1.2", "Infinity", "2147483648", "abc"]) {
    const data = form(kind); data.set(key, value); expect(parseBrandAssetUpload(data).success).toBe(false);
  }
  const data = form(kind); data.set(key, "2147483647");
  expect(parseBrandAssetUpload(data)).toEqual({ success: true, data: expect.objectContaining({ [key]: 2147483647 }) });
});
it.each(["PERSON", "BRAND", "PRODUCT", "STYLE"])("preserves reference subject %s only for REFERENCE", subject => {
  const data = form("REFERENCE"); data.set("referenceSubject", subject);
  expect(parseBrandAssetUpload(data)).toEqual({ success: true, data: expect.objectContaining({ referenceSubject: subject }) });
  data.set("kind", "LOGO"); expect(parseBrandAssetUpload(data)).toEqual({ success: true, data: expect.objectContaining({ referenceSubject: null }) });
});
it("rejects invalid reference subject, kind, FormData and absent file safely", () => {
  expect(parseBrandAssetUpload(null).success).toBe(false);
  expect(parseBrandAssetUpload(form("WRONG")).success).toBe(false);
  const data = form("REFERENCE"); data.set("referenceSubject", "WRONG"); expect(parseBrandAssetUpload(data)).toEqual({ success: false, error: "Invalid reference type." });
  data.set("referenceSubject", ""); data.delete("file"); expect(parseBrandAssetUpload(data)).toEqual({ success: false, error: "No file uploaded" });
  data.set("file", "not a file"); expect(parseBrandAssetUpload(data)).toEqual({ success: false, error: "No file uploaded" });
});
it("preserves valid alt whitespace but bounds/rejects file alt", () => {
  const data = form(); data.set("alt", "  logo  "); expect(parseBrandAssetUpload(data)).toEqual({ success: true, data: expect.objectContaining({ alt: "  logo  " }) });
  data.set("alt", "x".repeat(2001)); expect(parseBrandAssetUpload(data).success).toBe(false);
  data.set("alt", new File(["x"], "alt")); expect(parseBrandAssetUpload(data).success).toBe(false);
});
it("accepts exactly 8MB and rejects empty/over-limit/nonimage", () => {
  expect(parseBrandAssetUpload(form("LOGO", "image/png", 8 * 1024 * 1024)).success).toBe(true);
  expect(parseBrandAssetUpload(form("LOGO", "image/png", 0)).success).toBe(false);
  expect(parseBrandAssetUpload(form("LOGO", "image/png", 8 * 1024 * 1024 + 1)).success).toBe(false);
  expect(parseBrandAssetUpload(form("LOGO", "text/plain")).success).toBe(false); expect(brandAssetExtension("text/plain")).toBe(null);
});
it("validates bounded IDs and optional list kind", () => {
  for (const value of [null, 1, "", " ", "x".repeat(201)]) expect(brandAssetIdSchema.safeParse(value).success).toBe(false);
  expect(brandAssetIdSchema.parse(" asset ")).toBe("asset");
  expect(brandAssetKindSchema.safeParse(undefined).success).toBe(true); expect(brandAssetKindSchema.safeParse("LOGO").success).toBe(true); expect(brandAssetKindSchema.safeParse(1).success).toBe(false);
});
