import sharp from "sharp";
import jsQR from "jsqr";

const MAX_QR_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_QR_INPUT_PIXELS = 25_000_000;
const MIN_IMAGE_EDGE = 120;
const MAX_IMAGE_EDGE = 8_000;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export class QrImageError extends Error {}

export async function extractQrCodePng(file: File): Promise<Buffer> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new QrImageError("Upload a PNG, JPG, WebP, or HEIC image.");
  }
  if (file.size <= 0 || file.size > MAX_QR_UPLOAD_BYTES) {
    throw new QrImageError("The QR image must be smaller than 8 MB.");
  }

  const source = Buffer.from(await file.arrayBuffer());
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(source, {
      failOn: "error",
      limitInputPixels: MAX_QR_INPUT_PIXELS,
    }).metadata();
  } catch {
    throw new QrImageError(
      "The file contents are not a valid supported image.",
    );
  }

  const actualFormat = metadata.format;
  const allowedFormats = new Set(["jpeg", "png", "webp", "heif"]);
  if (!actualFormat || !allowedFormats.has(actualFormat)) {
    throw new QrImageError("The detected file type is not supported.");
  }

  const expectedFormatsByMime: Record<string, ReadonlySet<string>> = {
    "image/jpeg": new Set(["jpeg"]),
    "image/png": new Set(["png"]),
    "image/webp": new Set(["webp"]),
    "image/heic": new Set(["heif"]),
    "image/heif": new Set(["heif"]),
  };
  if (!expectedFormatsByMime[file.type]?.has(actualFormat)) {
    throw new QrImageError(
      "The file extension or MIME type does not match its actual image contents.",
    );
  }

  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;
  if (
    sourceWidth < MIN_IMAGE_EDGE ||
    sourceHeight < MIN_IMAGE_EDGE ||
    sourceWidth > MAX_IMAGE_EDGE ||
    sourceHeight > MAX_IMAGE_EDGE ||
    sourceWidth * sourceHeight > MAX_QR_INPUT_PIXELS
  ) {
    throw new QrImageError(
      "Image dimensions must be between 120 and 8,000 pixels per side and no more than 25 megapixels.",
    );
  }

  let pixels: Buffer;
  let width: number;
  let height: number;

  try {
    const decoded = await sharp(source, {
      failOn: "error",
      limitInputPixels: MAX_QR_INPUT_PIXELS,
    })
      .rotate()
      .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    pixels = decoded.data;
    width = decoded.info.width;
    height = decoded.info.height;
  } catch {
    throw new QrImageError("The selected image could not be processed.");
  }

  const detected = jsQR(
    new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength),
    width,
    height,
    { inversionAttempts: "attemptBoth" },
  );
  if (!detected) {
    throw new QrImageError(
      "No readable QR code was found. Use a clear, well-lit image with the full QR visible.",
    );
  }

  const corners = [
    detected.location.topLeftCorner,
    detected.location.topRightCorner,
    detected.location.bottomLeftCorner,
    detected.location.bottomRightCorner,
  ];
  const minX = Math.max(0, Math.floor(Math.min(...corners.map((point) => point.x))));
  const minY = Math.max(0, Math.floor(Math.min(...corners.map((point) => point.y))));
  const maxX = Math.min(width, Math.ceil(Math.max(...corners.map((point) => point.x))));
  const maxY = Math.min(height, Math.ceil(Math.max(...corners.map((point) => point.y))));
  const cropWidth = maxX - minX;
  const cropHeight = maxY - minY;
  if (cropWidth < 80 || cropHeight < 80) {
    throw new QrImageError("The detected QR code is too small. Upload a higher-resolution image.");
  }

  const quietZone = Math.max(16, Math.round(Math.max(cropWidth, cropHeight) * 0.1));
  return sharp(pixels, { raw: { width, height, channels: 4 } })
    .extract({ left: minX, top: minY, width: cropWidth, height: cropHeight })
    .extend({ top: quietZone, bottom: quietZone, left: quietZone, right: quietZone, background: "white" })
    .resize({ width: 720, height: 720, fit: "contain", background: "white", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
