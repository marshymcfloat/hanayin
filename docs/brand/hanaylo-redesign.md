# HANAYIN public landing page

Current visual direction (7 October 2026): the user's Mobilo reference replaces
the earlier violet layout on `/redesign`. See
[the reference revision](hanayin-mobilo-reference.md) for measurements, blank
image placeholders, typography limitations, content mapping, and verification.
The visual and imagery notes below describe previous iterations.

The user renamed the brand from Hanaylo to **HANAYIN** on 6 October 2026. Current
visible copy, uppercase wordmarks, accessible labels, metadata, and the embedded
dashboard label use HANAYIN. Internal component and asset directories retain
their existing paths. Earlier design notes and generation prompts are historical.

Rename verification: strict lint and TypeScript passed; the two focused mobile
navigation tests passed. Browser inspection confirmed HANAYIN in the title,
application name, social site name, accessible home labels, header/footer
wordmarks, and the edited dashboard asset. No former-name text remains in the
active page. The 320px layout has no horizontal overflow and retains single-line
CTA labels. Domain and linguistic checks were outside this copy/image change.
The final `npm.cmd run build:app` also passed after the mobile spacing correction.

Route: `/redesign`

Work item: [SER-64](https://linear.app/serviceflow/issue/SER-64/build-the-hanayin-landing-page-at-redesign)

## Navigation motion

The header sits transparently inside the pastel hero at the top. Between 24px
and 140px of scrolling, GSAP reveals a frosted, rounded surface behind it.
Desktop links sit in the center, with the wordmark and plum CTA on either side.
The header retains the 1280px content cap. At 800px and below, navigation opens
in a detached panel with a short staggered reveal, without shifting page content.
Escape restores focus to the menu button; outside presses and desktop resizing
close the panel. Existing anchor, application, and login destinations are preserved.

`useHeaderMotion` owns scoped GSAP contexts and cleans up on unmount. Lenis
scroll events update ScrollTrigger without adding another animation loop.
One persistent trigger handles both motion preferences: reduced motion switches
the surface immediately at 48px and disables the menu reveal. Keeping that trigger
alive during preference changes prevents GSAP refresh from losing the saved scroll
position. Test live preference changes while scrolled as well as on initial load.

Verification on 6 October 2026: the two focused Vitest files passed all ten tests;
strict lint and TypeScript passed. Browser checks covered 320, 768, 1024, and 1440px
layouts, intermediate scroll opacity, wheel input, mobile anchors, keyboard and
outside dismissal, live reduced-motion changes, and client navigation away/back.
No horizontal overflow, browser errors, or Next.js compilation/runtime issues
were observed. The header WCAG A/AA scan reported zero violations, with gradient
contrast requiring manual review. Database/authenticated E2E checks are outside
this public presentation change.

`npm.cmd run build:app` passed after the final motion changes; `/redesign` remains
statically prerendered. All seven scoped text files passed whitespace checks.

## Smooth scrolling

`RedesignSmoothScroll` mounts the existing Lenis 1.3.23 dependency for the whole
document while `/redesign` is active. Its animation loop smooths wheel input and
same-page anchor links, using the section scroll margins to clear the sticky
header. Touch scrolling keeps native momentum. See the
[Lenis integration reference](https://github.com/darkroomengineering/lenis).

Reduced-motion users retain native scrolling; live preference changes destroy
or recreate the controller. Stop the controller before destroying it so pending
native-scroll callbacks cannot restore its document classes after navigation.
Its root CSS override is also removed on cleanup, preserving other pages.

Mobile menu anchor handlers synchronously close the expanded menu before Lenis
measures the destination. A regression test covers this event ordering. Other
focused tests cover reduced-motion changes, unmount cleanup, and Strict Mode
effect replay.

Verification on 6 October 2026:

- `npm.cmd run lint -- --max-warnings=0`: passed.
- `npm.cmd run typecheck`: passed.
- `npx.cmd vitest run components/landing/hanaylo/RedesignSmoothScroll.test.tsx components/landing/hanaylo/HanayloInteractions.test.tsx`:
  eight tests passed. The new menu-order regression failed before the timing fix.
- `npm.cmd run build:app`: passed after the final changes; `/redesign` remains static.
- Browser: wheel input animated through intermediate positions; desktop and
  mobile anchor targets settled about 115px below the viewport top. Mobile
  navigation closed correctly, and keyboard skip navigation reached main content.
- Live reduced-motion toggles disabled/re-enabled Lenis. Client navigation to
  `/privacy` removed the controller classes and restored the existing scroll
  behavior; browser history navigation back reactivated Lenis.
- Final reload: no console warnings/errors or Next.js compilation/runtime issues.
  Scoped whitespace checks passed. Database/authenticated E2E suites were not
  run because this change only affects the public landing presentation.

## Desktop width refinement

The 6 October 2026 refinement increases the content cap from 1080px to 1280px.
The header and dashboard also cap at 1280px, aligning their edges on wide screens.
Image `sizes` reflect the wider display. Existing mobile gutters, grid ratios,
and paragraph/FAQ reading widths are preserved. Scope is limited to the landing
page stylesheet and product image sizing; routing and application behavior stay
unchanged.

Browser measurements confirmed 1280px content at 1440px and 1920px viewports.
No horizontal overflow occurred at 320px, 768px, 1440px, or 1920px. All product
images loaded; a fresh reload reported no browser or Next.js compilation/runtime
errors. `npm.cmd run lint -- --max-warnings=0` and `npm.cmd run typecheck` passed, and
`npx.cmd vitest run components/landing/hanaylo/HanayloInteractions.test.tsx -t 'HANAYIN mobile navigation'`
passed both navigation tests (two unrelated legacy tests excluded by the filter).
The production build was not repeated for this isolated styling/image-size
change; the prior route build passed.

## Contract

Introduce HANAYIN as business management for service teams: bookings,
staff-delivered services, payments, and staff earnings. Growth and social tools
support the operating workflow. The route is public and uses isolated styling,
metadata, and brand assets.

The existing homepage, application and sign-in workflows, authentication, tenant
access, and global styles are outside this implementation. Get started opens the
existing `/apply` application-review flow; Log in opens `/login`.

The route uses `noindex, nofollow` while it is an alternate design. Review the
canonical and indexing policy when this becomes the primary website.

Acceptance: responsive layouts, keyboard-accessible navigation and full-size
image links, functional FAQs, truthful claims, clearly illustrative data and
imagery, and no new backend dependencies.

Latest visual revision: the user requested generated images based on the actual
system instead of programmatic product cards. See [Product imagery](hanaylo-product-imagery.md)
for sources, capture method, final assets, exact prompts, and validation. The hero
and product sections now use static product illustrations with full-size links.
The earlier interactive-tour verification below is historical.

## User reference direction

The user supplied three screenshots on 6 October 2026 and rejected the earlier
warm-paper/persimmon editorial composition. These supplied screenshots are the
primary visual references for this revision:

- Wiza pricing page: lavender and blush gradients, centered headings, small
  badges, softly rounded panels, compact violet actions.
- Attio landing page: centered bold hero, substantial straight-on dashboard,
  bordered product demonstrations, a quieter white content rhythm.
- Spyglass landing page: capsule navigation, a framed image rail, broad rounded
  dark sections, alternating product demonstrations, oversized footer wordmark.

The page adapts this structure to HANAYIN's actual service-team workflow. It does
not reuse competitor logos, copy, testimonials, customer lists, ratings, or images.
Earlier online research included [Linear](https://linear.app/),
[Attio](https://attio.com/), [Raycast](https://www.raycast.com/),
[Mercury](https://mercury.com/), and [mymind](https://mymind.com/). The supplied
screenshots supersede the earlier layout direction.

Composition: capsule header → centered hero and interactive workday → audience
examples → schedule/team product cards → pastel human-context image rail →
rounded dark service/earnings section → supporting growth tools → FAQs → pastel
CTA → decorative oversized wordmark.

| Token | Hex | Role |
| --- | --- | --- |
| Ink | `#19171F` | Primary text and dark section |
| White | `#FFFFFF` | Primary surface |
| Violet | `#6940D6` | Brand accent, active controls, focus |
| Lavender | `#EEE8FC` | Product accents and pastel surfaces |
| Blue | `#E5EFFF` | Secondary information surfaces |
| Blush | `#F8EAF4` | Supporting gradient accent |
| Muted | `#66616F` | Secondary copy |

Manrope headings use a stronger weight and tight spacing. The brand mark retains
three aligned strokes in a violet app tile. Content text is separate from
decorative background graphics. Motion is optional and disabled for reduced
motion preferences.

## Implementation

- `app/redesign/page.tsx`: server page, Manrope font, HANAYIN metadata, noindex.
- `components/landing/hanaylo/HanayloLanding.tsx`: server-rendered composition.
- `HanayloHeader.tsx`: responsive navigation and Escape/focus handling.
- `WorkdayDemo.tsx`: local sample data, keyboard tabs, selected-service details,
  eligible earnings. No real business data or mutations.
- `ProductPreviews.tsx`: grouped, labeled sample schedule, team, service,
  earnings, and growth illustrations.
- `BrandMark.tsx`, `public/hanaylo/mark.svg`: aligned-stroke mark.
- `hanaylo.module.css`: page-scoped styling and breakpoints.
- `HanayloInteractions.test.tsx`: selection, commission eligibility, keyboard
  tabs, navigation focus, and real CTA destinations.

Completed services and fully paid bookings determine illustrated commission
eligibility. Employee-level rates and daily pay are described. Automatic money
transfers, statutory payroll calculations, tiered rates, and split-provider
commissions are not promised. Numeric pricing and trial claims are omitted
because current marketing and configuration values differ.

## Generated assets

Both assets were generated with the built-in image generation tool, inspected,
and saved inside the repository. Subjects are fictional brand imagery, with a
visible disclosure under the image rail. Next.js serves optimized variants.

- `public/hanaylo/studio-moment.png`: 1024 × 1536, vertical salon scene.
- `public/hanaylo/team-moment.png`: 1536 × 1024, reception team scene; also used
  for social metadata.

Studio prompt:

```text
Use case: photorealistic-natural.
Asset type: editorial photo card for a modern SaaS landing page.
Primary request: vertical portrait 2:3 photograph of a fictional adult Filipino hairstylist carefully styling the hair of a fictional adult Filipino client in a bright modern independent salon.
Scene: airy white salon with restrained pale lavender wall and furniture accents, a slim black mirror frame, clean neutral materials. A modest attractive local business with believable salon details.
Subjects: one professional hairstylist wearing a simple black apron and one seated client in a light neutral salon cape. A candid concentrated hair-styling moment, the stylist holding a brush and arranging the client's shoulder-length hair. Both faces visible in natural three-quarter view; plausible hands.
Style: sophisticated contemporary editorial photography, soft natural daylight, realistic skin and hair texture, high realism, calm approachable mood.
Composition: vertical 2:3 with people filling the middle of the frame, enough context to recognize a salon, readable at a small card size.
Palette: white, very pale lavender, black and clean neutrals.
Constraints: no text, no logos, no watermark, no readable labels, no medical setting, no extra people, no exaggerated pose. The people are fictional brand imagery, not a customer endorsement.
```

Team prompt:

```text
Use case: photorealistic-natural.
Asset type: landscape editorial photo card for a modern SaaS landing page.
Primary request: landscape 3:2 photograph of two fictional adult Filipino service team members behind a light reception counter reviewing one tablet together in a bright independent service studio.
Scene: clean white reception area with restrained pale lavender cabinetry or wall details, light neutral countertop, subtle black fixtures. Believable small modern local service business, airy and uncluttered, no luxury corporate office.
Subjects: a woman and a man in simple charcoal professional workwear, friendly natural manner and soft candid expressions while checking their day on a tablet. One holds the tablet; the other looks at it. Plausible hands and faces. Tablet angled with no readable screen details.
Style: sophisticated contemporary editorial photography, soft morning daylight, realistic skin and material textures, high realism. Approachable and calm.
Composition: landscape 3:2, medium-wide view, both people together around the center with reception context. Their heads and tablet visible clearly at small card sizes, no extreme cropping.
Palette: white, pale lavender, charcoal and light neutrals. No orange or warm brown visual theme.
Constraints: no text, no logos, no watermark, no readable labels or screens, no fake interface, no customers, no additional people, no medical context, no theatrical smiles or exaggerated business poses. The people are fictional brand imagery, not a customer endorsement.
```

## Verification

Required checks: strict lint, TypeScript, focused Vitest, production build, and
browser inspection. Database and authenticated E2E suites are outside this
change because no data or authentication workflow was modified.

Executed for the revised implementation on 2026-10-06:

- `npm.cmd run lint -- --max-warnings=0`: passed.
- `npm.cmd run typecheck`: passed.
- `npx.cmd vitest run components/landing/hanaylo/HanayloInteractions.test.tsx`:
  four tests passed.
- `npm.cmd run build:app`: passed; `/redesign` is prerendered as a static route.
- `git diff --no-index --check -- NUL <file>`: all twelve scoped text files passed
  whitespace inspection (new-file diff exit codes handled separately).

Browser coverage: 320, 375, 768, and 1440 pixel widths; keyboard tabs and selected
record state; mobile navigation; FAQ disclosures; CTA destinations; image
loading; title and noindex metadata; React component/state inspection; Next.js
compilation/runtime errors.

The automated WCAG A/AA scan found zero violations after fixes. Gradient
backgrounds require manual contrast checks. Secondary copy against the darkest
pastel background measures 4.89:1; white against the lightest primary-button
gradient stop measures 5.19:1. Decorative graphics are hidden from assistive
technology. This scan is not a complete accessibility certification.
