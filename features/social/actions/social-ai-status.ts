"use server";

// Feature-owned Server Action boundary.

/**
 * Read-only check for whether the AI providers are configured server-side.
 * Surfaces in CreateOrganicPostDialog as a warning when Gemini isn't set
 * up — the dialog will silently fall back to category rescue templates,
 * but without this signal the owner has no idea their AI generation is
 * unavailable.
 *
 * Permission: any signed-in tenant user. The status itself isn't
 * tenant-scoped (it's a server-config flag), but we gate behind auth so
 * unauthenticated visitors can't probe the env.
 */

import { requireAuth } from "@/lib/auth/guards";
import { isGeminiConfigured } from "@/lib/services/social/gemini-client";
import { isOpenAIImageConfigured } from "@/lib/services/social/openai-image-client";

export type SocialAiStatus = {
  /** Gemini text generation (used for caption AI). */
  geminiConfigured: boolean;
  /** OpenAI image generation (primary image provider when configured). */
  openaiImageConfigured: boolean;
};

export type GetSocialAiStatusResult =
  | { success: true; status: SocialAiStatus }
  | { success: false; error: string };

export async function getSocialAiStatusAction(): Promise<GetSocialAiStatusResult> {
  const auth = await requireAuth();
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  return {
    success: true,
    status: {
      geminiConfigured: isGeminiConfigured(),
      openaiImageConfigured: isOpenAIImageConfigured(),
    },
  };
}
