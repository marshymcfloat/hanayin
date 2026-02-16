import { logger } from "@/lib/logger";
import { generateGeminiText, isGeminiConfigured } from "@/lib/services/social/gemini-client";

export async function generateGrowthJson<T>(input: {
  prompt: string;
  modelEnvVar?: string;
  fallbackModel: string;
}): Promise<T | null> {
  if (!isGeminiConfigured()) {
    return null;
  }

  const model = (input.modelEnvVar && process.env[input.modelEnvVar]) || input.fallbackModel;
  try {
    const text = await generateGeminiText({
      model,
      prompt: input.prompt,
      responseMimeType: "application/json",
      maxOutputTokens: 1200,
      temperature: 0.7,
    });
    const normalized = text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "");
    return JSON.parse(normalized) as T;
  } catch (error) {
    logger.warn("[Growth] LLM JSON generation failed, falling back", {
      errorMessage: error instanceof Error ? error.message : String(error),
      model,
    });
    return null;
  }
}

