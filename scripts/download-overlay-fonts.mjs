// One-off: download the three TTFs used by the social-image overlay and
// write them into lib/services/social/fonts/. Run with: node scripts/download-overlay-fonts.mjs
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const TTF_UA = "Mozilla/4.0 (compatible; MSIE 6.0)";
const OUT_DIR = path.join(process.cwd(), "lib", "services", "social", "fonts");

async function fetchCss(family) {
  const url = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
  const res = await fetch(url, { headers: { "User-Agent": TTF_UA } });
  if (!res.ok) throw new Error(`CSS fetch ${family} -> ${res.status}`);
  return res.text();
}

function parseSrcUrls(css) {
  const urls = [];
  const re = /src:\s*[^;]*url\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(css)) !== null) urls.push(m[1].replace(/['"]/g, "").trim());
  return urls;
}

async function fetchBuf(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TTF fetch -> ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const dmCss = await fetchCss("DM+Sans:wght@500;700");
  const corCss = await fetchCss("Cormorant+Garamond:wght@600");

  const dmUrls = parseSrcUrls(dmCss);
  const corUrls = parseSrcUrls(corCss);
  if (dmUrls.length < 1 || corUrls.length < 1) {
    throw new Error("Missing TTF URLs in CSS responses");
  }

  const [dm500, dm700, cor600] = await Promise.all([
    fetchBuf(dmUrls[0]),
    fetchBuf(dmUrls[1] ?? dmUrls[0]),
    fetchBuf(corUrls[0]),
  ]);

  await writeFile(path.join(OUT_DIR, "DMSans-Regular.ttf"), dm500);
  await writeFile(path.join(OUT_DIR, "DMSans-Bold.ttf"), dm700);
  await writeFile(path.join(OUT_DIR, "CormorantGaramond-SemiBold.ttf"), cor600);

  console.log("Wrote fonts to", OUT_DIR);
  console.log(`  DMSans-Regular.ttf            ${dm500.length} bytes`);
  console.log(`  DMSans-Bold.ttf               ${dm700.length} bytes`);
  console.log(`  CormorantGaramond-SemiBold.ttf ${cor600.length} bytes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
