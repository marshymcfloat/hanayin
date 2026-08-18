import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { extractQrCodePng, QrImageError } from "./qr-image";

function upload(bytes: Uint8Array, name: string, type: string) {
  const copy = Uint8Array.from(bytes);
  return {
    name,
    type,
    size: copy.byteLength,
    arrayBuffer: async () => copy.buffer,
  } as File;
}

describe("GCash QR upload security", () => {
  it("rejects a disallowed declared MIME type before decoding", async () => {
    const file = upload(new TextEncoder().encode("not-an-image"), "qr.svg", "image/svg+xml");
    await expect(extractQrCodePng(file)).rejects.toThrow(
      "Upload a PNG, JPG, WebP, or HEIC image.",
    );
  });

  it("rejects malformed bytes even when the MIME type claims PNG", async () => {
    const file = upload(new TextEncoder().encode("malicious payload"), "qr.png", "image/png");
    await expect(extractQrCodePng(file)).rejects.toThrow(
      "The file contents are not a valid supported image.",
    );
  });

  it("rejects content whose actual format does not match its MIME type", async () => {
    const jpeg = await sharp({ create: { width: 300, height: 300, channels: 3, background: "white" } }).jpeg().toBuffer();
    const file = upload(jpeg, "spoofed.png", "image/png");
    await expect(extractQrCodePng(file)).rejects.toThrow(
      "does not match its actual image contents",
    );
  });

  it("rejects a valid image that contains no readable QR", async () => {
    const png = await sharp({ create: { width: 300, height: 300, channels: 3, background: "white" } }).png().toBuffer();
    const file = upload(png, "blank.png", "image/png");
    await expect(extractQrCodePng(file)).rejects.toBeInstanceOf(QrImageError);
    await expect(extractQrCodePng(file)).rejects.toThrow("No readable QR code was found");
  });
});
