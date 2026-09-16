# Social Post Request — Design

**Status:** Design.
**Goal:** Let any authorized non-owner role (manager, cashier, staff) submit an idea for a non-sale social media post — "we just hired a new stylist," "we're closed Memorial Day," "post a Mother's Day greeting" — and route it to the owner (or designated reviewer) for approval and publishing. The owner-side custom-post creation already works; we're filling in the request → review → publish workflow that today doesn't exist.

The user asked: *"are we already doing this?"* — the answer is **partially**. Owners can create custom posts today via `CreateOrganicPostDialog` and `createOrganicSocialPostAction`. They cannot, however, *receive* a post idea from staff. That's what this feature adds.

## 1. End-to-end flow in one paragraph

Staff member opens "Suggest a post" from anywhere in the dashboard, types a topic and a one-liner about what they want, picks a category, optionally attaches a photo from their device, and submits. The owner (or any actor with `SOCIAL_POST_REVIEW`) sees it in a new "Requests" inbox at the top of the social-posts page, can approve-and-draft (which converts the request into a `SocialPost` using the existing AI caption pipeline pre-seeded with the requester's input), edit, then publish — or reject with a one-line reason. The requester is notified at every state change.

## 2. Why a separate model instead of just creating a draft

Two reasons:

1. **Permission cleanliness.** Letting non-owner roles directly write to `SocialPost` widens the trust radius too far. A `SocialPostRequest` is a deliberately small, well-typed envelope with no AI calls, no media uploads to the Blob store from staff, no public-facing risk.
2. **Workflow signal.** Owner needs to see "5 new ideas from the team this week" as a distinct cluster, not buried among their own drafts. Separate model = separate query and clearer UI.

When the request is approved, we *create* a `SocialPost` (the existing model) and link them via FK. From that point onward the existing flow takes over.

## 3. Data model

```prisma
model SocialPostRequest {
  id           String   @id @default(cuid())
  business_id  String
  business     Business @relation(fields: [business_id], references: [id], onDelete: Cascade)

  // Submission
  requested_by_user_id String
  requested_by_user    User   @relation("SocialPostRequestedBy", fields: [requested_by_user_id], references: [id])
  topic         String
  brief         String?     // free-form "what they want it to say"
  category      OrganicPostCategory  // reuses existing enum
  desired_tone  CaptionTone?         // reuses existing enum, optional
  attachment_url String?              // optional staff-uploaded photo
  due_date      DateTime?            // optional "post by"

  // Lifecycle
  status        SocialPostRequestStatus @default(PENDING)
  reviewed_by_user_id String?
  reviewed_by_user    User?    @relation("SocialPostRequestReviewedBy", fields: [reviewed_by_user_id], references: [id])
  reviewed_at   DateTime?
  rejection_reason String?

  // Conversion link
  social_post_id String?
  social_post    SocialPost? @relation(fields: [social_post_id], references: [id])

  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  @@index([business_id, status])
  @@index([requested_by_user_id])
}

enum SocialPostRequestStatus {
  PENDING
  APPROVED      // owner accepted, SocialPost draft created
  REJECTED
  CANCELLED     // requester withdrew
}
```

`OrganicPostCategory` and `CaptionTone` already exist; we reuse them so the owner's existing dialog and the request form draw from the same vocabulary.

## 4. New server actions

All in `features/social/actions/social-post-requests.ts` (new file). Each enforces the matching permission from `docs/role-permissions-matrix.md`.

| Action                                         | Caller permission              | What it does                                                                                                            |
| ---------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `submitSocialPostRequestAction(input)`         | `SOCIAL_POST_REQUEST_CREATE`   | Validates topic, creates row in `PENDING`, emits `SOCIAL_POST_REQUEST_SUBMITTED` outbox event.                          |
| `updateSocialPostRequestAction(id, input)`     | requester (owner or self)      | Edit topic/brief/category/tone while still `PENDING`. No-op once reviewed.                                              |
| `cancelSocialPostRequestAction(id)`            | requester (owner or self)      | Sets to `CANCELLED`. Allowed only while `PENDING`.                                                                      |
| `approveSocialPostRequestAction(id)`           | `SOCIAL_POST_REVIEW`            | Calls `createOrganicSocialPostAction` internally, links the new `SocialPost`, sets request to `APPROVED`.               |
| `rejectSocialPostRequestAction(id, reason)`    | `SOCIAL_POST_REVIEW`            | Sets to `REJECTED`, stores reason, notifies requester. Reason required and non-empty.                                   |
| `listSocialPostRequestsAction(filter)`         | varies                         | Returns either own requests or all-pending, depending on caller's permissions.                                          |

Every state-changing action writes an `AuditLog` entry (`entity_type: "SocialPostRequest"`) and an outbox event for the requester's notification feed.

## 5. UI

### Submission entry points

- **Top-level dashboard nav:** new "Suggest a post" item visible to anyone with `SOCIAL_POST_REQUEST_CREATE`.
- **Owner social-posts page:** "Suggest a post" button next to "New post" (owners can both create directly and submit through the request flow if they want — useful when they want to draft now, finish later).
- **Optional in-context prompts:** a small "Suggest as social post" link on customer-facing happy moments (after saving a glowing customer review, after a milestone like 100th booking). v2.

### Request form (`<SuggestPostDialog>`)

Reuses `CaptionTone` and `OrganicPostCategory` selects from the existing dialog; otherwise minimal:

- Topic (required, single line, max 140 chars).
- Brief (optional, multi-line, max 600 chars). "What do you want it to say?"
- Category (required, dropdown).
- Desired tone (optional, dropdown — leave blank to let the owner decide).
- Attachment (optional, single image up to 8MB; uploaded to Blob via the same upload token endpoint used elsewhere).
- Post by (optional date; passes through to the draft as a soft scheduling hint).
- Submit button. On success: toast + redirect to "My requests".

### Owner / reviewer inbox

Shown on `/app/[slug]/social-posts` above the existing post list. Three tabs:

```
[ Pending (4) ]   [ Approved (12) ]   [ Rejected (1) ]
```

Each row uses the shared `<WorkflowApprovalCard>`:

- Requester avatar + name + role badge
- Topic (one line, bold) + brief preview
- Category pill, tone pill (if set), attachment thumb if any
- Actions: "Approve & draft" (primary), "Edit then approve" (opens form prefilled), "Reject" (opens reason textbox).

Approving runs `approveSocialPostRequestAction`, which creates a `SocialPost` and shows a toast "Draft created — review it now" with a link straight into the existing draft editor.

### Requester "My requests" page

`/app/[slug]/social-posts/my-requests` — visible to anyone with `SOCIAL_POST_REQUEST_CREATE`. Lists their own requests with status pill, the published post link if approved, the rejection reason if rejected. Allows edit and cancel while `PENDING`.

### Removing the OWNER hard gate

`app/(private)/app/[businessSlug]/social-posts/page.tsx` line 27 — replace the strict `OWNER`-only fork with permission-aware rendering:

```ts
const viewer = useViewer();
const social = deriveSocialViewerContext(viewer);
// route to:
//   social.canReviewRequests || social.canPublish ? <ReviewerView /> :
//   social.canSubmitRequest ? <RequesterView /> :
//   <UpsellOrEmptyState />
```

Owners with full permissions see the unified view (inbox + draft list + connections). Reviewers without publish rights see the inbox + read-only draft list. Requesters see only "My requests" + "Suggest a post". Everyone else sees an empty state explaining the feature.

## 6. Notifications

Outbox event types (new):

- `SOCIAL_POST_REQUEST_SUBMITTED` → in-app notification for owner / reviewers; optional email digest.
- `SOCIAL_POST_REQUEST_APPROVED` → notify requester with link to the draft (or final post if already published).
- `SOCIAL_POST_REQUEST_REJECTED` → notify requester with reason.
- `SOCIAL_POST_REQUEST_PUBLISHED` (fires when the linked `SocialPost` reaches `PUBLISHED`) → close-the-loop notification: "Your idea is now live." Includes the public Meta permalink.

Notifications use the existing transactional outbox + delivery pipeline. We **do not** message customers about any of this — it's all internal.

## 7. AI handoff (preserve existing behavior)

When a request is approved, `approveSocialPostRequestAction` calls `createOrganicSocialPostAction` with the request fields mapped one-to-one:

| Request field         | createOrganicSocialPostAction input |
| --------------------- | ----------------------------------- |
| `topic`               | `topic`                             |
| `brief`               | `ownerCaptionDirection`             |
| `category`            | `category`                          |
| `desired_tone`        | `captionTone` (or AUTO if null)     |
| `attachment_url`      | `mediaUrl` (passed through, generation skipped if present) |

We pass `generateImageNow: false` if the requester attached an image, otherwise `true`. The owner can still regenerate either after the draft exists.

## 8. Edge cases and rules

- **Duplicate ideas:** when a new request's topic + category exactly matches an existing `PENDING` one for the same business in the last 14 days, the form shows "Looks like {Maria} already requested this — want to add a comment instead?" (Comment-on-request is v2; v1 just warns and lets them submit anyway.)
- **Attachment safety:** images go through the same upload token path as other user uploads. We do not let staff embed external URLs.
- **Cancel-after-approve:** once `APPROVED`, requesters cannot cancel the request — the `SocialPost` is the artifact now and follows its own lifecycle.
- **Reject reason:** required, max 500 chars, plain text, never sent to customers.
- **Rate limit:** one submission per user per minute, 50 per business per day. Hard-cap to keep AI costs and inbox noise sane. Returns 429 from the action.

## 9. Backwards compatibility

- `CreateOrganicPostDialog` remains exactly as is. Owners who like the direct flow keep it.
- `createOrganicSocialPostAction` is unchanged — we only call it from a new caller.
- Existing `SocialPost` and `SocialPostTarget` rows are untouched. The link from `SocialPostRequest.social_post_id` is one-way and nullable.
- The `SOCIAL_PUBLISHING_ENABLED` and pilot-slug feature flags continue to gate the entire surface. The request feature ships behind the same flag.

## 10. Out of scope for v1

- Comment threads on requests (multi-turn discussion before approval).
- Suggested posts surfaced by the system (e.g. "you haven't posted in 14 days, here are 3 ideas").
- Automated approval ("trusted requesters" auto-approve).
- Cross-business idea library.
- Direct DM / @-mention notifications via Meta.

These are deliberately deferred. v1 is "staff can ask, owner approves, the existing pipeline takes it from there."
