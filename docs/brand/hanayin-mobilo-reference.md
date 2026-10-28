# HANAYIN Mobilo reference revision

Reference: https://mobilo.framer.website/ and the user's supplied full-page
screenshot, inspected on 7 October 2026. This supersedes the earlier violet
visual direction for `/redesign` only.

## Lavender and blush palette refinement

The subsequent user request restores lavender, pink, and purple while retaining
the Mobilo section layout, typography, dimensions, and blank media areas.
`mobilo.module.css` now uses violet #7041b8, plum ink #281b36, muted copy #5b5067,
lavender #e7ddfb, blush #f9dfed, and a deep plum #30203f footer. Teal accents,
green-tinted borders, and neutral gray surfaces have been recolored consistently.

Fine 4px radial-gradient dots fade diagonally across foundation cards. The hero
uses a softer masked 5px pattern; the supporting plan banner and final CTA also
carry the texture. Patterns are CSS-only, static, and pointer-transparent. Blank
image slots remain untextured. No new assets, dependencies, or interactions.

The four focused landing tests passed. Desktop and 375px mobile browser checks
confirmed no overflow, working menu dismissal, and no browser/Next compilation
errors. The automated WCAG A/AA scan found zero violations; textured backgrounds
still require manual contrast review. White/violet buttons measure 6.69:1 and
footer copy against its lightest plum gradient stop measures 6.65:1. The build
is not repeated for this isolated CSS color/texture change; the preceding full
route build passed. Original measured colors below document the reference.

Final palette checks passed: `npm.cmd run lint -- --max-warnings=0`,
`npm.cmd run typecheck`, and
`npx.cmd vitest run components/landing/hanaylo/MobiloLanding.test.tsx` (four tests).
Both scoped files passed whitespace checks.

## Scope and contract

Reproduce the reference's section sequence, proportions, spacing, card geometry,
colors, and button treatment with HANAYIN content. All photography, product
screenshots, decorative objects, and avatar areas use blank CSS placeholders.
The existing root homepage, product application, authentication, data model,
and previously generated assets are unchanged. No deployment is included.

Keep `/redesign` public and noindex. Preserve Lenis, scoped GSAP header motion,
live reduced-motion preferences, keyboard navigation, and real `/apply`, `/login`,
`/privacy`, and `/terms` destinations. Keep content static and server-rendered;
the existing header and smooth-scroll controller remain client boundaries.

## Measured reference

- Main content cap: 1320px; desktop horizontal gutters: 60px minimum.
- Hero: 1400px tall on desktop, starting its copy at 220px.
- Section padding: 80px vertically; heading-to-content gap: 60px.
- Headings: Sequel Sans Roman Body, 72/79.2px hero, 52/62.4px section titles,
  and 32/41.6px feature titles. Tracking: -4px, -2px, and -1.5px respectively.
- Body and navigation: Poppins; body 18/32.4px, card copy 16/28.8px.
- Accent: #055049; card background: #f7f7f7; body text: #5c5c5c.
- Three-column cards: 24px gaps. Feature grid: two columns plus a full-width
  split card. Detail rows alternate image/copy. Plans use three columns and
  a full-width supporting banner.
- Rounded gray surfaces, white inset image panels, raised teal/black buttons,
  faint vertical grid lines, offset business cards, and a dark teal footer.

Poppins is self-hosted through `next/font/google`. Sequel Sans is not supplied
in the repository, so headings currently use the declared Sequel family with
Arial/Helvetica fallbacks at weight 500. No third-party font binary was copied.
Exact font matching requires an appropriately licensed Sequel Sans webfont.
Consequently this is a measured layout reproduction, not a pixel-identical claim.

## Content mapping

The hero explains service-team operations. Foundation cards describe the day,
the team, and earnings. Features cover bookings, staff assignment, service/payment
status, reporting, attendance, and payslips. Commission eligibility requires a
completed service and fully paid booking; transfers and statutory payroll remain
separate.

Plan names and capability boundaries follow
`features/billing/plan-entitlements.ts`. Existing homepage prices differ from
billing seed prices, and administrators can edit actual plan prices. This preview
therefore uses “Pricing confirmed at setup” rather than publishing an unverified
amount or an unsupported annual billing toggle. All plan CTAs open `/apply`.

The reference's testimonials become descriptive business-use examples, without
invented customers, quotes, ratings, or adoption counts. Its integration diagram
becomes the actual booking/team/service/earnings workflow. Its newsletter and
app-store CTAs become application and login links; no nonfunctional form or
unsupported app-store availability is presented.

## Implementation

- `app/redesign/page.tsx`: Poppins and static metadata; mounts `MobiloLanding`.
- `components/landing/hanaylo/MobiloLanding.tsx`: reference section composition,
  truthful copy, native FAQ disclosures, and blank media slots.
- `components/landing/hanaylo/mobilo.module.css`: isolated design, including
  desktop/tablet/mobile layouts and reduced-motion overrides.
- `HanayloHeader.tsx`: reference appearance/navigation option; original variant
  remains available. Existing GSAP lifecycle and Lenis integration are reused.
- `MobiloLanding.test.tsx`: section targets, blank imagery, real CTA destinations,
  mobile plan navigation, and product-claim safeguards.

## Verification

Focused command:

```text
npx.cmd vitest run components/landing/hanaylo/MobiloLanding.test.tsx components/landing/hanaylo/HanayloInteractions.test.tsx components/landing/hanaylo/RedesignSmoothScroll.test.tsx
```

All 14 tests passed. Browser checks at 320, 375, 768, 1024, 1440, and 1920px
confirmed no horizontal page overflow. At 320px the mobile menu button remains
44px wide and the header is 64px high. Mobile and desktop anchors clear the
header by about 124px. Escape restores menu-button focus. FAQ disclosures open;
live reduced motion disables Lenis without losing scroll position.

React inspection confirmed the intended server/client composition. Browser and
Next.js runtime checks reported no errors. The WCAG A/AA scan reported zero
violations, with gradient/overlap contrast checks incomplete; this is not a
complete accessibility certification. Database and authenticated E2E checks are
outside this public presentation-only change.

`npm.cmd run lint -- --max-warnings=0` and `npm.cmd run typecheck` passed.
All seven scoped text files passed `git diff --no-index --check -- NUL <file>`.
Manual contrast calculations: body on the darkest hero gray 5.26:1, audience
labels on that gray 4.57:1, white on teal 9.33:1, and footer copy on teal 6.19:1.
Client navigation to `/privacy` removed Lenis; browser history restored the page.
`npm.cmd run build:app` passed; `/redesign` remains statically prerendered.
The post-build browser reload and Next.js compilation/runtime checks passed.

## Hero imagery follow-up

The hero now uses four generated transparent objects:
a lavender salon hair dryer, blush nail polish, an ivory spa towel, and a serum bottle.
Their scale and positioning frame the headline and the two dashboard corners;
a scoped GSAP intro reveals the copy and objects with reduced-motion support.
The dashboard and unfinished section media are still blank. Generation prompts,
file paths, placement rules and current verification are recorded in
[hanayin-hero-assets.md](hanayin-hero-assets.md). The all-blank imagery verification
above describes the earlier reference rebuild.

## Foundation imagery follow-up

The three foundation cards now explain bookings, team coordination and staff
earnings with matching transparent 3D planner, staff-badge and payslip illustrations.
Updated copy, product evidence, generation prompts and verification are in
[hanayin-foundation.md](hanayin-foundation.md).
