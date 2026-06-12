import { access } from "node:fs/promises";
import path from "node:path";

import { logger } from "@/lib/logger";

// resvg-js 2.6 only accepts font *file paths*, not buffers. We ship the TTFs
// in-repo so overlay rendering never depends on a runtime Google Fonts fetch
// (which used to fail silently and leave the headline blank — only the
// decorative accent rule remained visible).

const FONT_DIR = path.join(process.cwd(), "lib", "services", "social", "fonts");

const FONT_FILES = [
  path.join(FONT_DIR, "DMSans-Regular.ttf"),
  path.join(FONT_DIR, "DMSans-Bold.ttf"),
  path.join(FONT_DIR, "CormorantGaramond-SemiBold.ttf"),
];

let cached: string[] | null = null;

export async function getOverlayFontFiles(): Promise<string[]> {
  if (cached) return cached;
  const present: string[] = [];
  for (const file of FONT_FILES) {
    try {
      await access(file);
      present.push(file);
    } catch {
      logger.warn("[Social] Overlay font file missing on disk.", { file });
    }
  }
  cached = present;
  return present;
}
