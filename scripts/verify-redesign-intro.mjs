import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const url = process.argv[2] || "http://localhost:3000/redesign";
const browser = await chromium.launch();
const targets = "[data-intro-nav], [data-hero-copy], [data-hero-dashboard], [data-hero-dryer], [data-hero-polish], [data-hero-serum], [data-hero-towel]";

async function check({ name, delay = 0, javaScriptEnabled = true, reducedMotion = "no-preference", width = 1440 }) {
  const context = await browser.newContext({ javaScriptEnabled, reducedMotion, viewport: { width, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  if (javaScriptEnabled) {
    await page.addInitScript(selector => {
      window.introSamples = [];
      const tick = () => {
        const root = document.querySelector("[data-intro-state]");
        if (root && getComputedStyle(root).getPropertyValue("--accent").trim()) {
          window.introSamples.push({
            state: root.dataset.introState,
            values: [...root.querySelectorAll(selector)].filter(node => getComputedStyle(node).display !== "none")
              .map(node => Number(getComputedStyle(node).opacity)),
          });
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, targets);
  }
  if (delay) {
    await page.route("**/*.js*", async route => {
      await new Promise(resolve => setTimeout(resolve, delay));
      await route.continue();
    });
  }
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    if (javaScriptEnabled) {
      await page.waitForFunction(() => document.querySelector("[data-intro-state]")?.dataset.introState === "complete");
      const samples = await page.evaluate(() => window.introSamples);
      assert(samples.length > 0, `${name}: no frame samples`);
      for (let i = 1; i < samples.length; i++) {
        samples[i].values.forEach((opacity, index) => {
          assert(opacity + 0.025 >= (samples[i - 1].values[index] ?? 0), `${name}: visible content disappeared at frame ${i}, target ${index}: ${JSON.stringify(samples.slice(Math.max(0, i - 2), i + 2))}`);
        });
      }
      if (delay) {
        assert(samples.some(sample => sample.state === "pending" && sample.values.every(value => value === 0)), `${name}: missing hidden pre-hydration state`);
      }
      if (delay > 3000) {
        assert(samples.some(sample => sample.state === "pending" && sample.values.every(value => value === 1)), `${name}: CSS fallback did not reveal content`);
        assert(!samples.some(sample => sample.state === "running"), `${name}: late hydration replayed the intro`);
      }
    }
    const final = await page.locator(targets).evaluateAll(nodes => nodes.filter(node => getComputedStyle(node).display !== "none").map(node => Number(getComputedStyle(node).opacity)));
    assert(final.every(value => value === 1), `${name}: content stayed hidden`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name}: horizontal overflow`);
    assert.deepEqual(errors, [], `${name}: browser errors`);
    console.log(`PASS ${name}`);
  } finally {
    await context.close();
  }
}

try {
  await check({ name: "cold desktop navigation", delay: 500 });
  await check({ name: "cold mobile navigation", delay: 500, width: 375 });
  await check({ name: "late hydration after CSS fallback", delay: 4200 });
  await check({ name: "reduced motion", reducedMotion: "reduce" });
  await check({ name: "JavaScript disabled", javaScriptEnabled: false });
} finally {
  await browser.close();
}
