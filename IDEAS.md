# ServiceFlow Ideas

Status: unapproved idea backlog

Last updated: 2026-09-26

## How to Use This File

This file captures possibilities, not commitments. An idea must be researched,
validated, prioritized, and moved into a scoped design or implementation plan
before development begins. Architectural changes also require an Architecture
Decision Record.

Ideas do not authorize implementation. Promotion to planned work requires the
task contract in `docs/harness-engineering.md`, an owner, acceptance criteria,
explicit exclusions, verification requirements, and links to affected
architecture or product-design documents. Active delivery status belongs in
Linear; this file keeps the durable opportunity and validation record.

Use these statuses:

- **Idea** — captured but not evaluated.
- **Exploring** — discovery or a bounded experiment is active.
- **Validated** — evidence supports investment, but delivery is not scheduled.
- **Planned** — approved and represented by a separate implementation plan.
- **Parked** — intentionally deferred.
- **Rejected** — evaluated and declined, with the reason recorded.

## Idea Index

| ID | Idea | Status | Current foundation |
| --- | --- | --- | --- |
| IDEA-001 | Owner dashboard and product-wide redesign | Exploring | Private owner dashboard preview |
| IDEA-002 | Distinctive product rename and rebrand | Idea | Existing ServiceFlow identity and design profiles |
| IDEA-003 | Premium, reliable social-image generation | Exploring | Multi-provider generator, image profiles, overlays, and reference assets |
| IDEA-004 | Meta customer-conversation assistant | Idea | Meta connection, publishing, and OAuth flow |
| IDEA-005 | Quality, security, and performance program | Idea | CI, Vitest, Playwright, Sentry, and production checklists |
| IDEA-006 | Reliability and background-work infrastructure | Parked | PostgreSQL outbox, external cron, optional Upstash rate limiting, and Sentry |

## IDEA-001 — Owner Dashboard and Product-Wide Redesign

**Status:** Exploring

### Opportunity

Use the existing owner dashboard preview to find a stronger visual and
interaction direction. If the direction proves effective, evolve it into a
coherent redesign of the tenant workspace and eventually the wider product.

The current experiment lives under `app/(private-preview)/owner-dashboard-preview/`
and `components/dashboard/owner-preview/`. It covers the owner dashboard and
several owner feature surfaces. These paths are experimental and excluded from
normal production tracking by current repository rules.

### Hypothesis

A clearer information hierarchy, more consistent workflows, and a distinctive
visual system will help owners understand business performance and complete
common tasks faster without reducing accessibility or mobile usability.

### First Experiments

- Inventory the five most frequent owner tasks and define task-based success
  measures before comparing designs.
- Compare the current dashboard and preview with representative owners using
  the same realistic data and device sizes.
- Extract successful patterns into shared tokens and primitives instead of
  copying preview components into production pages.
- Pilot one bounded workflow before redesigning every feature surface.

### Success Signals

- Users find key business status and next actions without assistance.
- Frequent tasks take fewer steps and produce fewer errors.
- Mobile, tablet, keyboard, contrast, and reduced-motion checks pass.
- Shared patterns reduce page-specific styling and duplicate components.
- The redesign remains fast with production-scale data.

### Risks and Open Questions

- What owner tasks matter most by business type and staff structure?
- Is the preview a disposable prototype or the base of the production system?
- Which current workflows must remain familiar during rollout?
- How will the new direction extend to employee, cashier, manager, platform,
  public booking, and marketing surfaces?
- Running two UI systems for too long may create drift and maintenance cost.

## IDEA-002 — Distinctive Product Rename and Rebrand

**Status:** Idea

### Opportunity

Find a more distinctive product name because “ServiceFlow” is common and may be
difficult to own across search, domains, social accounts, and marketplaces. A
rename could also establish a stronger identity for the broader redesign.

### Validation Work

- Define naming criteria: memorable, pronounceable, relevant without being
  generic, suitable for Philippine service businesses, and capable of expanding
  beyond one beauty or wellness category.
- Generate and shortlist name territories rather than isolated names.
- Check search competition, domains, social handles, app marketplaces, company
  registries, and relevant trademarks before selecting a candidate.
- Test comprehension, pronunciation, recall, and unintended meanings with
  target users.
- Develop a minimal identity and interface mockup for finalists before deciding.

### Success Signals

- The name is legally and operationally usable in intended markets.
- Search results and handles have materially less naming competition.
- Target users can pronounce, remember, and correctly associate the name.
- The identity works in product UI, public booking, social posts, and sales.

### Risks and Open Questions

- What geographic markets and service categories must the name support?
- Should the name describe the product or behave as a distinctive standalone
  brand?
- A rename affects domains, authentication URLs, email, metadata, social OAuth,
  customer communication, analytics, and existing recognition.
- Availability checks are discovery only; trademark counsel should review the
  final candidate before launch.

Do not rename code, URLs, assets, or customer-facing copy until a candidate and
migration plan are approved.

## IDEA-003 — Premium, Reliable Social-Image Generation

**Status:** Exploring

### Opportunity

Make generated social posts consistently polished, useful, and appropriate to
the business instead of depending on a single prompt succeeding. Build a
curated, licensed reference library by service category so generation has a
reliable visual direction.

The current system already supports OpenAI and Gemini generation, an SVG
fallback, multiple image profiles, composed text overlays, brand assets, and
reference-image input. The next step should strengthen selection, evaluation,
and repeatability rather than replace these foundations without evidence.

### Proposed Direction

- Define category-specific art direction for major service categories, each
  with a primary composition and a fallback composition.
- Curate only owned, licensed, or explicitly reusable reference images. Store
  provenance, allowed usage, category, subject type, visual traits, and review
  status with every asset.
- Separate reference purposes: identity preservation, service subject,
  composition, palette, texture, and lighting should not be interchangeable.
- Match references using category, campaign intent, image profile, format, and
  available overlay-safe space.
- Keep text overlays deterministic and legible; do not rely on image models to
  render important copy, logos, discounts, or dates.
- Preserve provider fallback and return actionable failure states instead of
  silently accepting visibly poor output.
- Create a human review loop and retain quality feedback for future evaluation.

### Quality Evaluation

Build a fixed evaluation set covering categories, skin tones, business styles,
campaign types, portrait and feed crops, and posts with and without owner
references. Score every output from 1–5 for:

1. Visual hierarchy.
2. Overlay readability and safe-zone quality.
3. Non-generic appearance.
4. Business and campaign fit.
5. Conversion focus.
6. Anatomical and service accuracy.
7. Brand consistency.

Any critical defect or score below 4 should trigger regeneration, fallback, or
human review. Track provider, model, profile, reference, latency, cost, and
review outcome without storing unnecessary personal data.

### Success Signals

- A high percentage of first outputs are approved without manual repair.
- Regeneration and fallback rates decline without reducing visual variety.
- Overlay text remains readable across target crops and devices.
- Quality remains consistent across categories and representative people.
- Latency and cost remain within an explicitly approved budget.

### Risks and Open Questions

- Should the curated library be platform-wide, tenant-owned, or both?
- Who approves references and handles licensing or deletion requests?
- How many references per category are required before they improve quality?
- How should near-duplicate outputs and repeated people or compositions be
  detected?
- References containing identifiable people require consent, retention, access,
  and misuse controls.
- Model or provider updates can change output quality without code changes.

## IDEA-004 — Meta Customer-Conversation Assistant

**Status:** Idea

### Opportunity

Allow an owner who connects a supported Meta business presence to optionally
enable an assistant that answers customer messages. It could provide business
information, explain services, and retrieve booking availability.

This is separate from the existing Meta publishing capability. Messaging
permissions, webhooks, app review, privacy controls, and operational expectations
must be validated before implementation.

### Safe Product Boundary

- Start with read-only answers for approved business information and booking
  availability.
- Do not create, change, or cancel bookings in the first release.
- Clearly identify automated responses and provide human handoff, pause, and
  owner takeover controls.
- Use structured tools for availability and business facts. Do not let the model
  invent database queries, policies, prices, schedules, or tenant identity.
- Scope every connection, message, tool call, and response to the verified
  business.
- Require explicit owner opt-in and configurable hours, topics, tone, and
  escalation rules.

### Discovery and Prototype

- Confirm supported Meta channels, permissions, webhook events, rate limits,
  app-review requirements, and data-retention obligations using current official
  documentation.
- Define the conversation lifecycle, duplicate-event handling, retry behavior,
  ordering, human handoff, and provider outage behavior.
- Prototype on a non-production page with synthetic business and customer data.
- Test adversarial prompts, cross-tenant requests, stale availability, ambiguous
  questions, unsafe content, and attempts to expose private information.

### Success Signals

- Answers are grounded in current tenant data and cite the relevant business
  facts internally for auditability.
- No cross-tenant or unauthorized data is returned.
- Human escalation is reliable and visible to both the owner and customer.
- Duplicate webhook delivery does not create duplicate responses.
- Response accuracy, latency, containment, opt-out, and owner satisfaction meet
  approved targets.

### Risks and Open Questions

- Which Meta surfaces should be supported first: Messenger, Instagram, or both?
- Which questions may the assistant answer, and which require a person?
- How long should message content and derived conversation data be retained?
- What happens when availability changes between the answer and booking?
- Meta policy or permission changes can disable the feature independently of
  ServiceFlow releases.

## IDEA-005 — Quality, Security, and Performance Program

**Status:** Idea

### Opportunity

Create a continuous verification program so correctness, security, and speed are
measured rather than addressed only before release. “Test everything” should be
translated into risk-based coverage and explicit service targets.

### Proposed Workstreams

- Build a feature and risk inventory covering public booking, authentication,
  tenant isolation, permissions, payments, payroll, social publishing, cron,
  outbox delivery, uploads, and platform administration.
- Establish unit, integration, contract, E2E, accessibility, security, and load
  test responsibilities without duplicating the same assertion at every layer.
- Threat-model authentication, tenant isolation, object access, uploads,
  webhooks, cron authentication, secrets, AI inputs, and external callbacks.
- Define performance budgets for page rendering, database queries, API latency,
  background batches, bundle size, image generation, and third-party calls.
- Add production monitoring for errors, latency, job failures, outbox backlog,
  provider health, and critical business-flow completion.
- Regularly test backup restoration, migration rollback strategy, incident
  response, dependency updates, and secret rotation.

### Success Signals

- Critical user journeys have automated coverage and named owners.
- Tenant-isolation and permission tests cover every protected domain.
- CI remains deterministic and fast enough to run on every change.
- Performance regressions fail against agreed budgets before release.
- Production alerts are actionable and connected to documented runbooks.
- Security findings have severity, ownership, and remediation deadlines.

### Risks and Open Questions

- Which business journeys are critical enough to block releases?
- What latency, availability, and recovery targets are realistic at the current
  product stage?
- Which tests require production-like infrastructure, and how will test data be
  isolated and removed?
- Excessive E2E coverage can be slow and brittle; layer selection must follow
  risk rather than test count.

## IDEA-006 — Reliability and Background-Work Infrastructure

**Status:** Parked

### Opportunity

Improve reliability and response time as production load grows. ServiceFlow
already has PostgreSQL transactions, an outbox processed by external cron,
optional Upstash Redis rate limiting, Next.js caching, and Sentry. Measure
their behavior before committing to another service.

### Future Evaluation Order

1. Establish production baselines for p95 route latency, slow queries,
   database connections, cron last-success time, outbox age, and terminal
   delivery failures. Verify database backups and practice a restore.
2. Review outbox claims for overlapping delivery, recoverable leases, provider
   idempotency, and alerts. Confirm the external scheduler invokes every
   required job; `vercel.json` currently defines no Vercel cron schedules.
3. If traffic spans multiple instances, strengthen the existing Redis-backed
   rate limiter with bounded timeouts and explicit failure policy. Add caching
   only for measured hot reads with clear invalidation rules.
4. If slow AI generation or growing job backlogs warrant asynchronous work,
   compare Vercel Queues for Vercel deployment, BullMQ plus a dedicated worker
   for persistent Node deployment, and a PostgreSQL-backed queue. Keep the
   transactional outbox and idempotent consumers regardless of queue choice.
5. Consider Supabase as a PostgreSQL host only if the current provider falls
   short on backups, recovery, pooling, or operations. Evaluate Prisma
   connection modes, migration process, tenant isolation, and Data API/RLS
   exposure before moving data. RabbitMQ is a later option if independently
   deployed services need broker routing and acknowledgements.

### Promotion Trigger

Revisit when production metrics show a specific latency, delivery, recovery,
or scaling problem. Record the baseline, target, deployment model, operating
cost, rollback plan, and a scoped architecture decision before scheduling work.

## Promotion Checklist

Before changing an idea to **Planned**:

- [ ] Name the owner and target users.
- [ ] State the problem and measurable outcome.
- [ ] Record discovery evidence or experiment results.
- [ ] Define scope, exclusions, risks, dependencies, and operating cost.
- [ ] Complete privacy, security, accessibility, and legal review where relevant.
- [ ] Create a decision record for architectural or provider commitments.
- [ ] Create a separate design and implementation plan with acceptance criteria.
- [ ] Define required unit, database, browser, build, and operational evidence.
- [ ] Record explicit exclusions and the rollback or disablement strategy.
