# ServiceFlow Frontend Engineering

Status: normative guide for new and modified frontend code

Last reviewed: 2026-09-23

## Scope

This guide covers Next.js routes, React Server Components, client components,
shared UI, styling, accessibility, browser behavior, and frontend verification.
`ARCHITECTURE.md` remains the system overview; `DESIGN.md` describes the current
preview design system; `docs/testing.md` owns detailed test-harness evidence.

## Ownership

| Location | Responsibility |
| --- | --- |
| `app/` | Routes, layouts, metadata, loading/error boundaries, page composition, and thin transport adapters |
| `components/ui/` | Reusable presentation primitives without domain persistence |
| `components/<area>/` | Composed UI for a product surface |
| `features/<domain>/` | Domain contracts, queries, actions, services, schemas, and feature-owned UI when appropriate |
| `hooks/` | Hooks shared by multiple product surfaces |
| `public/` | Reviewed static assets |

Pages and components must not import Prisma. UI calls the owning feature's
public action or query contract. Do not place reusable domain decisions in a
route or component.

## Next.js 16 Rules

Before editing framework behavior, read the matching installed guide under
`node_modules/next/dist/docs/`. The installed package is authoritative for this
checkout; general memory or older examples are not.

Use Server Components by default. Add `"use client"` only at the smallest
interactive boundary that needs state, effects, browser APIs, or client-only
libraries. Do not move an entire page to the client to avoid a server-rendering
constraint.

### Cache Components and Suspense

`params`, `searchParams`, `cookies()`, `headers()`, and uncached data are
request-time inputs. The component that awaits or reads them must be inside the
relevant `<Suspense>` boundary.

```tsx
import { Suspense } from "react";

export default function Page({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  return (
    <main>
      <PageHeading />
      <Suspense fallback={<ContentSkeleton />}>
        <RuntimeContent params={params} />
      </Suspense>
    </main>
  );
}

async function RuntimeContent({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  return <FeatureContent businessSlug={businessSlug} />;
}
```

Place the boundary as low as possible while covering the runtime read. Keep a
useful static shell outside it and provide a visible, layout-stable fallback.
Avoid page-wide boundaries and `fallback={null}` unless an intentionally empty
shell is part of the reviewed design.

For each rendering-boundary change:

1. Run focused tests, strict lint, typecheck, and `npm run build:app`.
2. Reload the affected URL in a real browser and also navigate to it from a
   sibling route.
3. Confirm the static shell paints, the fallback resolves to real content, and
   the final UI remains correct at desktop and mobile widths.
4. Check the browser console and Next.js overlay.
5. Recheck sibling routes if a layout, wrapper, navigation component, or shared
   loading boundary changed.

## Public modal route boundaries

Keep the public business `@modal` slot's dismiss routes explicit (business home,
services, booking success/manage, and booking details). Do not add a root
`[...catchAll]` beneath that slot: in the current Next.js runtime it can capture
owner-preview API requests and return business-page HTML instead of JSON.
When adding a public destination, add its null modal slot if navigation should
close an open modal. Preserve the booking/gift-card interceptors and `default.tsx`.
`test/e2e/owner-preview-api-routing.spec.ts` checks the real HTTP boundary.

## Data and Mutation Flow

- Server-rendered reads use feature-owned query functions returning narrow DTOs.
- Mutations cross a Server Action or Route Handler that validates input,
  authenticates, authorizes, and delegates to a feature service.
- Client components render pending, success, empty, denied, and error states;
  they do not infer authorization from hidden controls alone.
- Cache invalidation happens on the server after a successful write.
- Client-visible values and errors must be serializable and safe.

### Owner-preview workspace cache

Redesign payroll uses simple pay tracking by default for new businesses and an
explicit opt-in from existing legacy payroll. Government calculations remain in
the advanced workspace, including businesses already using that policy. The
simple interface uses Choose dates, Review pay, and Save payslips; its sheets
close on valid submit and retain a recoverable draft while a pending item awaits
server confirmation. Published corrections create linked adjustments in a later
or extra-pay run. Its shell refresh must include both the owner-preview
payroll key and `payroll-lifecycle` keys scoped to business slug and owner ID.
Successful lifecycle commands invalidate related preview summaries. People →
Pay settings is the main compensation entry point. Payroll shortcuts and older
`stage=setup&employee=…` links open the same employee-scoped pay editor.
Financial commands remain server-confirmed: never
optimistically mark a payslip published, a payment recorded, or payroll activated.
Keep failure toasts, retryable inputs, revision checks, and stable request keys.
The simple workspace exposes pending adjustment decisions and historical commission
confirmation in Pay checks, not government setup. Confirmed source reviews refresh
affected drafts by employee ID; published history stays fixed. Its fallback reserves
the three progress steps, summary figures, filters, and responsive employee rows.

The verified owner-preview layout owns an in-memory TanStack Query client scoped
to the owner and business. Query keys include business ID, slug, owner user ID, page,
section, and filters. All 18 owner-preview routes read independently
authenticated, tenant-scoped JSON endpoints with `Cache-Control: private,
no-store`; responses are cached only in browser memory for 15 minutes after a
query becomes inactive, except sensitive Payroll compensation, which is removed
from the client cache when the route unmounts.

Dashboard today/queue data is fresh for 10 seconds; billing, sale events, and
social posts, Attendance, Bookings, and Notifications for 30 seconds; dashboard
analytics, Growth, and Reports for 60 seconds; catalog, Customers, Employees,
Owners, and business hours for two minutes. Payroll checks authorization on each visit and polls every 30 seconds
while mounted. Its compensation response is not retained after navigation.
Stale data stays visible
during background and manual refetches. Refresh controls target their section
or current selection rather than refreshing the route. The visible queue,
pending social deliveries, and sensitive Payroll poll every 30 seconds. Successful mutations
update or invalidate affected keys, while failed optimistic edits roll back.
The client cache is cleared when the owner identity changes, on logout, or on
an authorization failure. Do not persist it. Booking/payment operations remain
server-confirmed; customer creation may optimistically insert a provisional row
and must roll back on failure. Notifications is a read-only delivery history.
The owner booking sheet closes when a validated submission starts, after any
duplicate-customer choice. Its pending request and recoverable form draft remain
in the verified owner shell's memory across route changes. Only a confirmed
server success invalidates booking views; failures offer explicit draft recovery.

The quick-booking overlay and static form shell must appear before catalog
reads complete. Keep the heavy form code-split with a matching shell fallback;
only its service selector shows a cold-data skeleton. The owner-scoped
bookings/create-catalog query uses two-minute freshness and 15-minute memory
GC; service/package edits invalidate that exact key. Stale data and failed
background refreshes must not replace the form instance or discard its draft.
Do not reuse catalog freshness for time-slot availability or booking confirmation.

Customer Inbox is separate from Social posts and Notifications. Its sensitive
list/detail queries use `gcTime: 0`, exact cancellation/removal on selection
changes and unmount, and existing owner/tenant revocation. Never persist message
content or optimistically label a suggestion as sent. `CONFIRMED` means provider
accepted/observed sending, not recipient delivery/read. Setup/permission/consent
states must remain truthful; publishing connectivity does not prove messaging
capability. See [inbox safeguards](docs/social-conversation-assistant.md).

The redesign inbox lives at `/redesign/owner-dashboard/customers/inbox` inside
`OwnerCustomerWorkspace`. It reuses `OwnerCustomerInboxRoute` and its existing
permission-checked snapshot/detail endpoint; the server boundary derives the slug
from the owner session. Keep the shared customer navigation and matching
pre-verification/loading shell. Lavender styling is opt-in, including portaled
settings and simulation menus. List and detail loading remain independent;
refresh failures retain visible messages. Mobile selection focuses the detail
heading, and Back restores the conversation button. Message scrolling follows
new content only while the reader is near the bottom; all inbox scroll areas
use the 800ms idle/200ms fade pattern and reduced-motion handling.

The current contract has no unread/read receipt field, mark-read mutation, or
manual send/retry action. Show read status as unavailable; never infer unread
counts from activity or simulate sending. Pending, failed, and unknown delivery
states remain distinct. Replies continue through the supported Messenger flow.
Settings and takeover remain server-confirmed, with Sonner results, duplicate
submission guards, failed-draft retention, and settings dismissal locked while
saving. The synthetic assistant lab remains separate from live messaging and
retains its existing opt-in policies. Browser verification must not save settings,
toggle takeover, run AI simulation, or mutate any live conversation.

## UI Quality Rules

### Redesign Team integration

Team routes live under `/redesign/owner-dashboard/team/`. `OwnerTeamNavigation`
owns the `OwnerTeamPage` union, labels, and enabled destinations for Employees,
Owners, Attendance, and Payroll. The desktop rail and mobile Team dock lead to
Employees. Team pages replace the dashboard section sidebar with Team sections;
dashboard hash links and Business navigation retain their existing behavior.
The mobile Menu uses the same enabled-destination registry. Enable an entry only
when its route exists, then update the navigation tests and add the page's
matching identity fallback to `OwnerRedesignWorkspaceLoading`.

Compose each page inside `OwnerTeamWorkspace` with its own query/presentation as
children. This adapter supplies the verified identity, booking controller,
sign-out handler, and refresh for that page's `page` section. Pages using filtered
or multiple section keys must supply appropriately scoped refresh behavior.
Keep the shared layout's owner query provider mounted across navigation. Future
pages must preserve their existing permissions and sensitive cache policies.

Employees reuses `OwnerEmployeesPreviewRoute` with an opt-in redesign presentation
and the existing `employees/page` directory query. Search and role filtering
precede progressive rendering. Cached rows stay visible during retryable refresh
failures. The separate `employees/editor` read verifies current owner membership
and current employee accounts, selects only form fields, and returns private,
non-cacheable HTTP responses. Its browser query has zero retention after the
editor unmounts; compensation and permissions never enter the directory DTO.
Permission defaults come from the existing server policy.

Employee sheets reuse `CatalogEditorOverlay`, themed Radix menus, and the
800ms auto-hiding scroll area. Specialty/day-off edits dismiss immediately and
use optimistic rows with rollback. Independent same-page sessions retain failed
drafts with Review draft toasts and Resume buttons; recovering an older request
must not replace a newer form. Availability readers unmount after sheet dismissal
so the private editor query still has zero retention. Account creation, identity, permissions, compensation, weekly schedule,
password resets, invitations, and deletion remain server-confirmed. Lock duplicate
submissions and dismissal while saving, protect unsaved changes on dismissal,
preserve failed drafts, and report
mutation results through Sonner. An invitation's committed password rotation
with failed SMS delivery is a warning, never a sent-success message. Confirmed
writes invalidate Employees, Attendance, Payroll, and existing dependent booking,
dashboard, customer, and report queries. Legacy employee pages remain separate.

Owners at `/redesign/owner-dashboard/team/owners` opts into the redesign through
`OwnerOwnersPreviewRoute` and the existing `owners/page` tenant-scoped cache.
Its directory selects current owner accounts and service categories, with
management capability derived from the verified owner's stored SETTINGS_MANAGE
permission. No credential fields are selected or sent to the client. Missing
capability metadata fails closed. Search precedes progressive rendering; cached
rows remain visible during refresh failures. The Team registry enables Owners
alongside Employees; other Team destinations remain independently controlled.

Owner sheets reuse the catalog overlay, focus return, keyboard-accessible 800ms
auto-hiding scroll area, lavender tokens, and reduced-motion behavior. Specialties
update optimistically with immediate dismissal, rollback, and independently
recoverable same-page drafts. Permission edits
and primary-owner transfer require explicit confirmation and stay pending until
the existing server actions succeed. Keep primary settings access, at least one
permission, and exclusive report scopes; warn before removing one's own settings
access. Confirmed writes reconcile the directory and invalidate owner-scoped
dependent queries. Self-revocation immediately removes management controls and
returns focus to the directory heading. Legacy owner pages remain separate.

Attendance at `/redesign/owner-dashboard/team/attendance` uses the same Team shell
and `OwnerAttendancePreviewRoute` with an opt-in lavender presentation. Its
existing `attendance/page` key includes the Philippine calendar date. Date
navigation and all displayed timestamps use UTC+8; missing records remain
unrecorded rather than inferred absent. Previous-date rows are labeled and their
actions disabled while the next date loads. Search/status filters precede
progressive rendering. Leave requests are the latest 20 across all dates; the
pending count covers all requests.

Attendance corrections, paid/unpaid leave decisions, and history reuse the
existing authenticated workforce actions. Corrections require a successful
booking-impact read and explicit acknowledgment when assignments are affected.
These payroll-affecting writes remain server-confirmed, with duplicate locks,
retained failed drafts, unsaved-change protection, Sonner results, and focus return. Confirmed statuses
reconcile cached rows before invalidating all attendance dates and dependent
Payroll, Bookings, Dashboard, Reports, and Notifications keys. Attendance history
uses tenant-scoped cache tags expired by confirmed corrections and leave decisions;
its browser query has no retention after unmount. Legacy routes remain separate.

Team directory search, filters, progressive counts, and scroll position use
owner-provider memory keyed by verified user and business; no compensation or
form draft is stored in that list state. Manual refresh reports a single toast;
automatic refresh stays quiet. Private forms warn before discarding changes.

Payroll at `/redesign/owner-dashboard/team/payroll` uses the existing verified
payroll endpoint with `staleTime: 0`, `gcTime: 0`, and periodic access checks.
Restricted owners receive no financial rows. The redesign has matching loading
and error states, progressive employee search, and actual paid history. Legacy
redesign payroll shows preserved rates as read-only and links to the shared
Pay settings editor instead of maintaining a second compensation editor.
Existing legacy payroll remains available outside the redesign until an explicit
reviewed cutover; saving pay settings does not activate a business or rewrite its
legacy rate fields. Confirmed payouts invalidate payroll and dependent summaries.
Never optimistically mark compensation as paid or retain salary previews after
the editor unmounts. Legacy payroll presentation remains separate.

`EmployeePaySettingsEditor` is shared by People, simple payroll, and redesign
government setup. Its narrow authenticated read returns one current employee's
dated agreements, revision, calculation policy, and separately labeled legacy
suggestions; government identifiers and other employees' compensation are not
returned. Require PAYROLL_MANAGE again on read and save. The directory may cache
the permission capability, never wage amounts. Employee profile editing neither
reads nor writes compensation. Creating an employee can optionally hand off to
Pay settings after account creation; skipped setup is not a zero-rate agreement.
The shared sheet shows current/future history, supports day/hour/month and
optional commission, and requires the government monthly divisor where applicable.
Its only editable employment-related date is **Apply this pay from**, the pay
agreement's effective date. **Joined on** belongs to the People profile and
remains blank when unknown. Pay saves never submit or update employment dates;
even employment-date fields from older clients are ignored. Preserve the existing
payroll readiness requirements: if Joined on is needed, direct the owner to People.
Profile date changes require current payroll permission and the financial
revision captured when the profile opened. Save the date and profile atomically,
retain failure drafts, and refresh payroll data only after confirmation.
Recorded joining dates linked to saved payroll require a reviewed correction;
ordinary profile edits must omit unchanged dates. No pay or history migration is
performed by opening either editor.
Saved dated terms take priority, including recorded zero rates and scheduled pay.
When no dated terms exist, prefill a positive legacy daily rate and its commission
with a short source note. Legacy zero defaults are ambiguous and stay blank until
the owner explicitly enters a rate; saved zero-rate agreements remain valid.
Opening a prefilled sheet is not an edit or a save. Allow explicit Save without
requiring an artificial field change, and let Cancel dismiss untouched defaults.
Valid saves dismiss immediately, show a pending status, and retain rejected or
uncertain drafts with the same command key. Rate summaries change only after
server confirmation. Published work blocks backdated rate changes; previous
agreement amounts, captured commission, legacy rates, payslips, and payments stay
intact. Refresh existing draft payroll explicitly after a rate change.

Simple and government payroll reuse the catalog pages' content width, heading,
back link, summary strip, and mobile spacing. `OwnerPayrollHeader` owns their
shared page heading; the outer Team shell remains the only main landmark.
Inactive simple setup shows employee/pay-term counts, not financial zeroes.
Missing pay terms use searchable white employee rows outside the setup callout.
The loading skeleton reserves the back link and heading, followed by summary,
progress, filters, and rows. Keep calculations, setup/cutover, payment confirmation,
and sensitive-cache behavior independent of presentation changes.

Business Hours, Billing, and Reports are available at
`/redesign/owner-dashboard/business/{business-hours,billing,reports}`. They share
the verified owner layout, query cache, booking controller, mobile identity
header, and dock. Their page code is loaded independently; opening Hours must
not eagerly load the Reports chart. The authentication fallback selects matching
page skeletons before identity resolves. Legacy `/app/[businessSlug]` output
remains separate through opt-in redesign presentations.

Business Hours reuses its category-aware draft patch model. Changes appear
immediately as **unsaved**, remain editable after failures, and clear only after
a confirmed save and reload. Background changes rebase untouched fields, while
edited-field conflicts require explicit review. Duplicate saves are locked;
changing categories must not discard drafts. Result messages use Sonner, while
draft/conflict and unavailable-data notices stay inline. Empty time inputs must
never produce `NaN` coverage.

The redesigned hours page starts with one Business hours schedule (GENERAL in
storage), not category tabs. It groups adjacent days with matching hours and
states whether all services follow it. Separate category schedules are preserved
and disclosed in an optional “Different hours for some services?” section.
When all separate schedules match the main week, “Keep one schedule” offers
explicit consolidation without silently changing persisted records.
The catalog-style editor sheet lets owners select any days or use Every day,
Mon–Fri, and Sat–Sun shortcuts, then choose times, Open 24 hours, or Closed.
Applying the sheet updates a draft; only Save changes persists. Equal persisted
times mean 24 hours; explicit all-day edits serialize as 00:00–00:00. Equal custom
times require choosing the all-day mode. Seven all-day rows display Open 24/7.
Editing a separate service schedule materializes its full effective week so it
is independent. Confirming “Use business hours” stages removal of that category's
rows, not a copied week, so it follows later GENERAL edits and new days naturally.
The save options carry the previously read hours; the server checks that snapshot
inside a serializable, permission-scoped transaction before deleting overrides,
upserting edited rows, and auditing. A stale snapshot or serialization conflict
requires refresh and review. Legacy two-argument saves retain upsert-only behavior.
The compact skeleton mirrors the summary. A save bar appears only for unsaved
changes and clears the mobile dock. Dirty drafts warn on browser unload, not SPA navigation.
Reverse times retain the booking engine's same-weekday split-window semantics
(midnight to close, then open to midnight); do not label them as next-day closing.

Billing reuses the authenticated billing DTO and subscription actions. Money is
converted from centavos exactly once; dates use Philippine time. Invoices,
payment references, and plan changes remain server-confirmed, never optimistic
financial effects. Disable fields and actions during submissions, preserve
failed drafts, and distinguish a committed write from a failed refresh. Plan
selection uses the themed Radix menu, including its portaled font class.

Reports retains the existing tenant-scoped filter keys, previous-result cache,
and real XLSX export endpoint. Previous selections are visibly identified, and
exports stay disabled until the requested selection resolves; Expenses export
remains unsupported. Trend charts display one clearly labeled primary series
instead of combining currency and counts on a shared axis. Chart animation is
disabled to avoid initial/reload jank; filter indicators and breakdown bars use
brief reduced-motion-aware transitions. Operations displays actual contributor
count, not a completion rate combining historical work and the current queue.
Rankings fit mobile without an extra enclosing card or horizontal scroller.

The authenticated `/redesign/owner-dashboard` uses the verified owner query
provider and the `dashboard/redesign`, `today`, `queue`, and `growth` sections.
It must never fall back to fictional data.
Its shared authenticated layout also covers `/redesign/owner-dashboard/business/services`,
keeping the owner-scoped query cache and live booking controller mounted across
client navigation. Services uses the existing `services/catalog` query (two-minute
freshness), authenticated catalog endpoint, and service actions. The original
`/app/[businessSlug]/services` presentation remains separate. Sidebar and mobile
Menu links lead to the redesign route. The old `/redesign/owner-dashboard/services`
URL redirects to this Business route. While Services is active, the desktop
sidebar shows the Business navigation instead of dashboard section anchors and
the dashboard intro. Future Business pages are disabled placeholders, not dead
links or links to the legacy pages. The dashboard retains its own section menu.
Keep the shell visible while the catalog
loads; preserve cached rows during refresh and show retryable errors locally.
Search and sort use the full catalog, with twelve rows initially rendered and
explicit progressive disclosure. Reuse the existing list motion and reduced-motion
handling; do not attach scroll-driven animations. Successful service changes
invalidate dependent selectors, booking catalog, and redesign analytics.
Redesign catalog lists sit directly in the page rather than inside an extra
outer card. Service create/edit/delete use `useOptimisticCatalog` for immediate
row changes, pending states, server reconciliation, and rollback. Show mutation
results through Sonner success/error toasts, not page banners; retain entered
form values after a failed save and prevent duplicate submissions. Apply this
pattern to subsequent Business catalog pages.
Services, Packages, Vouchers, and Gift Cards also report explicit Refresh data
and failed-load retry results with toasts. Keep these notifications in click
handlers, not query effects: automatic reads and invalidation must stay quiet.
Refresh failures must not report cached rows as newly refreshed; offline-paused
requests show a connection warning. Gift-card claims remain server-confirmed.

Packages at `/redesign/owner-dashboard/business/packages` uses the same verified
layout, booking controller, and owner-scoped `packages/catalog` cache with
two-minute freshness. Its separate redesign presentation reuses existing package
actions and `useOptimisticCatalog`; the legacy Packages presentation is unchanged.
Package forms retain included-service choices and custom item prices across
search and failed saves. Valid catalog submissions dismiss immediately and show
pending rows; only server confirmation produces a success toast. Independent
editor sessions preserve rejected drafts and offer Review draft in the error
toast plus a persistent Resume draft button. An old response must never close
or overwrite a newer form. Drafts currently survive dismissal on the same page,
not navigation or reload. Closing a changed form offers Keep editing, Keep draft,
or Discard. Form footers contain only Cancel and the primary Create/Save changes
action. Gift-card claims remain server-confirmed.
Services and Packages offer Duplicate without reusing the source record ID.
Success toasts offer View item to reveal filtered-out records. Search, filters,
sort, expanded row count, and scroll position use owner-provider query-cache
memory; do not persist recipient details in browser storage. Clearing the owner
cache clears this memory. Gift-card email warnings remain visible for that owner
session; they are not historical delivery receipts or evidence of delivery.
Keep service choices in the editor's shared
auto-hiding scroll area, with a styled category menu and explicit new-category
input. Search the full catalog, including service names, before progressive
rendering. The read model's monthly revenue is sales multiplied by current
package prices: label it estimated booking value, not collected revenue.
Services, Packages, Vouchers, Gift Cards, and Sale Events are enabled in Business navigation
and the mobile Menu; unfinished Business sidebar entries remain disabled. Package commits
invalidate dependent gift-card and sale-event selectors, booking creation,
dashboard analytics, and reports through the existing catalog invalidation path.

Sale Events at `/redesign/owner-dashboard/business/sale-events` shares the verified
layout and existing owner-scoped `sale-events/page` query (30-second freshness).
`OwnerSaleEventsPreview` owns its existing actions, scheduling, discounts, catalog
selections, and linked social-draft controls; `OwnerSaleEventsStudy` supplies the
Services-style presentation. Keep the legacy presentation separate. Cold reads
use matching row/summary skeletons and a local retry; refresh failures retain
cached offers and open drafts. Summary counts remain from the confirmed read.
Create/edit/delete rows update optimistically with a synchronous submission lock,
pending controls, and rollback. Failed saves retain entered values. Creation
returns no persisted ID, so remove its temporary row after confirmation and
reconcile through the authenticated query; never leave a provisional ID usable.
Show mutation results through Sonner only on the redesign. Social publishing
remains server-confirmed. Cancel older reads before committing cached events and
invalidate sale events, social posts, bookings (including creation selectors),
dashboard, growth, and reports. Dialog scroll regions use keyboard-accessible
viewports with an 800ms idle delay and reduced-motion-aware fade.

The initial route fallback includes the real navigation shell with generic identity
until owner verification completes. Keep section loading/error states local:
today, queue, growth, and analytics resolve independently; analytics cards share
one request to avoid duplicate history scans. Queue badges stay absent until their
data arrives. Never replace the whole dashboard during a slow section or refetch.
Use geometry-matched skeletons, not zero figures or empty-state messages, for
unknown data. Keep auth and tenant checks ahead of private data and controls.

Below 640px, the redesign shell uses an opaque sticky identity header and a
five-position dock: Dashboard, Bookings, New booking, Team, Menu. New booking is
a raised action button, never a selected destination. Keep safe-area padding and
content clearance, and keep both shell surfaces below modal overlays. Desktop
and mobile booking triggers pass distinct focus keys to the existing controller.
The account sheet receives verified owner identity and a sign-out callback from
the query adapter; authentication effects stay outside presentation. Sign out
requires inline confirmation and supports pending/error/retry states. Preserve
session-driven query-cache cleanup. Before verification, identity is generic and
account actions are disabled. The section picker is behind a disabled local
option; its intersection/mutation observers must not attach while disabled.
The searchable Menu keeps verified business-scoped links; optional plan-gated
tools remain in the full workspace until entitlements are available.

Revenue is completed-service revenue,
not cash collected; average spend is per completed visit. Rankings use completed
work in Philippine-time week/month/year windows. Expenses are logged expenses,
excluding payroll. Do not infer staff availability, utilization, or salary from
completed work. Confirm writes on the server before updating the dashboard;
booking creation must also invalidate `dashboard/redesign` analytics.

The redesign dashboard opts into the live booking sheet's `bookingDesign="redesign"`
presentation. Reuse the production form, catalog, availability, validation, and
submission controller. The live and sample routes share `BookingSelectionSurface`
for identical selection layout and motion; only the sample route owns fixtures.
Pass the verified owner business slug explicitly to the
form because the redesign URL has no business-slug route parameter. Other owner
routes retain their existing booking presentation.

- Reuse existing primitives, tokens, and patterns before creating variants.
- Preserve semantic HTML, visible focus, keyboard operation, accessible names,
  useful landmarks, and appropriate live-region behavior.
- Support narrow mobile, tablet, and desktop layouts without horizontal page
  overflow. Touch targets must remain usable at mobile sizes.
- Respect reduced motion. Animation must clarify state or hierarchy and must
  not delay completion feedback.
- Every async surface needs an intentional loading state. Every collection needs
  empty and error states appropriate to the user's permissions.
- Skeletons should approximate final geometry to reduce layout shift.
- Do not expose tenant data, internal identifiers, stack traces, or privileged
  controls in client bundles without a product requirement.

The authenticated `/redesign/owner-dashboard/business/vouchers` uses the existing
`vouchers/catalog` owner-scoped query and voucher actions. Its separate presentation
reuses Services layout, menus, editor, list motion, and loading geometry; legacy
voucher pages are unchanged. Keep cached content mounted during refresh and
errors. Search/filter/sort the full catalog before showing twelve rows at a time.
Voucher codes remain single-use, with percentage or fixed discounts, minimum
spend, and Philippine-time expiry. Restoring a code does not renew its expiry or
usage. Never invent configurable redemption limits or eligibility rules absent
from the backend. Show provisional rows as pending, disable conflicting actions,
retain failed drafts, and confirm results only through server reconciliation and
Sonner toasts. Successful changes invalidate the voucher catalog, booking catalog,
dashboard performance/redesign, and reports. Keep editor dismissal blocked while
saving and preserve focus return and the 800ms auto-hiding scroll area.

Gift Cards at `/redesign/owner-dashboard/business/gift-cards` uses the verified
owner layout, booking controller, and existing `gift-cards/catalog` cache and
feature actions. Keep its redesign separate from legacy gift-card presentations.
Preserve recipient name, both contact fields, included services/packages, and
Philippine-time expiry. Search the full catalog before progressive rendering;
keep selection IDs independent of the editor's catalog search. Match loading
geometry at desktop/mobile sizes, including the pre-verification shell.
Pending CRUD rows must say “Saving…” rather than showing a confirmed status.
Keep overview counts server-backed, lock the editor during submission, preserve
failed drafts, and roll back failed optimistic changes. A delivery warning after
creation is a committed gift card with a notification failure, not a failed write:
show the confirmed success and separate warning through Sonner.
The claim sheet reuses `GiftCardClaimForm` in staff mode; never optimistically
mark a card claimed or announce a booking before its server response succeeds.
Confirmed claims invalidate gift cards, bookings, customers, reports, and dashboard
today/queue/performance/redesign/growth. CRUD invalidates the gift-card catalog,
booking catalog, performance/redesign analytics, and reports. Use the shared
editor's focus return, reduced motion, and 800ms auto-hiding scroll area. Gift
Cards is enabled in Business navigation and the mobile Menu.

## Frontend Definition of Done

Notifications at `/redesign/owner-dashboard/customers/notifications` is the
owner-only, read-only outbox delivery history for customer and employee messages.
Reuse `OwnerNotificationsPreviewRoute` and the existing owner/tenant-scoped
notifications endpoint; preserve legacy presentation. There is no unread state,
mark-read action, resend action, or navigation-target contract. Do not invent
these capabilities or infer recipient read status from delivery outcomes.
Share the event/outcome mapping in `features/notifications/presentation.ts`.
Unknown channel results remain untracked, and all filters, counts, and channel
rates explicitly describe the current server page. Timestamps use Manila time.
Keep the heading, Customers navigation, and mobile access independent of history
reads. Cold loading uses matching overview, history, and channel skeletons;
refresh failures retain cached data and offer a local retry. The read-only details
sheet reuses the themed catalog overlay, focus return, reduced motion, and the
800ms auto-hiding scroll area. Notifications has no mutation success toast because
viewing or refreshing history does not change notification records. All four
Customers destinations are available through shared navigation and mobile Menu.

### Customer workspace integration

The customer directory at `/redesign/owner-dashboard/customers` opts into
`OwnerCustomersPreviewRoute` with `redesign` and `fontClassName`. It reuses the
verified owner layout, existing `customers/directory` query with search, segment,
and page filters, and the customer history API. All query keys include verified
owner/tenant identity. Legacy presentations remain separate. Keep previous rows
visible on failed filter reads, identify the previous selection, and disable its
row actions and pagination until the requested selection resolves. Overview
counts describe confirmed data; provisional rows explicitly say Saving customer.

`OwnerCustomerNavigation.tsx` owns `OwnerCustomerPage`, labels, enabled flags,
and `ownerCustomerHref(page)`. The route contract is the Customers index above,
then `/customers/bookings`, `/customers/inbox`, and `/customers/notifications`
under `/redesign/owner-dashboard`. The directory and Bookings are enabled.
Successor implementations enable their registry entry after adding their page
and matching pre-verification fallback in `OwnerRedesignWorkspaceLoading`.
`OwnerCustomerWorkspace` accepts `{ page, fontClassName?, children }`, supplies
verified identity, booking/sign-out controllers, and refreshes active queries
under `ownerPreviewKeys.page(identity, page)`. Successors with a different query
namespace must adapt that refresh key explicitly. Shell and mobile menu accept
`OwnerCustomerPage`; the desktop Customers shortcut opens the index. Keep the
five-position mobile dock; Bookings opens the redesign bookings workspace while
New booking remains a distinct action with its existing focus-return key.
The existing notification destination remains available from
Notifications (current workspace) and the full workspace.

`OwnerCustomersStudy` owns presentation and sheet selection; the existing query
controller owns data and optimistic contact mutations. Creation uses the current
tenant-checked POST endpoint; edits use `updateCustomer`, whose server action
derives tenant identity and enforces write access. Roll back failed optimistic
rows and use Sonner results. Valid customer submissions close immediately while
their rows show pending status. Keep independent editor sessions so a late result
cannot replace a newer draft; failed drafts offer Review draft and a persistent
resume button while the page remains mounted. Guard dirty dismissal and duplicate
submissions, and lock edits per customer rather than blocking the whole directory.
Cancel older reads before committing confirmed contacts and
invalidate Customers, Bookings, Dashboard, Reports, and Inbox query namespaces.
Do not add customer deletion or outbound messaging to this directory implicitly.

Bookings at `/redesign/owner-dashboard/customers/bookings` composes
`OwnerBookingsWorkspace` inside the customer shell and a visible Suspense
fallback. Its opt-in `OwnerBookingsPreviewRoute` presentation uses the existing
owner/tenant-scoped summary, filtered list, and GCash review endpoints. Overview,
register, and payment review resolve independently with their own retry states;
cached results remain visible during same-key refreshes. Date/status/search/page
filters stay server-backed. Customers, Bookings, and Notifications retain their
filters and pagination in the verified owner's in-memory query cache, never browser
storage. Manual refresh reports success, failure, or offline status with a toast;
background polling remains quiet. The summary remains selected-day data when the list
switches to all dates. Amount received is confirmed recorded payment data, not
inferred revenue or availability.

New booking uses the layout's existing `OwnerBookingControllerProvider` with
`bookingDesign="redesign"`, including the live catalog, validation, availability,
duplicate guard, retained failed draft, and server-confirmed submission flow.
Do not add a second form or sample catalog. The page trigger has the separate
`redesign-bookings-new-booking` focus key. Details use `LazyBookingQuickPanel`
with verified owner context, real services, and an explicit verified business
slug because the redesign URL has no slug parameter. Booking and payment writes
remain server-confirmed. Successful detail/payment changes invalidate Bookings,
Customers, Reports, and affected Dashboard sections including redesign analytics.

`BookingDialogTheme` scopes the optional redesign presentation through booking
detail/action portals, including custom select menus; legacy owner and employee
themes remain the fallback. The detail viewport is keyboard-accessible and uses
800ms idle/200ms fading scrollbars. Payment review dialogs preserve failed input,
guard duplicate submissions, and report rejected/thrown actions without claiming
success. Inbox settings guard dirty dismissal and retain failed inputs; consent and
message outcomes remain server-confirmed. Notifications remain read-only rather
than inventing optimistic delivery or read states. Browser verification must never
submit a live booking or payment.

Customer sheets reuse `CatalogEditorOverlay`, explicit font/theme classes, and
keyboard-accessible Radix scroll viewports with 800ms idle/200ms fade. Segments
reuse `AnimatedFilterGroup`; reduced motion disables transitions. History loads
only while opened, has its own skeleton/retry, and is removed from the browser
query cache after unmount. It displays at most the latest 20 completed services,
without exposing internal service IDs. Directory skeleton geometry matches its
four summaries, search, segments, and responsive rows before identity resolves.

Live integration verification must check authenticated reads as well as component
mocks. If a dashboard API returns HTML instead of JSON, inspect route matching
and public modal catch-alls. Do not introduce sample-data fallbacks or treat
component mocks as proof of live backend behavior.

Social Posts at `/redesign/owner-dashboard/business/social-posts` reuses the
owner-scoped social page/delivery queries and existing social actions. Keep the
legacy presentation separate. The redesigned shell and matching skeleton render
before its deferred content. Search the full library before revealing twelve
posts at a time; use the shared catalog sheet, focus return, and reduced motion.
Draft saves and deletions update optimistically, roll back failures, retain edited
text, and report results through Sonner. Creation remains pending until the action
returns; it does not invent an AI-generated draft. Publication requires explicit
confirmation and saved content. Never optimistically report publication or retry
delivery success: retain channel-owned statuses and the existing visibility-aware
polling. Block editing when a post or target is publishing/queued. Business
navigation and mobile Menu point to the redesign. Sale Events links to Social
Posts, shows remaining booking capacity, and preserves its existing backend,
optimistic mutations, editor, and cache invalidation behavior.

- The route or component preserves its public behavior and permission model.
- New states and changed branches have focused component or unit coverage.
- `npm run lint -- --max-warnings=0` and `npm run typecheck` pass.
- Route, rendering, configuration, or production-boundary changes pass
  `npm run build:app`.
- Affected user flows are exercised in a browser; responsive, keyboard,
  console, and overlay results are recorded.
- Shared-shell changes include sibling-route checks.
- Documentation changes when a durable frontend rule or design contract changes.
