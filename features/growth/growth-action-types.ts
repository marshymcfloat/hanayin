import type { z } from "zod";
import type { generateGrowthCampaignSchema, trackGrowthCampaignEventSchema } from "@/features/growth/schemas";
import type { TenantActorContext } from "@/lib/auth/staff-access";
import type { Opportunity } from "@/prisma/generated/prisma/client";
import type { GeneratedOffer, CaptionVariant, ImagePromptVariant, PostingScheduleSuggestion } from "@/lib/services/growth/types";
import type { CampaignCreativeContext } from "@/lib/services/growth/creative-context";

export type GrowthActor = Extract<TenantActorContext, { success: true }>;
export type GrowthOwnerActor = Extract<GrowthActor, { actorType: "OWNER" }>;
export type GrowthCampaignInput = z.infer<typeof generateGrowthCampaignSchema>;
export type GrowthEventInput = z.infer<typeof trackGrowthCampaignEventSchema>;
export type GrowthReferenceSource = { candidateId: string; candidateUpdatedAt: Date; assetId: string; assetUpdatedAt: Date; assetUrl: string; storageKey: string };
export type GrowthCampaignPersistence = {
  actor: GrowthOwnerActor;
  opportunity: Pick<Opportunity, "id" | "business_id" | "snapshot_id" | "type" | "status" | "updated_at" | "reason" | "total_score" | "confidence_score">;
  offer: GeneratedOffer; captions: CaptionVariant[]; imagePrompts: ImagePromptVariant[]; schedule: PostingScheduleSuggestion[]; creativeContext: CampaignCreativeContext;
  serviceIds: number[]; packageIds: number[]; connectionIds: string[]; hashtags: string[]; mediaUrl: string | null;
  finalStartDate: Date; finalEndDate: Date; finalDiscountPercent: number; finalSlotLimit: number | null; reference: GrowthReferenceSource | null;
};
