/**
 * Social-post-request workflow walkthrough (Wave F1).
 *
 * Covers the cross-role flow defined in
 * docs/social-post-request-design.md:
 *
 *   1. Staff signs in, submits a request via SuggestPostDialog.
 *   2. Owner / reviewer signs in, sees the request in RequestsInbox,
 *      approves it. The action creates a SocialPost draft.
 *   3. Owner publishes the draft. The SocialPost reaches PUBLISHED.
 *   4. Staff receives the SOCIAL_POST_REQUEST_PUBLISHED close-the-loop
 *      notification with the public Meta permalink.
 *
 * STATUS: skeleton-only. Mirrors test/e2e/booking-editor.spec.ts —
 * the team's per-role login helper plugs into signIn() and the body
 * stubs become real assertions. Tests skip unless SOCIAL_POST_REQUEST_E2E
 * is set so CI without credentials stays green.
 */

import { expect, test } from "@playwright/test";

const ENABLE = process.env.SOCIAL_POST_REQUEST_E2E === "true";

const ENV = {
  ownerEmail: process.env.SOCIAL_POST_REQUEST_E2E_OWNER_EMAIL,
  managerEmail: process.env.SOCIAL_POST_REQUEST_E2E_MANAGER_EMAIL,
  staffEmail: process.env.SOCIAL_POST_REQUEST_E2E_STAFF_EMAIL,
  password: process.env.SOCIAL_POST_REQUEST_E2E_PASSWORD,
  businessSlug: process.env.SOCIAL_POST_REQUEST_E2E_BUSINESS_SLUG,
};

test.describe("Social post requests — workflow walkthrough", () => {
  test.skip(
    !ENABLE,
    "Social-post-request E2E disabled. Set SOCIAL_POST_REQUEST_E2E=true and the per-role credentials in .env to run.",
  );

  test("STAFF can submit a request and see it in My Requests", async ({
    page,
  }) => {
    test.skip(!ENV.staffEmail || !ENV.password || !ENV.businessSlug);
    await signIn(page, ENV.staffEmail!, ENV.password!);
    // 1. Visit /app/{slug}/social-posts → see "Suggest a post" card.
    // 2. Click → fill topic "E2E test request" + category TIPS_EDUCATION.
    // 3. Submit → expect "Request submitted" toast.
    // 4. Visit /my-requests → row exists with PENDING badge + Cancel button.
  });

  test("MANAGER (reviewer) sees the request in the inbox and can approve", async ({
    page,
  }) => {
    test.skip(!ENV.managerEmail || !ENV.password || !ENV.businessSlug);
    await signIn(page, ENV.managerEmail!, ENV.password!);
    // 1. Visit /app/{slug}/social-posts → RequestsInbox visible at the top.
    // 2. Pending tab → click "Approve & draft" on the test request.
    // 3. Expect "Request approved — draft created" toast.
    // 4. Page navigates back to /social-posts; new draft appears in
    //    SocialPostsPageClient list.
  });

  test("OWNER can reject a request with a reason", async ({ page }) => {
    test.skip(!ENV.ownerEmail || !ENV.password || !ENV.businessSlug);
    await signIn(page, ENV.ownerEmail!, ENV.password!);
    // 1. Inbox → click Reject on a different test request.
    // 2. Inline reason textarea → type "off-topic for the brand".
    // 3. Confirm → expect "Request rejected" toast.
    // 4. Tab → Rejected → row visible with reason.
  });

  test("STAFF receives close-the-loop notification when approved post is published", async ({
    page,
    request,
  }) => {
    test.skip(!ENV.staffEmail || !ENV.password || !ENV.businessSlug);
    // The publish itself runs server-side; this test verifies the
    // staff-facing notification appears once the SocialPost crosses
    // into PUBLISHED. In CI we'd seed a publish via API, then sign in
    // as staff and look for the notification. Body stubbed here.
    await signIn(page, ENV.staffEmail!, ENV.password!);
    // 1. Trigger publish via test-only API endpoint or seed.
    // 2. Visit /notifications → expect "Your post is live" entry.
    // 3. Permalink in payload should resolve to a non-empty URL.
    void request; // placeholder until the seed helper exists
  });

  test("submission rate limit fires after rapid submits", async ({ page }) => {
    test.skip(!ENV.staffEmail || !ENV.password || !ENV.businessSlug);
    await signIn(page, ENV.staffEmail!, ENV.password!);
    // 1. Submit a request via SuggestPostDialog.
    // 2. Immediately attempt a second submission.
    // 3. Expect "Please wait a moment before submitting another request."
    //    toast (RATE_LIMITED_USER).
  });
});

async function signIn(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/app\//, { timeout: 15000 });
}
