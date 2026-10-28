# HANAYIN foundation section

## Task contract

Scope: the three Our foundation cards on `/redesign`, their heading/copy, illustrations, scoped styles and focused tests. Preserve the approved palette, three-column/stacked layout, hero/nav animation, public links and remaining placeholder sections. No route, data, authentication, dependency or configuration changes.

The section explains the three connected product jobs rather than generic company values:

- Every booking, in order: appointments, walk-ins, customer details and service status.
- Your team, connected: specialties, assignments and attendance.
- Clear staff earnings: attendance-based daily pay, eligible commissions and payslip review.

The section heading is "Your bookings. Your team. Their earnings." Product boundaries follow `hanaylo-identity.md`, `features/payroll/services/payslip-policy.ts` and `features/payroll/services/payslip.ts`. Eligible service commissions require completed service records on fully paid bookings. Payslip preparation is not a claim of bank disbursement or statutory payroll handling.

## Assets and layout

Generated using the built-in image-generation tool with `transparent_background: true`, not a CLI/API fallback. Each is a 1254 × 1254 PNG with verified alpha range 0–255. Originals remain in the Codex generated-images folder; project copies are:

- `public/hanaylo/foundation-bookings-v1.png`: appointment planner with clock.
- `public/hanaylo/foundation-team-v1.png`: three staff badges on a connected base.
- `public/hanaylo/foundation-earnings-v1.png`: payslip clipboard and calculator.

All use satin lavender, blush, ivory, silver and plum with the same soft upper-left lighting. They are conceptual 3D illustrations, not screenshots or actual customer/staff data. Empty alt text avoids repeating adjacent card copy. Next Image provides responsive sizing and lazy loading. Matching transparent image areas and flex card layout keep the artwork aligned. Blank paperclip decorations are removed.

The open-artwork refinement removes the inner white panels, their borders and rounded containers. The illustration areas use a slightly taller 1.18 aspect ratio with no image padding, making the existing assets larger against the pastel dotted cards. Soft silhouette shadows give depth without a rectangular backing. The small heading icons also lose their white tiles and become restrained 30px line icons. Copy, generated source images, outer card gradients and layout remain unchanged.

## Exact generation prompts

### bookings

Create one premium 3D editorial illustration for HANAYIN SaaS 'Our foundation' card. Part of a cohesive set: tactile satin lavender #bfa4e0, blush pink #efd0df, warm ivory, muted silver and small deep plum #30203f accents. Match refined beauty/wellness product renders, believable materials, softly rounded edges, subtle studio reflections, softbox upper left, camera three-quarter view from slightly above. Square image with generous 15 percent transparent margin. Main object group centered, occupies about 70 percent canvas, fully in frame, readable when displayed 250px wide. Transparent alpha background, no floor or backdrop, no baked-in large shadow, no white rectangle. No words, letters, numerals, logos or watermarks. No green, neon, gold or dark background. Not a screenshot, not a user interface. Elegant restrained sculptural still life, not plastic cartoon clipart. Subject: an elegant small freestanding desk appointment planner. Thick warm ivory rectangular panel with rounded corners, two muted silver binding rings at top, lavender backing and folded support. On the face a simple orderly three-by-three arrangement of raised lavender and blush appointment tiles; one selected plum tile with a tiny ivory checkmark. One small blush circular clock leaning beside its lower-right corner, simple two plum hands with no numerals. Planner slightly angled left, strong readable silhouette. Show organized appointments rather than a financial chart.

### team

Create one premium 3D editorial illustration for HANAYIN SaaS 'Our foundation' card. Part of a cohesive set: tactile satin lavender #bfa4e0, blush pink #efd0df, warm ivory, muted silver and small deep plum #30203f accents. Match refined beauty/wellness product renders, believable materials, softly rounded edges, subtle studio reflections, softbox upper left, camera three-quarter view from slightly above. Square image with generous 15 percent transparent margin. Main object group centered, occupies about 70 percent canvas, fully in frame, readable when displayed 250px wide. Transparent alpha background, no floor or backdrop, no baked-in large shadow, no white rectangle. No words, letters, numerals, logos or watermarks. No green, neon, gold or dark background. Not a screenshot, not a user interface. Elegant restrained sculptural still life, not plastic cartoon clipart. Subject: three physical staff ID badge cards standing upright in a compact gently fanned group. Central badge slightly taller and forward, lavender border, ivory face, one sculpted simple head-and-shoulders silhouette in deep lavender; side badges ivory and blush with corresponding simple person silhouettes. Subtle silver top clips, no lanyards and no text or pseudo-text. All three rest on a single low softly rounded lavender platform with subtle inset connecting lines that convey one coordinated team. Three equal colleagues, no hierarchy or growth bars. Balanced connected composition, open air around objects.

### earnings

Create one premium 3D editorial illustration for HANAYIN SaaS 'Our foundation' card. Part of a cohesive set: tactile satin lavender #bfa4e0, blush pink #efd0df, warm ivory, muted silver and small deep plum #30203f accents. Match refined beauty/wellness product renders, believable materials, softly rounded edges, subtle studio reflections, softbox upper left, camera three-quarter view from slightly above. Square image with generous 15 percent transparent margin. Main object group centered, occupies about 70 percent canvas, fully in frame, readable when displayed 250px wide. Transparent alpha background, no floor or backdrop, no baked-in large shadow, no white rectangle. No words, letters, numerals, logos or watermarks. No green, neon, gold or dark background. Not a screenshot, not a user interface. Elegant restrained sculptural still life, not plastic cartoon clipart. Subject: a beautifully crafted small ivory payslip sheet with softly curled lower corner, resting against a lavender clipboard. Sheet contains three short embossed plum horizontal lines and a neat lavender checkmark seal, no words or numbers. A compact satin blush calculator sits beside the lower-left edge, with a blank dark plum display and a precise three-by-three array of small ivory keys. Payslip is dominant, calculator secondary, fully in frame. Convey transparent calculation and review of staff earnings, no cash, coins, bank cards, money transfers, arrows or charts.

## Verification

- `npx vitest run components/landing/hanaylo/MobiloLanding.test.tsx`: 5 passed.
- Desktop visual inspection at 1440px confirmed equal media-panel alignment, loaded images and clean console/error output.
- Mobile inspection at 375px confirmed all three illustrations loaded and cards stacked cleanly. No horizontal page overflow at 375px or 320px. Next.js compilation issues were empty.
- `npm run lint -- --max-warnings=0` and `npm run typecheck`: passed.
- Open-artwork follow-up repeated those checks and the five focused tests successfully. At 1440px and 375px, illustrations sit directly on the outer cards; computed image-container backgrounds are transparent with zero-width borders. No overflow at 320px/375px; browser and Next.js compilation checks are clean. Scoped whitespace checks passed.
- Build and database/authenticated E2E are not repeated for this isolated content/image/styling update. Existing route and animation behavior are preserved.
