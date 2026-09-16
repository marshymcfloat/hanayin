"use server";

// Feature-owned Server Action boundary.

import crypto from "crypto";
import { prisma } from "@/prisma/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { revalidatePath } from "next/cache";
import { normalizeVoucherCode } from "@/lib/utils/voucher-code";

// Crockford-style alphabet: excludes I/O/0/1 to avoid ambiguous codes
// when read off SMS or handwritten. Matches the gift-card generator.
const VOUCHER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const VOUCHER_CODE_LENGTH = 6;
const VOUCHER_CODE_MAX_ATTEMPTS = 10;

function generateVoucherSuffix() {
  let output = "";
  for (let i = 0; i < VOUCHER_CODE_LENGTH; i += 1) {
    output +=
      VOUCHER_CODE_ALPHABET[
        crypto.randomInt(VOUCHER_CODE_ALPHABET.length)
      ];
  }
  return output;
}

export type CreateVoucherInput = {
  code: string;
  type: "PERCENTAGE" | "FLAT";
  value: number;
  minimum_amount: number;
  expires_at: Date;
};

export async function getVouchersAction(businessSlug: string) {
  const auth = await requireAuth();
  if (!auth.success) return { success: false, error: "Unauthorized" };

  // Ensure user authorized for this business context
  if (auth.businessSlug !== businessSlug) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const vouchers = await prisma.voucher.findMany({
      where: {
        business: {
          slug: businessSlug,
        },
      },
      orderBy: {
        created_at: "desc",
      },
      include: {
        used_by: {
          select: {
            id: true,
            created_at: true,
          },
        },
      },
    });
    return { success: true, data: vouchers };
  } catch (error) {
    console.error("Error fetching vouchers:", error);
    return { success: false, error: "Failed to fetch vouchers" };
  }
}

export async function createVoucherAction(data: CreateVoucherInput) {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  try {
    const business = await prisma.business.findUnique({
      where: { slug: businessSlug },
    });

    if (!business) return { success: false, error: "Business not found" };

    const normalizedCode = normalizeVoucherCode(data.code);
    if (normalizedCode.length === 0) {
      return { success: false, error: "Voucher code can't be empty" };
    }

    const existing = await prisma.voucher.findUnique({
      where: { code: normalizedCode },
    });

    if (existing) {
      return { success: false, error: "Voucher code already exists" };
    }

    const voucher = await prisma.voucher.create({
      data: {
        code: normalizedCode,
        type: data.type,
        value: data.value,
        minimum_amount: data.minimum_amount,
        expires_at: data.expires_at,
        business_id: business.id,
        is_active: true,
      },
    });

    revalidatePath(`/app/${businessSlug}/vouchers`);
    return { success: true, data: voucher };
  } catch (error) {
    console.error("Error creating voucher:", error);
    return { success: false, error: "Failed to create voucher" };
  }
}

export async function deleteVoucherAction(id: number) {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  try {
    const voucher = await prisma.voucher.findUnique({
      where: { id },
      include: { business: true },
    });

    if (!voucher || voucher.business.slug !== businessSlug) {
      return { success: false, error: "Voucher not found or unauthorized" };
    }

    await prisma.voucher.delete({
      where: { id },
    });

    revalidatePath(`/app/${businessSlug}/vouchers`);
    return { success: true };
  } catch (error) {
    console.error("Error deleting voucher:", error);
    return { success: false, error: "Failed to delete voucher" };
  }
}

export async function generateVoucherCodeAction() {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  try {
    const business = await prisma.business.findUnique({
      where: { slug: businessSlug },
      select: { name: true, initials: true },
    });

    if (!business) return { success: false, error: "Business not found" };

    const prefix = (business.initials || "VO").toUpperCase();

    // Retry on collision instead of shipping a duplicate. Collision is
    // astronomically unlikely with 6 chars from a 32-letter alphabet
    // (32^6 ≈ 1B) but the previous single-retry fallback could return
    // an already-taken code if both random draws collided. 10 attempts
    // pushes the practical collision probability to effectively zero.
    for (let attempt = 0; attempt < VOUCHER_CODE_MAX_ATTEMPTS; attempt += 1) {
      const code = normalizeVoucherCode(`${prefix}-${generateVoucherSuffix()}`);
      const existing = await prisma.voucher.findUnique({
        where: { code },
        select: { id: true },
      });
      if (!existing) {
        return { success: true, code };
      }
    }

    return {
      success: false,
      error: "Couldn't generate a unique code. Try again.",
    };
  } catch (error) {
    console.error("Error generating code:", error);
    return { success: false, error: "Failed to generate code" };
  }
}

export type VerifyVoucherResult = {
  success: boolean;
  error?: string;
  data?: {
    id: number;
    code: string;
    type: "PERCENTAGE" | "FLAT";
    value: number;
    discountAmount: number;
    finalPrice: number;
    minAmount: number;
  };
};

export async function verifyVoucherAction(
  code: string,
  businessSlug: string,
  currentTotal: number,
): Promise<VerifyVoucherResult> {
  try {
    const normalizedCode = normalizeVoucherCode(code);
    if (normalizedCode.length === 0) {
      return { success: false, error: "Voucher code can't be empty" };
    }
    const voucher = await prisma.voucher.findUnique({
      where: { code: normalizedCode },
      include: {
        business: true,
        used_by: true,
      },
    });

    if (!voucher) {
      return { success: false, error: "Voucher code not found" };
    }

    if (voucher.business.slug !== businessSlug) {
      return { success: false, error: "Invalid voucher for this business" };
    }

    if (!voucher.is_active) {
      return { success: false, error: "Voucher is inactive" };
    }

    if (new Date() > voucher.expires_at) {
      return { success: false, error: "Voucher has expired" };
    }

    if (voucher.used_by) {
      return { success: false, error: "Voucher has already been used" };
    }

    if (currentTotal < voucher.minimum_amount) {
      return {
        success: false,
        error: `Minimum spend of ${voucher.minimum_amount} required`,
      };
    }

    let discountAmount = 0;
    if (voucher.type === "PERCENTAGE") {
      discountAmount = (currentTotal * voucher.value) / 100;
    } else {
      discountAmount = voucher.value;
    }

    // Ensure discount doesn't exceed total
    discountAmount = Math.min(discountAmount, currentTotal);
    const finalPrice = currentTotal - discountAmount;

    return {
      success: true,
      data: {
        id: voucher.id,
        code: voucher.code,
        type: voucher.type,
        value: voucher.value,
        discountAmount,
        finalPrice,
        minAmount: voucher.minimum_amount,
      },
    };
  } catch (error) {
    console.error("Error verifying voucher:", error);
    return { success: false, error: "Failed to verify voucher" };
  }
}
