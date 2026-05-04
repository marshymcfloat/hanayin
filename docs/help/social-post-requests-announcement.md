# In-app announcement: Social post requests go live

When `SOCIAL_POST_REQUESTS_ENABLED` flips on for a tenant, surface this on the next sign-in. Two-tier copy: a one-liner for everyone, an expanded modal for the owner, a soft toast for staff.

## Banner (all roles)

> **New: your team can suggest social posts.** Staff describe what they want to post; you approve and the AI drafts it. [Learn more →](/help/social-post-requests)

## Owner welcome modal

```text
Title:    Post requests is live for {businessName}
Subtitle: Let your team suggest content — keep approval in your hands

Body:
  Your team can now suggest social posts directly. Staff fill out a
  short form (topic, category, optional brief), and you see the
  request in a new inbox at the top of your social posts page.

  Approve & draft creates a draft via the AI pipeline. You still edit
  and publish exactly the way you do today — nothing publishes on its
  own. If a request is off-base, reject with a reason and the staff
  member is notified.

  Defaults set by us:
    • Anyone with login access can suggest a post.
    • Managers can review (approve / reject) by default.
    • Cashiers and staff cannot review.
    • Publishing stays owner-only by default. You can grant per-employee
      from the Permissions menu on the Employees page if you want to
      delegate.

  Built-in guardrails:
    • One request per user per minute, 50 per business per day.
    • Same topic + category in the last 14 days surfaces a duplicate
      warning to keep your inbox tidy.
    • Every AI-generated organic caption (request or direct-create) is
      forbidden from saying "limited-time" or "book now" — educational
      and seasonal posts stay on-topic.

Actions:
  • Primary: "See what's new" → /help/social-post-requests
  • Secondary: "View team inbox" → /app/{businessSlug}/social-posts
  • Dismiss
```

## Reviewer / Manager toast (first session post-launch)

```text
You can now review post requests from your team.
Open /app/{businessSlug}/social-posts and look for the inbox at the top.
→ "Got it"
```

## Staff toast (first session post-launch)

```text
Got an idea for a post? You can now suggest one — your owner reviews
and publishes. Visit /app/{businessSlug}/social-posts/my-requests.
→ "Got it"
```

## Implementation notes

- Track first-show in localStorage with `socialPostRequests.welcome.dismissed`.
- The owner welcome modal links to the team inbox (root social-posts page) — that's where the new affordance lives.
- After dismiss, no re-show. The help-center article remains the durable artifact.
- Don't show any of these announcements when `SOCIAL_POST_REQUESTS_ENABLED` is off — it's confusing to advertise a feature that's disabled.
