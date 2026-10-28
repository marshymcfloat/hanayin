# FAQ animation performance

Scope: `/redesign` FAQ motion and the two surfaces displaced below it. Preserve
the design, native disclosure keyboard behavior, rapid reversals, reduced motion,
and the rest of the landing page's animations.

## Rendering changes

- Ignore unchanged answer-size notifications when a native disclosure opens.
  Retarget an active tween only when the measured answer height actually changes.
- Measure the destination before writing the animated height.
- Contain FAQ layout/paint and give its background a fixed gradient length.
- Composite the following CTA and footer independently so their artwork can be
  reused as expanding answers move them. No blanket layer promotion was added.

Height animation still requires layout. Replacing it with a transform would not
move the following questions through normal document flow. Completed animations
clear the inline height so answers can reflow normally.

## Local comparison, 2026-10-09

Chrome through agent-browser, Next.js development server, 1440 × 1000 viewport,
normal motion. Open `/redesign`, scroll `#questions` into view, wait 600 ms,
then toggle the second summary eight times, 550 ms apart. Capture each run with
`profiler start` / `profiler stop` and sum complete (`ph: X`) trace events.

| Trace work | Before | After |
| --- | ---: | ---: |
| Paint | 243.95 ms | 175.69 ms |
| Layout | 90.74 ms | 73.29 ms |
| UpdateLayoutTree | 82.19 ms | 64.06 ms |
| RasterTask, worker work | 72.91 ms | 85.23 ms |

Paint time fell approximately 28%; worker raster time increased. Both runs had
265 measured animation frames, a 16.9 ms p95 interval and no interval above
33.4 ms. This demonstrates lower main-thread rendering cost, not a reproduced
sustained FPS drop or a guarantee for every device. Trace totals include the
capture window and should only be compared with the same procedure.

Browser checks: Enter activation, rapid close/open reversal, native focus,
wheel scrolling, mobile reflow at 390 px with no horizontal overflow, and
immediate toggles with reduced motion. Focused regression coverage lives in
`components/landing/hanaylo/FaqAccordion.test.tsx`.

Verification:

- `npx.cmd vitest run components/landing/hanaylo/FaqAccordion.test.tsx components/landing/hanaylo/MobiloLanding.test.tsx`: 14 passed. The initial sandbox run was blocked by a temporary-file rename permission error; the unrestricted retry passed.
- `npm.cmd run lint -- --max-warnings=0`: passed.
- `npm.cmd run typecheck`: passed.
- Next.js `get_errors` and `get_compilation_issues`: empty.
- Changed-file whitespace check: passed. Repository-wide `git diff --check`
  reported pre-existing whitespace in generated Prisma files, left untouched.
- Production build and authenticated/database suites skipped: this change only
  affects public presentation and disclosure animation, with no route, data,
  dependency, or rendering-boundary changes.
