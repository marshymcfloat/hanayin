# Product imagery for /redesign

Current brand: **HANAYIN**, selected by the user on 6 October 2026. The original
generation prompts retain the former name as provenance. Only the dashboard
image contained an embedded brand label; it has been edited to HANAYIN.

The user requested product images grounded in the working interface instead of
the original hand-built marketing cards. This revision replaces the dashboard,
bookings, team, booking-detail, payroll, and growth illustrations with generated
raster assets. The existing landing composition and brand palette are retained.

## Source and capture method

The owner workspace requires verified authentication and tenant ownership. It
was not exposed or bypassed for this task. Actual presentation components were
rendered locally with fictional typed records in a temporary development-only
capture route. No real customer, employee, compensation, or business data was
used. The capture route was removed before validation and handoff.

Sources:

- `components/dashboard/owner-preview/OwnerDashboardPreview.tsx`: actual owner
  KPIs, Financial pulse chart, Today's bookings, local preview booking dialog,
  and expanded Growth opportunity panel.
- `components/dashboard/owner-preview/OwnerEmployeesPreview.tsx`: actual
  directory, role filters, service specialties, and regular days off.
- `components/dashboard/owner-preview/OwnerPayrollPreview.tsx`: actual rate
  table, recorded net pay, and paid payslip history.
- Existing component tests and feature DTO types establish the fixture shapes.

The local prop-based booking preview was used for the detail reference. It is
not the authenticated full booking editor. That editor always reads booking
notes on mount and was excluded from the capture.

The original staff-column calendar illustration was not found in the current
owner workspace. Its image and headline now describe the actual booking list.
The original invented social editor illustration now shows the actual growth
opportunity panel.

## Selected assets

All six images were generated with the built-in image generation tool, visually
inspected, and copied into the repository. They preserve the source's supported
fields while using the landing page's violet/lavender treatment. They are
illustrative representations, not unedited production screenshots.

| Asset | Dimensions | Prompt |
| --- | --- | --- |
| `public/hanaylo/product-dashboard-hanayin.png` | 1586 × 992 | [Original dashboard](imagery-prompts/dashboard.txt), [HANAYIN name edit](imagery-prompts/dashboard-hanayin-edit.txt) |
| `public/hanaylo/product-bookings.png` | 1536 × 1024 | [Bookings](imagery-prompts/bookings.txt) |
| `public/hanaylo/product-team.png` | 1536 × 1024 | [Team](imagery-prompts/team.txt) |
| `public/hanaylo/product-booking-details.png` | 1536 × 1024 | [Booking detail](imagery-prompts/booking-details.txt) |
| `public/hanaylo/product-payroll.png` | 1536 × 1024 | [Payroll](imagery-prompts/payroll.txt) |
| `public/hanaylo/product-growth-refined.png` | 1536 × 1024 | [Growth](imagery-prompts/growth.txt), [targeted refinement](imagery-prompts/growth-refinement.txt) |

The booking detail keeps a confirmed booking, an expected deposit, and payment
not recorded as separate facts. Payroll shows stored rates and recorded paid
payslips. No automatic transfer, new payment integration, or new commission
model is implied. Growth retains the existing reason, confidence, time window,
offer type, and Create offer action; its unavailable occupancy notice is omitted
from the marketing crop without inventing an estimate.

## Rendering and accessibility

### Current Mobilo layout: Key features (2026-10-07)

`MobiloLanding.tsx` now uses the existing bookings, team, and booking-detail
illustrations in its three Key features cards. The source screenshots and
current presentation components were rechecked before reuse. No new images
were generated for this integration. The hero and other unfinished media slots
remain unchanged.

The team card describes roles, specialties, and regular days off rather than
suggesting a staff-column calendar. All three images retain descriptive
alternative text. A visible disclosure identifies the images as interface-based
illustrations with fictional records. Interface controls within the bitmaps are
illustrative. Images are non-interactive throughout the active `/redesign` page;
there are no enlargement links or "View larger" controls.

The compact feature layout uses one primary booking panel beside two smaller
team and visit-detail panels. Short copy, smaller corner radii, and icon labels
replace the previous two equal tall cards and full-width third card. The
lavender/blush containers remain. Asset-specific aspect ratios and positioned
images crop baked-in margins without reserving their empty space. No product
content is edited. At tablet widths the main panel spans both columns; phones
stack the three panels with readable copy and full-width visuals.

Verification: six focused landing tests passed; all three images loaded in the
browser; mobile widths of 320 and 375 pixels had no horizontal overflow;
768-pixel tablet and 1440-pixel desktop framing were visually inspected. The
updated regression test checks all page images for interactive ancestors and
the absence of enlargement controls. Next.js reported no
compilation or runtime errors. No database or authentication changes were made.
Build and authenticated E2E checks were not repeated for this presentation-only
change.

- `npx.cmd vitest run components/landing/hanaylo/MobiloLanding.test.tsx`: 6 passed.
- `npm.cmd run lint -- --max-warnings=0`: passed.
- `npm.cmd run typecheck`: passed.
- Scoped `git diff --no-index --check`: no whitespace diagnostics.

### A closer look (2026-10-08)

The current section separates business performance from staff compensation.
It reuses `product-dashboard-hanayin.png`, cropped in CSS to the Financial pulse
panel, and `product-payroll.png`, showing pay settings and recorded paid history.
No new images were generated. Both are non-interactive, use descriptive alt
text and visible sample-data captions, and omit extra image frames.

Content was checked against `OwnerDashboardPreview.tsx`,
`OwnerPayrollPreview.tsx`, `features/payroll/services/payslip-policy.ts`, and
`features/payroll/services/payslip.ts`. The copy describes recorded revenue and
expenses, supported chart periods, daily pay for present days and paid leave,
and commissions from eligible completed services on fully paid bookings. It
does not claim automatic money transfers or tax processing.

Desktop uses alternating image/copy rows; mobile puts each explanation before
its image. Browser checks covered 320, 375, 768, and 1440 pixels, loaded images,
non-interactive media, and text order. Next.js reported no compilation/runtime
issues. Seven focused landing tests passed. Build and authenticated/database
E2E checks are excluded because only public presentation and copy changed.

- `npx.cmd vitest run components/landing/hanaylo/MobiloLanding.test.tsx`: 7 passed.
- `npm.cmd run lint -- --max-warnings=0`: passed.
- `npm.cmd run typecheck`: passed.
- Scoped `git diff --no-index --check`: no whitespace diagnostics.

### Earlier landing implementation (historical)

`ProductPreviews.tsx` maps the static image assets to the landing sections.
Next.js Image serves responsive optimized variants with stable intrinsic
dimensions. Only the hero image is preloaded. Each image has descriptive alt
text and a keyboard-accessible full-size link; raster interface controls do not
perform app actions. The hero and dark section label the views as illustrations
with sample data. Supporting feature copy carries the main meaning independently
of small embedded screenshot text.

The old interactive demo component remains in the repository but is not mounted
on `/redesign`. Current validation covers the mobile navigation, image loading,
full-size links, responsive layout, framework errors, and production build.
Database and authenticated E2E suites are outside scope because the operational
workflows are unchanged.

## Verification on 2026-10-06

- `npm.cmd run lint -- --max-warnings=0`: passed after making image alt props
  explicit for the accessibility lint rule.
- `npm.cmd run typecheck`: passed.
- `npx.cmd vitest run components/landing/hanaylo/HanayloInteractions.test.tsx -t 'Hanaylo mobile navigation'`:
  two passed; the two legacy demo tests were excluded by this filter because the
  demo is no longer mounted on the page.
- `npm.cmd run build:app`: passed; `/redesign` is static and the temporary capture
  route is absent from the production route map.
- Scoped `git diff --no-index --check -- NUL <file>`: passed.
- Browser: all nine rendered images loaded, six full-size links target their
  real assets, a full-size PNG opened successfully, and 320/375/768/1440 pixel
  layouts have no horizontal document overflow.
- Automated WCAG A/AA scan: zero violations; gradients and embedded raster text
  still need manual review. This is not a full accessibility certification.
- Next.js MCP: no compilation issues or runtime errors.
