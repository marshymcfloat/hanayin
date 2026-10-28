# Hanaylo landing-page plan

Date: 6 October 2026. Related decision: [Hanaylo identity](hanaylo-identity.md). Preview: [brand-preview.html](../../design-system/hanaylo/brand-preview.html).

Historical concept: the user’s supplied Wiza, Attio, and Spyglass references supersede this visual direction. The current implementation and palette are documented in [Hanaylo public landing page](hanaylo-redesign.md), served at `/redesign`.

## Contract

Create a recognizable marketing identity around staff-delivered services and earnings. The primary visitor should understand the audience, the core workflow and the next action from the first screen. Keep growth features visible as supporting value.

This planning deliverable adds only new documentation and a standalone HTML concept. It preserves the existing application's behavior and the extensive unrelated working-tree changes. The concept contains illustrative records, not live product data. Production implementation is a subsequent bounded task.

## Current page diagnosis

The current homepage leads with “The operating system for your salon” and “Built for the Philippine beauty industry.” The centered headline, green glow, dot background and large dashboard image reinforce that industry-specific identity. Broad feature/industry sections then dilute the core staff-and-earnings story. See [HeroSection](../../components/landing/HeroSection.tsx) and [homepage composition](../../app/page.tsx).

Change the narrative as well as the color. Lead with a clearly described operating model, show one service moving between responsible people, and explain how earnings become eligible for a payslip. The hero product composition should expose that relationship at readable size.

## Design research

Research references and observations are recorded below. Source pages were reviewed on 6 October 2026. Visual observations are distinguished from content-only findings; these references inform composition and storytelling rather than authorize copying a brand.

| Reference | Evidence inspected | What informs Hanaylo |
| --- | --- | --- |
| [Linear](https://linear.app/) | Official page text and the live desktop opening at 1440px. Near-black canvas, large left-aligned category headline, restrained navigation and a broad product interface demonstration. Page content progresses through intake, planning, automation and delivery. | Use a precise category and concrete workflow evidence. Carry the visitor through the work in a deliberate sequence. Hanaylo adds warm surfaces and an orange accent rather than copying the all-dark treatment. |
| [Attio](https://attio.com/) | Official page text and the live desktop opening at 1440px. Large centered headline, generous light space, clear paired CTAs and a prominent interface example with a subtle blue surround. | Keep the category explicit and give the product demonstration enough space to be readable. Use Hanaylo's asymmetric composition and service/earnings story; do not reuse Attio's agentic-revenue promise. |
| [Float](https://www.float.com/) | Official page content only; resource management, scheduling and planning are named directly. Visual styling was not verified. | Describe the operational job clearly. Use as a category-language reference, not evidence for a particular palette or layout. |
| [Mangomint](https://www.mangomint.com/) | Official page content only; explicitly positions booking and management around salons and spas. Visual styling was not verified. | Keep industry relevance available while Hanaylo leads with the shared staff-delivered service model. |

The research supports clear category language, visible product evidence and a coherent workflow story. It does not establish that a specific color or layout converts better. Persimmon & Graphite is an original art-direction decision for Hanaylo, not an extracted competitor palette. The desktop reference inspection covered the opening view, not a complete accessibility or conversion audit of those sites.

## Page architecture

| Order | Section | Content and visual treatment |
| --- | --- | --- |
| 1 | Header | Hanaylo wordmark; Product, Who it's for, Pricing; Log in; Get started. Keep the main CTA stable. On mobile, expose a labeled menu without hiding the CTA. |
| 2 | Hero | Graphite background; left headline “Bookings, staff, and commissions. In order.” Category above; exact product description below. Right: a focused booking/service/earnings composition. Primary CTA “Get started”; secondary “See how it works.” |
| 3 | Fit statement | “Your customers book a service. Your team delivers it.” Use three explicit traits: appointments or walk-ins, staff doing services, pay linked to work. Industry examples are secondary supporting text. |
| 4 | Connected workflow | A single illustrative customer/service record across Book → Assign → Complete → Review earnings. Payment state remains visible alongside it. Keyboard-operable controls; no autoplay. Explain that completed services on fully paid bookings are eligible for payslip inclusion. |
| 5 | Product proof | Actual staged screenshots of scheduling/queue, staff earnings and payslip review. Crop to readable operational details. On mobile, stack the screenshots rather than shrinking a whole desktop dashboard. Captions state what is real. |
| 6 | Staff earnings | “See the work behind the pay.” Show daily pay and commission breakdown. Explain current employee-level percentage rules without implying tiered, split or historical effective-date rates. |
| 7 | Supporting growth | “Keep the next visit in sight.” Three quiet editorial rows: reminders/follow-ups, schedule-based promotion ideas, social content. Show only enabled, verified capabilities and clarify plan/integration requirements. |
| 8 | Trust and pricing | Genuine customer proof when available; otherwise concrete product walkthrough and accessible support. Transparent verified PHP pricing and plan inclusions. No placeholder ratings, unverified trial promises or invented logos. |
| 9 | FAQ and close | Questions about walk-ins, commission/daily-pay fit, staff access, payments, payroll scope and setup. Close with “Your business, in order.” and the same primary CTA. |

The concept intentionally demonstrates the hero, workflow, audience, support story and visual system. Pricing, live signup, screenshots and testimonials are excluded from the prototype until their sources are reconciled. Prototype links navigate within the concept; they do not create an account or submit information.

## Visual behavior

Use the Persimmon & Graphite palette and Manrope typography specified in the identity brief. The first screen is asymmetric, with copy occupying roughly half the available width and the product composition offset on the other half. Keep max content width around 1240px. Alternate a dark opening with warm paper and pale-blue evidence sections.

Three aligned rows form the recurring graphic device. Avoid generic decorative shapes that say nothing about the workflow. Use compact table-like records and attached context labels, not a large dashboard full of unreadable numbers. Make a strong visual distinction between sample earnings and actual reported business performance.

For mobile, preserve the headline and primary action before the illustration, then stack every record and explanatory panel. Controls must work at 320px without page-level horizontal scrolling. Use at least 44px interaction targets, visible focus, semantic headings and textual statuses. Respect reduced motion. Do not hijack scrolling or require hover to reveal product information.

## Candidate implementation scope

Inspect the current versions before editing; the working tree contains ongoing changes.

- Marketing entry point and metadata: `app/page.tsx`, applicable marketing routes and metadata utilities.
- Shared landing presentation: header, hero, feature/fit sections, workflow, pricing, FAQ, CTA and footer under `components/landing/`.
- Shared brand assets: new logo masters, favicon/social image, marketing color tokens and documented type decisions.
- Existing social profile: reconcile `design-system/brand-profile.json`, which still describes beauty-industry green branding and different typography.
- Later application pass: inspect the owner preview and shared tokens before applying the brand to owner/staff surfaces. Do not overwrite `DESIGN.md` or its separate preview work as part of this plan.

Preserve existing authentication and application destinations. “Get started” should use the verified current onboarding route; the present hero links to `/apply`, which must be inspected at implementation time. Do not create a nonfunctional demo CTA. Preserve public booking and tenant-specific identity.

## Acceptance and verification

The planning artifacts must open, use consistent approved copy, keep sample data labeled, and demonstrate the chosen colors. The HTML concept must support keyboard interaction and fit 320/375/768/1440px widths. Measure text contrast and check for console errors. Inspect a desktop and mobile screenshot.

For a later application change, follow repository rules: inspect relevant guides and version-matched Next.js docs; run lint, typecheck, focused tests, and `npm run build:app` for routes/rendering/production behavior. Verify actual navigation, onboarding CTA, responsive layout, console and overlay in a browser. Add relevant flow checks for any behavior changes. This brief does not claim those application checks have run.

Before launch, reconcile public pricing and trial language with the actual billing configuration; verify social integrations and claim availability; replace illustrative UI with real staged product proof; confirm domain control and prepare the separate URL migration when needed.

## Verification performed for this concept

- Opened the local HTML through a loopback-only Python HTTP server and inspected desktop/mobile screenshots with Playwright CLI (`hanaylo-brand` session).
- Executed browser checks at 1440, 768, 375 and 320px: no horizontal page overflow, including all four workflow states; one main landmark; Manrope loaded successfully.
- Clicked all workflow controls. Arrow keys, Home and End worked with the correct mobile/desktop orientation. The earnings state displayed the separate payout handling note.
- Emulated reduced motion: computed scroll behavior was `auto`. The concept reload and interactions produced no page or console errors in that check.
- Calculated the palette contrast ratios in the identity brief. This is focused verification, not a full accessibility audit.
- Ran `git diff --no-index --check -- NUL docs/brand/hanaylo-identity.md`, `git diff --no-index --check -- NUL docs/brand/hanaylo-landing-plan.md`, and `git diff --no-index --check -- NUL design-system/hanaylo/brand-preview.html`; no whitespace diagnostics. No-index returns 1 because these are new files.
- A broader `git diff --check` also reported existing whitespace in unrelated generated Prisma changes. Those files were left untouched.
- Application lint, typecheck, builds and product tests were not run: no application source or behavior changed. The source audit does not establish live integration correctness.
