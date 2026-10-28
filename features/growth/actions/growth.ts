"use server";

import { revalidatePath } from "next/cache";
import { generateGrowthCampaignSchema, growthBusinessSlugSchema, trackGrowthCampaignEventSchema } from "@/features/growth/schemas";
import { growthActionFailure, requireGrowthActionAccess } from "@/features/growth/growth-action-access";
import { refreshGrowthSnapshot, refreshGrowthOpportunities, getTodayGrowthOpportunities, recordGrowthCampaignEvent } from "@/features/growth/services/growth-snapshot";
import { generateGrowthCampaign } from "@/features/growth/services/growth-campaign";
import type { GrowthOwnerActor } from "@/features/growth/growth-action-types";
import type { GeneratedCampaignView } from "@/lib/services/growth/types";

function refresh(paths: string[]) { for (const path of paths) { try { revalidatePath(path); } catch { /* Committed writes remain successful. */ } } }

export async function refreshGrowthContextAction(businessSlug: string) {
  const parsed = growthBusinessSlugSchema.safeParse(businessSlug);
  if (!parsed.success) return { success: false as const, error: "Invalid business." };
  try {
    const access = await requireGrowthActionAccess(parsed.data, true);
    if (!access.success) return access;
    const result = await refreshGrowthSnapshot(access.actor as GrowthOwnerActor);
    refresh([`/app/${parsed.data}`]);
    return result;
  } catch (error) { return growthActionFailure(error, "Failed to refresh growth context."); }
}
export async function refreshGrowthOpportunitiesAction(businessSlug: string) {
  const parsed = growthBusinessSlugSchema.safeParse(businessSlug);
  if (!parsed.success) return { success: false as const, error: "Invalid business." };
  try {
    const access = await requireGrowthActionAccess(parsed.data, true);
    if (!access.success) return access;
    const result = await refreshGrowthOpportunities(access.actor as GrowthOwnerActor);
    if (result.success) refresh([`/app/${parsed.data}`]);
    return result;
  } catch (error) { return growthActionFailure(error, "Failed to refresh opportunities."); }
}
export async function getTodayGrowthOpportunitiesAction(businessSlug: string) {
  const parsed = growthBusinessSlugSchema.safeParse(businessSlug);
  if (!parsed.success) return { success: false as const, error: "Invalid business." };
  try {
    const access = await requireGrowthActionAccess(parsed.data, false);
    if (!access.success) return access;
    return await getTodayGrowthOpportunities(access.actor);
  } catch (error) { return growthActionFailure(error, "Failed to load opportunities."); }
}
export async function generateGrowthCampaignAction(rawInput: unknown): Promise<{ success: boolean; data?: GeneratedCampaignView; error?: string }> {
  const parsed = generateGrowthCampaignSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: "Invalid campaign generation input." };
  try {
    const access = await requireGrowthActionAccess(parsed.data.businessSlug, true, true);
    if (!access.success) return access;
    const result = await generateGrowthCampaign(access.actor as GrowthOwnerActor, parsed.data);
    if (result.success) refresh([`/app/${parsed.data.businessSlug}`, `/app/${parsed.data.businessSlug}/sale-events`, `/app/${parsed.data.businessSlug}/social-posts`]);
    return result;
  } catch (error) { return growthActionFailure(error, "Failed to generate campaign."); }
}
export async function trackGrowthCampaignEventAction(rawInput: unknown) {
  const parsed = trackGrowthCampaignEventSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false as const, error: "Invalid campaign event payload." };
  try {
    const access = await requireGrowthActionAccess(parsed.data.businessSlug, true);
    if (!access.success) return access;
    const result = await recordGrowthCampaignEvent(access.actor as GrowthOwnerActor, parsed.data);
    if (result.success) refresh([`/app/${parsed.data.businessSlug}`]);
    return result;
  } catch (error) { return growthActionFailure(error, "Failed to track campaign event."); }
}
