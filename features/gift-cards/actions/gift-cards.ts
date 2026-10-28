"use server";

import {
  claimGiftCardBooking,
  createGiftCard,
  deleteGiftCard,
  generateGiftCardCode,
  getGiftCards,
  previewGiftCardClaim,
  updateGiftCard,
  type GiftCardClaimPreviewData,
  type GiftCardWriteInput,
} from "@/features/gift-cards/services/gift-cards";
import {
  giftCardIdSchema,
  giftCardListSchema,
  giftCardWriteSchema,
} from "@/features/gift-cards/gift-card-schemas";

export type { GiftCardClaimPreviewData } from "@/features/gift-cards/services/gift-cards";

export async function previewGiftCardClaimAction(input: {
  businessSlug: string;
  code: string;
  email: string;
}): Promise<
  { success: true; data: GiftCardClaimPreviewData } | { success: false; error: string }
> {
  return previewGiftCardClaim(input);
}

export async function claimGiftCardBookingAction(input: {
  businessSlug: string;
  code: string;
  email: string;
  scheduledAt: Date | string;
  isWalkIn?: boolean;
}) {
  return claimGiftCardBooking(input);
}

export async function getGiftCardsAction(businessSlug: string) {
  const parsed = giftCardListSchema.safeParse(businessSlug);
  if (!parsed.success) return { success: false as const, error: "Invalid business slug" };
  return getGiftCards(parsed.data);
}

export async function generateGiftCardCodeAction() {
  return generateGiftCardCode();
}

export async function createGiftCardAction(input: GiftCardWriteInput) {
  const parsed = giftCardWriteSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Invalid gift card input" };
  return createGiftCard(parsed.data);
}

export async function updateGiftCardAction(
  giftCardId: number,
  input: GiftCardWriteInput,
) {
  const parsedId = giftCardIdSchema.safeParse(giftCardId);
  const parsed = giftCardWriteSchema.safeParse(input);
  if (!parsedId.success || !parsed.success) return { success: false as const, error: "Invalid gift card input" };
  return updateGiftCard(parsedId.data, parsed.data);
}

export async function deleteGiftCardAction(giftCardId: number) {
  const parsed = giftCardIdSchema.safeParse(giftCardId);
  if (!parsed.success) return { success: false as const, error: "Invalid gift card input" };
  return deleteGiftCard(parsed.data);
}
