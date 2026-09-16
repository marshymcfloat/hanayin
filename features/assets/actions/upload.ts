"use server";

// Feature-owned Server Action boundary.

import { put } from "@vercel/blob";
import { requireAuth } from "@/lib/auth/guards";

const MAX_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function safeExtensionFromMimeType(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return null;
  }
}

export async function uploadImageAction(formData: FormData) {
  const auth = await requireAuth({ write: true });
  if (!auth.success) {
    throw new Error(auth.error);
  }

  const file = formData.get("file") as File;
  if (!file || typeof file !== "object") {
    throw new Error("No file uploaded");
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Unsupported file type. Allowed: JPG, PNG, WEBP, GIF.");
  }

  if (file.size <= 0 || file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("File is too large. Max size is 8MB.");
  }

  const extension = safeExtensionFromMimeType(file.type);
  if (!extension) {
    throw new Error("Could not infer file extension from type.");
  }

  const uploadKey = `${auth.businessSlug}/social/${Date.now()}.${extension}`;
  const blob = await put(uploadKey, file, {
    access: "public",
    allowOverwrite: false,
    addRandomSuffix: true,
    contentType: file.type,
  });

  return blob.url;
}
