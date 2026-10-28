# Service showcase performance

The `/redesign` service showcase uses a GSAP ticker per visible row. Pointer events update coordinates only; the ticker writes at most one drag transform per animation frame. IntersectionObserver and document visibility suspend inactive tickers. Transform promotion applies only while a row is visible. Reduced motion removes the animation and exposes a static grid.

Stationary white edge overlays replace a mask over the moving rows. Artwork has no runtime drop-shadow filter, and dotted backgrounds have no mask. This keeps the existing colors and edge fades with less raster work.

## Local verification — 2026-10-08

Checks: 14 focused Vitest tests covering the landing and motion controller; desktop pointer drag; mobile 390px layout; viewport suspension; Next.js runtime errors.

For profiling, use a running `npm run dev`, agent-browser at `/redesign`, viewport 1440 × 1000, and center `#service-showcase-rows` in the viewport. Start `agent-browser profiler start`; move the mouse to (1000, 370), press, move to (200, 370) with `--duration 1400 --steps 120`, release, wheel 240 then -240, and stop with `agent-browser profiler stop <output.json>`. Warm the page and images before capturing. Trace files are Chrome performance JSON.

Two local development traces with the same actions showed:

| Measurement | Before | After |
| --- | ---: | ---: |
| Trace frame window | 3.37 s | 4.10 s |
| Median DrawFrame gap | 17.32 ms | 16.72 ms |
| 95th-percentile DrawFrame gap | 31.30 ms | 18.81 ms |
| Gaps over 33.4 ms | 7 | 2 |
| RasterTask total duration | 130 ms | 2 ms |

These are a single local before/after comparison, with differing action-processing durations; they are not a controlled benchmark or an FPS guarantee on the user's hardware. Offscreen transform values stayed unchanged for 500 ms, and `will-change` was removed. Mobile had no horizontal document overflow and the swipe hint stayed above the cards beside the pause control.

Focused regression command:

```powershell
npx.cmd vitest run components/landing/hanaylo/MobiloLanding.test.tsx components/landing/hanaylo/useShowcaseMotion.test.ts
```
