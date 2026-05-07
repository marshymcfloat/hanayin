import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { getFontBuffers } from "@/lib/services/social/font-loader";

// resvg-js 2.6 only accepts font *file paths*, not buffers, so we persist the
// fetched Google Font TTFs to a per-process temp directory once and hand the
// paths to Resvg. Cached for the lifetime of the process.

let cached: string[] | null = null;
let inflight: Promise<string[]> | null = null;

async function materialize(): Promise<string[]> {
  const buffers = await getFontBuffers();
  if (buffers.length === 0) return [];

  const dir = path.join(tmpdir(), "service-flow-overlay-fonts");
  await mkdir(dir, { recursive: true });

  const names = ["DMSans-Regular.ttf", "DMSans-Bold.ttf", "CormorantGaramond-SemiBold.ttf"];
  const paths: string[] = [];
  for (let i = 0; i < buffers.length; i += 1) {
    const file = path.join(dir, names[i] ?? `overlay-font-${i}.ttf`);
    await writeFile(file, buffers[i]);
    paths.push(file);
  }
  return paths;
}

export async function getOverlayFontFiles(): Promise<string[]> {
  if (cached) return cached;
  if (!inflight) {
    inflight = materialize().then((result) => {
      cached = result;
      inflight = null;
      return result;
    });
  }
  return inflight;
}
