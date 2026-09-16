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
  return getGiftCards(businessSlug);
}

export async function generateGiftCardCodeAction() {
  return generateGiftCardCode();
}

export async function createGiftCardAction(input: GiftCardWriteInput) {
  return createGiftCard(input);
}

export async function updateGiftCardAction(
  giftCardId: number,
  input: GiftCardWriteInput,
) {
  return updateGiftCard(giftCardId, input);
}

export async function deleteGiftCardAction(giftCardId: number) {
  return deleteGiftCard(giftCardId);
}
