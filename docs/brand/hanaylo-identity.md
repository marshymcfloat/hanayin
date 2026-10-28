# HANAYIN identity

Decision date: 6 October 2026. Scope: positioning, messaging, visual identity, and a landing-page concept. This brief establishes the proposed brand; it does not rename the running application, change tenant branding, migrate domains, or change product behavior.

Name update: the user selected **HANAYIN** in place of Hanaylo on 6 October 2026. The current `/redesign` implementation uses the new name; historical artifact paths retain the earlier token.

## The decision

**HANAYIN is business management software for service teams.** Its strongest fit is a business where customers book or walk in, staff perform priced services, and the owner needs to connect the work to payments and staff earnings.

Lead with **bookings, staff, and commissions**. Target the way a business operates, then use industries as examples. Commission-based teams are the initial focus; daily-rate teams and teams using both pay methods also fit the current product.

This is a positioning decision grounded in source code, not a claim that demand or conversion has been validated with customers.

| Identity element | Final direction |
| --- | --- |
| Name | HANAYIN |
| Spoken form | Preferred pronunciation has not been finalized. |
| Name story | Center the brand story on putting the business in order. Linguistic meaning and etymology have not been verified for HANAYIN. |
| Category | Business management for service teams |
| Audience qualifier | Built for teams that deliver services and earn commissions |
| Brand line | Your business, in order. |
| Homepage headline | Bookings, staff, and commissions. In order. |
| Core promise | Connect the work your team does with the payments you record and the pay they earn. |
| Character | Clear, capable, grounded, warm |
| Initial market | Philippine owner-managed service businesses |

## Who HANAYIN is for

The best-fit customer has a service menu, named staff providers, appointments and/or walk-ins, and staff earnings linked to attendance or delivered services. The owner or manager buys the software; receptionists, cashiers, and service providers use different parts of the workflow.

Salons, barbershops, spas, nail studios, and other appointment-based service teams can share this operating model. Show them as examples below the core proposition. Keep clinic messaging limited to verified operational workflows; medical records, clinical decision support, and medical compliance are not established capabilities in this audit.

This positioning does not extend to every business with employees. Retail-first shops, restaurants, project agencies, field-service dispatch operations, and complex commission organizations need separate fit validation. Team size is not a proven segmentation boundary yet; avoid inventing a maximum or ideal staff count.

The main customer problem is fragmented daily administration: the booking is in one place, the person doing the work in another, and earnings in a spreadsheet. HANAYIN's narrative should follow these connected records rather than present a catalogue of unrelated features.

## Product hierarchy

| Priority | Customer job | Features to emphasize |
| --- | --- | --- |
| Core 1 | Organize the day's work | Booking, walk-ins, service menu, availability, staff assignment |
| Core 2 | Know who did what | Staff queues, claim/complete service actions, customer history, recorded payments and balances |
| Core 3 | Account for staff earnings | Employee commission percentage, attendance, daily pay, payslip preparation and recording |
| Support 1 | Bring customers back | Reminders, follow-ups, re-engagement, vouchers and gift cards |
| Support 2 | Find the next opportunity | Growth suggestions, campaigns, social content and supported publishing integrations |

Growth tools belong in the brand, but after the operating workflow is understood. Translate “Growth Opportunity Engine” into customer language such as **“Find opportunities in your schedule.”** Describe the tool as suggesting promotions from operational context, not autonomously producing revenue.

## Claims grounded in the current product

Source audit only: these references establish implemented logic, not fresh runtime or integration verification.

| Claim | Source evidence | Boundary |
| --- | --- | --- |
| Connect service work to a provider and earnings | [Service records](../../prisma/schema.prisma), [staff service completion](../../features/dashboard/services/employee-queue.ts) | Service completion credits commission using the employee's percentage. Do not promise historical rate snapshots or split/tiered commission rules. |
| Support appointments and walk-ins | [Booking persistence](../../features/bookings/services/booking-persistence.ts), [availability](../../features/bookings/services/booking-availability.ts) | Availability considers specialties, shifts, workload and reservations. |
| Calculate daily pay plus commission | [Compensation policy](../../features/payroll/services/payslip-policy.ts) | Attendance and paid leave contribute to daily pay; a bounded manual deduction is supported. |
| Prepare and record payslips | [Payslip eligibility and release](../../features/payroll/services/payslip.ts) | Eligible services are completed, uncancelled, not already included, and attached to fully paid bookings. Release records a payslip; it does not transfer money. |
| Record payments | [Payment actions](../../features/payments/actions/booking-payments.ts), [integration inventory](../integration-inventory.md) | Cash, GCash, card and bank-transfer records are not evidence of live processing for every method. The documented online flow uses manual GCash verification. |
| Suggest timely promotions | [Opportunity detector](../../lib/services/growth/opportunity-detector.ts) | Context includes quiet capacity and calendar events. Suggestions need user decisions and configured integrations. |

Payment and service completion are related records, not a mandatory chronological sequence: a customer may pay before or after service. A product illustration must not imply that completing a service automatically collects payment. Service commission inclusion in a payslip requires the relevant booking to be fully paid; attendance-based daily pay is eligible independently of booking payments.

Do not advertise automatic bank payouts, statutory payroll/tax compliance, every commission structure, guaranteed growth, advanced medical workflows, or worldwide localization. Keep the initial product story in Philippine pesos and the Philippine operating context.

## Competitive position

Commission tracking is an existing category capability. [Fresha](https://www.fresha.com/help-center/knowledge-base/team/98-set-up-commissions-for-team-members) documents fixed/tiered commissions and pay-run integration. [Phorest](https://www.phorest.com/us/features/) describes wages and configurable commissions. [Timely](https://help.gettimely.com/hc/en-gb/articles/1500002504702-How-to-calculate-staff-commission-using-Timely-reports) explains using staff sales reports for commission calculations. Sources reviewed 6 October 2026.

HANAYIN should compete through a focused promise for Philippine service teams and a clear connection between bookings, performed services and staff earnings. This is the proposed positioning, not proof of feature superiority or exclusivity. Do not call HANAYIN the first or only platform for commissioned staff.

## Messaging ready to use

**Short description**

HANAYIN connects bookings, service work, recorded payments, and staff earnings for service teams.

**Homepage eyebrow**

Business management for service teams

**Homepage headline**

Bookings, staff, and commissions. In order.

**Homepage supporting copy**

Manage appointments and walk-ins, keep service work assigned, and calculate staff commissions and daily pay—all in one place.

**Fit statement**

Your customers book a service. Your team delivers it. HANAYIN helps you keep the work and the earnings connected.

**Supporting growth section**

Keep the next visit in sight.

Use reminders, promotion ideas, and social content to support the business you run every day.

**Voice rules**

Use familiar verbs: book, assign, serve, record, calculate, review. Describe what happens before describing the feature. Use “staff earnings” when discussing pay broadly and “commission” when the percentage calculation matters. Avoid “AI-powered operating system,” “business on autopilot,” “unlock growth,” and unmeasured time/revenue claims.

## Visual identity: Violet & Lavender

The user’s supplied Wiza, Attio, and Spyglass screenshots supersede the original persimmon concept. The current direction uses a white product-focused layout, violet actions, lavender and blush surfaces, capsule navigation, and rounded dark sections. The recognizable symbol remains three aligned rows representing the service, the staff member, and the earnings record. See the [implemented landing direction](hanaylo-redesign.md).

Violet supplies recognition while white surfaces keep the product information clear. Trust comes from readable product evidence, accurate claims, support access, and real customer proof.

| Token | Hex | Role |
| --- | --- | --- |
| Violet | `#6940D6` | Primary actions, active controls, brand signature |
| Ink | `#19171F` | Primary text and dark surfaces |
| White | `#FFFFFF` | Main light surface |
| Lavender | `#EEE8FC` | Product accents and pastel surfaces |
| Blue | `#E5EFFF` | Secondary information surfaces |
| Blush | `#F8EAF4` | Supporting gradient accent |
| Muted | `#66616F` | Secondary text |

Keep the main reading surface white, introduce pastels in framed sections, and use a single broad dark product section. Reserve distinct semantic tokens for errors and warnings.

Measured sRGB text contrast:

| Foreground / background | Ratio |
| --- | --- |
| Ink / white | 17.74:1 |
| Violet / white | 6.35:1 |
| Muted / white | 5.99:1 |
| Muted / lavender | 5.02:1 |
| White / lightest primary-button gradient stop | 5.19:1 |

Use white lettering on violet buttons and visible violet focus outlines on light surfaces. Check control boundaries and states separately. These measurements are not a whole-page accessibility certification. [WCAG contrast reference](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

**Typography:** [Manrope](https://fonts.google.com/specimen/Manrope) for the wordmark direction, headlines and body; weights 400/500/600/700. Use tabular numerals for schedules and money. Retain the existing Geist Mono only where a dense operational table benefits. The standalone concept uses a system fallback when Manrope cannot load. The existing app uses Geist, while the older social brand profile names other fonts; reconcile these during rollout.

**Wordmark:** uppercase `HANAYIN`, with a simple three-row alignment symbol. The concept symbol establishes a direction; it is not a finished logo or a uniqueness clearance. Produce dedicated SVG masters, a monochrome version, and a legible 16/24-pixel favicon during implementation.

**Composition:** centered bold hero, substantial dashboard preview, capsule navigation, bordered product cards, a gently curved image rail, 18–30px section corners, and alternating product demonstrations. Pastel gradients belong to section backgrounds. Use restrained 160–220ms transitions; product information remains readable without motion.

**Imagery:** show real workflows and, when available, authentic staff/business photography with permission. Product screenshots should use staged accounts without customer personal data. Label any schematic or sample figures. Do not invent customer logos, ratings, testimonials or ROI metrics.

## Alternative directions considered

| Direction | Palette and treatment | Decision |
| --- | --- | --- |
| Persimmon & Graphite | Orange `#F26B3A`, graphite `#24262B`, paper `#F7F4EF`; aligned rows, operational detail, warm editorial spacing | Superseded by the user’s supplied reference direction. |
| Cobalt & Chalk | Cobalt `#2952CC`, chalk `#F2F4F7`, ink `#202738`; structured calendar grid, sharper typographic rhythm | Credible but closer to familiar productivity software; less distinctive for this brief. |
| Plum & Apricot | Plum `#492B45`, apricot `#F3B590`, linen `#F4EEE8`; larger editorial type and staff portraits | Warm and expressive, but more likely to imply a beauty/lifestyle niche than a shared operating model. |

Earlier alternative colors remain exploratory. The implemented violet direction follows the user’s visual references and retains the product-demo-led structure.

## Search and naming

Use **HANAYIN** consistently in the site name, wordmark, metadata, social profiles and structured data. The homepage category should be descriptive: “HANAYIN | Bookings, Staff & Commission Management.”

A coined name helps create a consistent branded search target; it does not promise higher rankings. [Google's site-name guidance](https://developers.google.com/search/docs/appearance/site-names) favors a unique, concise, accurate name and consistent supporting signals.

Retain useful industry pages as acquisition pages where their claims fit the product. Build substantial pages for staff commission tracking, appointment/walk-in management, and staff earnings; avoid near-duplicate pages that only swap industry names. Keyword volumes and search difficulty have not been measured here.

Domain selection, availability, ownership, and naming clearance for HANAYIN have not been checked in this rename. The earlier registry result applies only to the previous Hanaylo candidate.

If the production domain changes, map old URLs to equivalent new URLs with permanent redirects, update canonical URLs, internal links, sitemap and structured data, and verify the relevant Search Console properties. Follow [Google's site-move guidance](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes); preserve existing search value rather than deleting industry content as part of the identity change.

## Deliverables and rollout boundary

- [Landing-page plan](hanaylo-landing-plan.md): research, section architecture, copy, implementation scope and acceptance criteria.
- [Public landing implementation](hanaylo-redesign.md): current reference direction, palette, assets, and verification.
- [Earlier visual concept](../../design-system/hanaylo/brand-preview.html): superseded persimmon exploration, retained for context.

Implement in stages: shared identity assets and marketing first; owner/staff application tokens second; generated social templates and communication surfaces third; domain migration separately. Keep tenant-created brands intact. Verify pricing/trial language against current billing/onboarding behavior before publishing it. A brand rename should not silently alter authentication, payment integrations, database identifiers or tenant URLs.
