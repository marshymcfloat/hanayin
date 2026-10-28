# HANAYIN responsive booking study

`/redesign/booking` explores the landing page's lavender/blush materials in the
first booking step. It is public and noindex, with explicit sample catalog data.
It does not create bookings, access tenant data, or replace any production form.

## Design translation

- Preserve `/redesign` violet `#7041b8`, plum ink `#281b36`, lavender `#e7ddfb`,
  blush `#f9dfed`, Poppins body text and existing heading fallback.
- Use texture and a single reused nail-polish illustration in the summary
  header; keep catalog rows and money legible on quiet white surfaces.
- Translate the landing's raised violet button and inset white arrow into the
  next-step affordance. Scheduling is explicitly unavailable in this study.
- Keep search/category controls stationary, use compact selectable rows, and
  put selection management exclusively in the right summary.
- Bound catalog and selected-item scrolling independently so additions do not
  move the selector or total. Category buttons wrap rather than scroll sideways.
- Support native keyboard buttons, visible focus, pressed states, announced
  totals and reduced motion. Below 1024px offer the mobile preview launcher.

## Scope

`app/redesign/booking/page.tsx` owns static metadata and applies the shared font.
`components/bookings/design-study/BookingDesignExperiment.tsx` owns this isolated
presentation prototype, fixture data and local selection state. Its CSS module
does not affect the landing or owner dashboard. The focused test covers totals,
quantity/removal, retained selection across filtering, and the submission boundary.

Before adoption, adapt the approved presentation to the existing owner catalog
cache and booking form state. Preserve package expansion, pricing rules, slot
validation and server-confirmed booking creation; the fixtures are not domain logic.
The remaining booking steps require their own design pass.

## Typography and sheet variation

The landing and study now import the same Poppins configuration from
`components/landing/hanaylo/fonts.ts`. Both use Poppins for body text and controls,
and the same Sequel Sans / Arial / Helvetica heading stack at weight 500.
Sequel is not installed; the actual heading face remains the landing's fallback.
Service names, filters and summary details use larger readable type; decorative
uppercase slogans were removed.

Choose **Open as sheet** on `/redesign/booking` to compare the right-side overlay.
It reuses `CatalogEditorOverlay` for blur, entrance/exit, focus trapping, Escape
and focus restoration. Its optional `className` applies only to dialog content;
existing callers retain their default appearance. The font variable is applied
directly to the portal content so it cannot fall back to the dashboard font.
Page and sheet have independent fixture selections and unique accessible IDs.
The background page is inert while the sheet is open. Closing the sheet discards
only its experimental selection; the page selection remains intact.

At desktop widths, booking progress sits in a vertically centered floating rail
to the left of the sheet.
It stays inside the dialog's semantic/animation boundary but outside its visible
surface; the scrolling form no longer includes a progress row. The slimmer title
header and removed row recover content space. The sheet reserves horizontal room
for the rail on smaller desktops. Mobile retains its compact step label.

## Mobile drawer

On phones, choose **Open mobile preview**. The existing overlay animates upward;
tablets retain its side-sheet motion with single-column content. The service
picker scrolls independently of the persistent total/Continue bar. Below 1024px,
services and packages use two equal-width cards per row, with name/duration above
the price and selection indicator. Desktop keeps its single-column list. Filters wrap,
descriptions and decorative imagery are hidden, and interactive targets retain
44px touch areas. The selection count opens the existing summary above the bar,
without moving the catalog. Collapsing returns focus to the count; Escape closes
the entire drawer using the shared overlay's existing behavior.

The experiment opts into panel autofocus, avoiding the automatic phone keyboard.
Other overlay callers retain field autofocus. A scoped Visual Viewport listener
keeps the phone drawer above the keyboard and cleans up on unmount; safe-area
padding protects the footer. The scheduling action remains disabled because this
is a sample-data first-step study, not a booking submission flow.

## Verification

On 7 October 2026, the following passed:

- `npx vitest run components/bookings/design-study/BookingDesignExperiment.test.tsx`
  (two interaction tests).
- `npm run lint -- --max-warnings=0`, followed by focused lint after the final
  component move.
- `npm run typecheck`.
- `npm run build:app` in a temporary source snapshot with dummy local database
  settings; `/redesign/booking` was statically prerendered. The snapshot was
  placed outside `node_modules` after that location caused build-tool errors.

Browser checks at 1024px and 1440px covered search/no-results recovery, services
and packages, quantities, totals, keyboard focus, stable selector position, and
reduced motion. At 375px the desktop-study notice replaces the prototype.
The accessibility scan reported no violations and 40 passes; gradient contrast
needed manual review. Checked text/background combinations exceeded 5.3:1.
Next.js compilation/runtime checks and the clean browser console had no errors.
Database integration and authenticated E2E suites were not run: this is a public,
local-state design study without live data or writes.

### Typography and sheet follow-up

The focused study and shared catalog overlay suite passed 15 tests. The study's
three tests were rerun after adding background-inert coverage. Strict lint,
`npm run typecheck`, and an isolated `npm run build:app` passed; the temporary build copy was removed
without touching the active development build.

Browser checks confirmed matching computed landing/study fonts, a blurred
backdrop, independent sheet selection, unique IDs, Escape/focus restoration,
reduced motion, and no horizontal overflow at 1024px and 1440px. The final
accessibility scan reported zero violations and 43 passes; gradient contrast
and Radix focus guards required manual review. A clean reload reported no
browser or Next.js runtime errors. Production booking behavior was unchanged.

### Mobile follow-up

The study and shared overlay suite passed 18 tests, including mobile summary
totals/quantities, collapse focus, opt-in panel autofocus, and Visual Viewport
listener cleanup. Strict lint and typecheck passed. Browser checks at 320px,
390px, 768px, and 1440px confirmed no horizontal overflow, a persistent footer,
search recovery, package selection, and focus restoration. A 450px-high viewport
was also checked; a physical iOS/Android keyboard was not available for testing.
Phone and tablet accessibility scans reported zero violations and 41 passes;
overlay occlusion/gradient contrast and Radix focus guards need manual review.
`npm run build:app` passed in an isolated source snapshot with dummy database
settings. The temporary snapshot was removed; the active development build was
preserved. The live booking flow and database were not changed, so database and
authenticated E2E suites were not run for this experiment.
