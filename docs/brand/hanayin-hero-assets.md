# HANAYIN hero assets

## Scope and direction

Refine only the decorative hero composition and add a scoped GSAP intro on `/redesign`. Preserve the approved lavender/blush palette, copy, calls to action, Lenis and header behavior. The dashboard and other section media remain blank for a later task.

Use recognizable service-business objects: a salon hair dryer, a nail-polish bottle, a rolled spa towel, and a frosted serum bottle. Match satin lavender, blush glass and ivory fabric with restrained plum details. Transparent silhouettes and CSS shadows let the existing gradient remain visible behind each object.

## Generation and files

Generated with the built-in image-generation tool using `transparent_background: true`; no CLI/API fallback. Each file is 1254 × 1254 PNG, with alpha verified (range 0–255). Originals remain in the Codex generated-images directory; versioned copies are used by Next Image.

- `public/hanaylo/hero-hair-dryer-v1.png`: smaller, above-left of the desktop headline.
- `public/hanaylo/hero-nail-polish-v1.png`: lower-right of the desktop headline.
- `public/hanaylo/hero-spa-towel-v1.png`: overlaps the dashboard's upper-right edge.
- `public/hanaylo/hero-serum-v1.png`: overlaps the dashboard's upper-left edge, balancing the towel.

Side objects disappear at 1360px and below to protect headline clearance. The towel scales from 170px to 130px at 800px and 100px at 520px. The serum scales from 155px to 125px and 90px at those breakpoints. All four images are decorative, have empty alternative text, and ignore pointer events.

`HeroIntro.tsx` wraps server-rendered page children in a scoped client container; only navbar and hero targets animate. One `useGSAP` timeline reveals the wordmark, navigation links and header actions first, then the badge, heading, supporting copy and hero actions. The four objects and dashboard follow with small translations and scale changes. The sequence ends after about 1.3 seconds, with inline animation styles cleared. No continuous floating, extra rotation or scroll effects are added.

Reduced motion leaves everything immediately visible. Live preference changes revert active animation without replaying it. Keyboard focus completes the intro immediately. Unmount and React strict-mode replay clean up timelines and listeners; restored pages already scrolled beyond 80px skip the intro. Content remains visible without JavaScript.

The server emits `data-intro-state="pending"`. Under scripting-enabled/no-preference CSS, entrance targets start transparent before hydration. GSAP explicitly initializes every target, changes the state to `running`, and uses forward `.to()` tweens; delayed `.fromTo()` start-state cleanup previously exposed some targets before their turn. The header surface also starts transparent, independently of its scroll behavior.

A three-second CSS fallback reveals content if hydration is late or fails. Already-finished fallback animations suppress the intro, including React effect replay. Pending keyboard focus reveals the content too. No-JavaScript and reduced-motion rendering never use the hidden starting state. Browsers without the CSS scripting media feature skip the entrance instead of hiding already-visible content.

Reproduce first-paint checks against a running server with `node scripts/verify-redesign-intro.mjs http://localhost:3000/redesign`. Fresh browser contexts delay JavaScript, sample target opacity frame by frame, and assert it never decreases. Scenarios cover desktop/mobile cold loads, hydration delayed beyond the fallback, reduced motion and disabled JavaScript.

## Exact prompts

### dryer

Use case: stylized-concept. Asset type: transparent cutout decorative object for HANAYIN service-business SaaS hero. Style: polished premium 3D editorial product render, softly rounded believable geometry, restrained satin materials, studio softbox from upper left, detailed but legible at 200px. Palette: lavender #bfa4e0, blush #efd0df, warm ivory, deep plum #30203f; no green. Real transparent alpha background, no backdrop, no floor, no checkerboard, no baked-in large shadow, no words or logo, no border, no people, no extra props. Single object fully in frame with 10 percent transparent margin, square canvas, crisp clean silhouette. Subject: one elegant salon hair dryer, lavender satin body, pale ivory handle, dark plum nozzle and rear vent, tiny chrome accents. Classic recognizable salon dryer shape, no cord. Three-quarter view, nozzle pointing upper right, handle pointing lower right, gently angled as if floating. Show the sculpted body and front nozzle opening. Product feels refined and tactile, not a toy.

### polish

Use case: stylized-concept. Asset type: transparent cutout decorative object for HANAYIN service-business SaaS hero. Style: polished premium 3D editorial product render, softly rounded believable geometry, restrained satin materials, studio softbox from upper left, detailed but legible at 200px. Palette: lavender #bfa4e0, blush #efd0df, warm ivory, deep plum #30203f; no green. Real transparent alpha background, no backdrop, no floor, no checkerboard, no baked-in large shadow, no words or logo, no border, no people, no extra props. Single object fully in frame with 10 percent transparent margin, square canvas, crisp clean silhouette. Subject: one closed nail polish bottle, thick clear rounded-square glass base containing blush pink opaque polish, tall satin lavender cylindrical screw cap. Elegant compact proportions with the cap about half total height. Three-quarter view, bottle leaning 12 degrees left, subtle glass edge reflections and visible blush liquid; cap closed, no brush, no spills. Refined luxury nail-studio object, not perfume.

### towel

Use case: stylized-concept. Asset type: transparent cutout decorative object for HANAYIN service-business SaaS hero. Style: polished premium 3D editorial product render, softly rounded believable geometry, restrained satin materials, studio softbox from upper left, detailed but legible at 200px. Palette: lavender #bfa4e0, blush #efd0df, warm ivory, deep plum #30203f; no green. Real transparent alpha background, no backdrop, no floor, no checkerboard, no baked-in large shadow, no words or logo, no border, no people, no extra props. Single object fully in frame with 10 percent transparent margin, square canvas, crisp clean silhouette. Subject: one neatly rolled plush ivory spa hand towel with a subtle lavender woven band. Single short cylindrical towel roll, visible spiral on left-facing end, three-quarter view from slightly above. Delicate realistic terry texture, soft rounded form. Horizontal silhouette angled very slightly upward to the right. No tray, no flowers, no stones, no bottle.

### serum

Use case: stylized-concept. Asset type: transparent cutout decorative object for HANAYIN beauty and wellness service SaaS hero. Style: polished premium 3D editorial product render, believable softly rounded geometry, restrained satin materials, studio softbox from upper left, detailed but legible at 150px. Matching existing lavender satin hair dryer, blush nail polish and ivory spa towel. Subject: ONE small luxury facial serum bottle, short rounded pear-shaped frosted glass body with subtle pale lavender translucent serum, low silver collar and a clearly recognizable warm ivory rubber dropper bulb. The dropper is CLOSED in the bottle. Compact body wider than a nail-polish bottle, tactile frosted glass, gentle light transmission, understated highlights, premium skincare aesthetic. Three-quarter view, bottle tilting 15 degrees right, fully visible and centered. No label, no text, no logo, no extra bottle or props, no spilling, no floating droplets. Square canvas with 12 percent transparent margin. Real transparent alpha background, no backdrop, no checkerboard, no floor, no large baked-in shadow, no border, no hands or people. Palette pale lavender #bfa4e0, ivory, and muted silver. Clean crisp silhouette.

## First-viewport flash regression verification

- The original opacity sampler failed on real cold loads: delayed GSAP start-state cleanup briefly exposed later targets. It also caught a second reveal after the CSS fallback during React development replay. Explicit starting states, forward tweens and a persistent skip decision resolved both failures.
- `node scripts/verify-redesign-intro.mjs`: all five scenarios passed on the final implementation (desktop/mobile cold loads, late hydration, reduced motion, JavaScript disabled). No sampled entrance target became less visible after appearing.
- `npx vitest run components/landing/hanaylo/HeroIntro.test.tsx components/landing/hanaylo/MobiloLanding.test.tsx components/landing/hanaylo/HanayloInteractions.test.tsx`: 19 passed, including server-emitted state, focus completion, delayed hydration, motion preferences and cleanup.
- Strict full lint passed; final focused lint and `npm run typecheck` also passed.
- Browser checks confirmed the mobile menu closes with Escape and restores focus, no horizontal overflow at 375px, and the header surface reaches opacity 1 after scrolling.
- Browser errors and Next.js compilation/runtime checks were empty; React inspection confirmed server page content passed into the scoped `HeroIntro` wrapper with `HanayloHeader` inside it. Scoped whitespace checks passed.
- Full `npm run build:app` passed with `/redesign` static. Next.js retried several timed-out page-generation workers before completing successfully.
- A targeted `--debug-build-paths=app/redesign/page.tsx` build exited successfully but omitted the requested route on this Windows setup; it is not counted as route verification. A final full build is used instead.
- The final full `npm run build:app` passed after all code changes, generated all 106 pages, and explicitly listed `/redesign` as static.
- Database/authenticated E2E are outside this presentation-only scope.

## Historical composition and intro verification

- `npx vitest run components/landing/hanaylo/MobiloLanding.test.tsx components/landing/hanaylo/HeroIntro.test.tsx`: 8 passed. Real GSAP tests cover focus interruption, reduced motion, live preference changes, strict-mode replay and unmount cleanup.
- `npm run lint -- --max-warnings=0`: passed after correcting the test fixture to use Next Link.
- `npm run typecheck`: passed.
- `npm run build:app`: passed; `/redesign` remains statically prerendered.
- Desktop composition inspected at 1440/1920px and mobile at 375px. At 320px all four image resources loaded and the document width stayed 320px; the dryer and polish are hidden at this size.
- Browser sampling observed intermediate opacity during the normal intro and restored styles at completion. Reduced-motion sampling found no motion. Navigation away and history return worked.
- Final post-build browser and Next.js compilation/runtime checks reported no errors. Scoped whitespace checks passed.
- Initial sandboxed Vitest attempts failed before running tests because temporary-file renames were blocked; approved retries outside the sandbox passed.
- Database/authenticated E2E remain outside this public presentation-only scope.

## Historical verification: original three-asset layout

- `npx vitest run components/landing/hanaylo/MobiloLanding.test.tsx`: all 4 tests passed.
- `npm run lint -- --max-warnings=0`: passed.
- `npm run typecheck`: passed on rerun. The first attempt found a malformed generated `.next/dev/types/validator.ts`; touching the existing route's timestamp let the running Next.js watcher regenerate it. No generated file was hand-edited and the route source was unchanged.
- Browser inspected at 1440 and 1920px desktop and 375px mobile; 320 and 1280px checks confirmed no horizontal overflow. At 1280px the side objects are hidden; the towel remains visible. All image resources loaded.
- Browser console/error inspection and Next.js compilation/runtime tools reported no errors.
- A temporary server attempt on 3001 detected the existing server on 3000 and exited. Verification reused that server; the task-owned browser was closed afterward.
- Production build and database/authenticated E2E were not repeated for this isolated decorative-asset/presentation change. The earlier route build is historical evidence only.
