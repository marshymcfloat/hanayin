"use server";

// Feature-owned Server Action boundary.

import { put, del } from "@vercel/blob";
import { revalidatePath } from "next/cache";

import { prisma } from "@/prisma/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { Role } from "@/prisma/generated/prisma/enums";
import {
  BrandAssetKind,
  ReferenceSubject,
} from "@/prisma/generated/prisma/enums";
import { logger } from "@/lib/logger";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
} from "@/lib/services/brand-assets/validation";

const VALID_KINDS = new Set<string>(Object.values(BrandAssetKind));
const VALID_REFERENCE_SUBJECTS = new Set<string>(
  Object.values(ReferenceSubject),
);

function extensionFromMimeType(mimeType: string) {
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

// Owner-only: brand-library mutations are part of business settings.
// Co-owners with restricted permissions still need SETTINGS_MANAGE on
// their own Owner row -- gated indirectly via requireAuth + Role check.
async function requireOwnerAccess() {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  if (auth.session.user.role !== Role.OWNER) {
    return { success: false as const, error: "Forbidden" };
  }
  return auth;
}

export async function listBrandAssetsAction(kind?: string) {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { id: true },
  });
  if (!business) return { success: false as const, error: "Business not found" };

  const where: { business_id: string; kind?: BrandAssetKind } = {
    business_id: business.id,
  };
  if (kind && VALID_KINDS.has(kind)) {
    where.kind = kind as BrandAssetKind;
  }

  const assets = await prisma.brandAsset.findMany({
    where,
    orderBy: [{ kind: "asc" }, { created_at: "desc" }],
    select: {
      id: true,
      kind: true,
      reference_subject: true,
      url: true,
      alt: true,
      service_id: true,
      employee_id: true,
      created_at: true,
    },
  });

  return { success: true as const, data: assets };
}

export async function uploadBrandAssetAction(formData: FormData) {
  const auth = await requireOwnerAccess();
  if (!auth.success) return auth;
  const { businessSlug, session } = auth;

  const file = formData.get("file");
  const kindRaw = String(formData.get("kind") || "");
  const altRaw = formData.get("alt");
  const serviceIdRaw = formData.get("serviceId");
  const employeeIdRaw = formData.get("employeeId");
  const referenceSubjectRaw = String(formData.get("referenceSubject") || "");

  if (!(file instanceof File)) {
    return { success: false as const, error: "No file uploaded" };
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return {
      success: false as const,
      error: "Unsupported file type. Allowed: JPG, PNG, WEBP, GIF.",
    };
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_SIZE_BYTES) {
    return { success: false as const, error: "File too large (max 8MB)." };
  }
  const extension = extensionFromMimeType(file.type);
  if (!extension) {
    return {
      success: false as const,
      error: "Could not infer file extension.",
    };
  }
  if (!VALID_KINDS.has(kindRaw)) {
    return { success: false as const, error: "Invalid asset kind." };
  }
  const kind = kindRaw as BrandAssetKind;

  // reference_subject only applies to REFERENCE assets — it tells the image
  // generator whether the reference is a person (identity preservation) or
  // brand/product/style direction. Validated when present; ignored for
  // other kinds so the column stays null there.
  let referenceSubject: ReferenceSubject | null = null;
  if (kind === BrandAssetKind.REFERENCE && referenceSubjectRaw) {
    if (!VALID_REFERENCE_SUBJECTS.has(referenceSubjectRaw)) {
      return { success: false as const, error: "Invalid reference type." };
    }
    referenceSubject = referenceSubjectRaw as ReferenceSubject;
  }

  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { id: true },
  });
  if (!business) {
    return { success: false as const, error: "Business not found" };
  }

  // SERVICE / EMPLOYEE kinds require the corresponding FK. App-level
  // because Postgres conditional NOT NULL constraints are awkward.
  let serviceId: number | null = null;
  let employeeId: number | null = null;
  if (kind === BrandAssetKind.SERVICE) {
    const parsed = serviceIdRaw ? Number(serviceIdRaw) : NaN;
    if (!Number.isInteger(parsed)) {
      return { success: false as const, error: "Service ID required for SERVICE kind." };
    }
    const service = await prisma.service.findFirst({
      where: { id: parsed, business_id: business.id },
      select: { id: true },
    });
    if (!service) {
      return { success: false as const, error: "Service not found." };
    }
    serviceId = parsed;
  }
  if (kind === BrandAssetKind.EMPLOYEE) {
    const parsed = employeeIdRaw ? Number(employeeIdRaw) : NaN;
    if (!Number.isInteger(parsed)) {
      return { success: false as const, error: "Employee ID required for EMPLOYEE kind." };
    }
    const employee = await prisma.employee.findFirst({
      where: { id: parsed, business_id: business.id },
      select: { id: true },
    });
    if (!employee) {
      return { success: false as const, error: "Employee not found." };
    }
    employeeId = parsed;
  }

  // Key is namespaced per-business so listing/cleanup is local. The
  // random suffix (Vercel Blob default) prevents collision.
  const uploadKey = `${businessSlug}/brand/${kind.toLowerCase()}/${Date.now()}.${extension}`;
  let blob;
  try {
    blob = await put(uploadKey, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
    });
  } catch (uploadError) {
    logger.error("[BrandAsset] Upload to blob failed", { uploadError });
    return { success: false as const, error: "Upload failed." };
  }

  try {
    const asset = await prisma.brandAsset.create({
      data: {
        business_id: business.id,
        kind,
        reference_subject: referenceSubject,
        url: blob.url,
        storage_key: blob.pathname,
        alt: typeof altRaw === "string" && altRaw.length > 0 ? altRaw : null,
        service_id: serviceId,
        employee_id: employeeId,
        uploaded_by_user_id: session.user.id,
      },
    });
    revalidatePath(`/app/${businessSlug}/business`);
    return { success: true as const, data: asset };
  } catch (dbError) {
    // Best-effort: drop the orphan blob so we don't leak storage
    // when the DB row fails.
    await del(blob.url).catch(() => {});
    logger.error("[BrandAsset] DB row create failed; rolled back blob", {
      dbError,
    });
    return { success: false as const, error: "Failed to save asset." };
  }
}

export async function deleteBrandAssetAction(assetId: string) {
  const auth = await requireOwnerAccess();
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  const asset = await prisma.brandAsset.findFirst({
    where: {
      id: assetId,
      business: { slug: businessSlug },
    },
    select: { id: true, url: true, storage_key: true },
  });
  if (!asset) {
    return { success: false as const, error: "Asset not found" };
  }

  try {
    await prisma.brandAsset.delete({ where: { id: asset.id } });
    // Soft-fail blob delete -- DB row is the source of truth; an
    // orphan blob is recoverable via a future sweep cron.
    await del(asset.url).catch((blobError) => {
      logger.warn("[BrandAsset] Blob delete failed (DB row already removed)", {
        blobError,
      });
    });
    revalidatePath(`/app/${businessSlug}/business`);
    return { success: true as const };
  } catch (error) {
    logger.error("[BrandAsset] Delete failed", { error });
    return { success: false as const, error: "Failed to delete asset." };
  }
}
