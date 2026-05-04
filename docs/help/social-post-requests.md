# Social Post Requests — Per-Role Guide

Anyone on your team can suggest a social media post. The owner (or a designated reviewer) approves each request, and the AI drafts a caption + image. The post goes live only after the owner publishes it.

## Quick reference

| Action | Owner | Manager (default) | Cashier (default) | Staff (default) |
| --- | --- | --- | --- | --- |
| Suggest a post | yes | yes | yes | yes |
| See my own requests | yes | yes | yes | yes |
| Edit / cancel my pending request | yes | yes | yes | yes |
| Review the team inbox | yes | yes | no | no |
| Approve & draft | yes | yes | no | no |
| Reject (with reason) | yes | yes | no | no |
| Edit the resulting draft | yes | yes | no | no |
| Publish a draft | yes | by request | no | no |

"by request" means the action can be enabled per-employee from the **Permissions** menu on the Employees page.

## How it works

1. **Suggest**: anyone with permission visits the social posts page or "My Requests" and clicks **Suggest a post**. Fill in topic, category (Service Showcase, Behind the Scenes, Tips & Education, Seasonal, Team Spotlight, General), an optional brief, and an optional desired tone.
2. **Review**: the owner (or any reviewer) sees the request in the **Post requests from your team** inbox at the top of the social posts page. Approve & draft creates a SocialPost via the AI pipeline, or Reject with a reason.
3. **Edit**: the owner can edit the AI-generated caption / image just like any other draft.
4. **Publish**: the owner publishes when ready. Both Facebook and Instagram if connected.
5. **Close the loop**: when the post reaches PUBLISHED, the original requester gets a notification with the public Meta permalink.

## Limits and safeguards

- **Rate limit**: 1 submission per user per minute, 50 per business per day. Prevents accidental spam.
- **Duplicate detection**: if the same topic + category was submitted in the last 14 days, you'll see a soft warning. Your request is still queued — the warning just helps reviewers spot redundancy.
- **Hard rules in AI generation**: every organic post (request-driven or owner-driven) is forbidden from saying "limited-time", "book now", "preferred times fill up first", or any pressure language. Tips & Education posts must lead with the tip, not a booking pitch.
- **Owner approval is always required**: a draft never publishes itself. Even after approval, the owner has to click Publish.

## What the requester sees

Visit `/social-posts/my-requests`:

- Status badge per request: Pending / Approved / Rejected / Cancelled.
- For pending: a Cancel button.
- For approved: a link to the resulting draft once it's been created.
- For rejected: the reviewer's reason inline.

## What the reviewer sees

Visit `/social-posts`:

- A new **Post requests from your team** inbox above the existing draft list.
- Three tabs: Pending / Approved / Rejected.
- Each row has the topic, category, brief preview, requester name, and (for pending) Approve & Reject buttons.
- Approve fires the AI generation and creates a draft — same draft surface that's been there all along.

## Turning it off

If you don't want the request workflow:

- Set `SOCIAL_POST_REQUESTS_ENABLED=false` in env. Owners keep the direct-create flow; staff stop seeing the dialog.

If you want it for some tenants but not others:

- Leave `SOCIAL_POST_REQUESTS_ENABLED=true` and put a CSV of slugs in `SOCIAL_POST_REQUESTS_PILOT_SLUGS`.

## Troubleshooting

- **"AI caption generation is not configured"** banner when submitting → ask your admin to set `GEMINI_KEY`. The system falls back to category-shaped templates so the post is still publishable; the warning is so you know AI isn't running.
- **"Please wait a moment before submitting another request"** → the per-user rate limit. One submission per minute.
- **"This business has reached its daily limit of 50 post requests"** → 50/day cap per business. Mostly a guard against accidental loops.
- **"This request has already been reviewed"** → race with another reviewer. Refresh and the request will show as Approved or Rejected.
- **My approved post never shows up live** → the owner still has to click Publish. The "approved" stage just creates a draft.

---

Source of truth in code: `docs/social-post-request-design.md`. If this article ever falls out of sync with the design, the design wins.
