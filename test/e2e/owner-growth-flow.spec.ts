import type { Page } from "@playwright/test";
import { expect, test } from "./isolated-test";
import { requireTestDatabase } from "../../scripts/test-database-target.mjs";
import { Client } from "pg";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { createOwnerGrowthWorkflowFixture } from "@/test/factories/owner-growth-workflow";

const dbConnectionString = process.env.E2E_OWNER_FLOW === "1" ? requireTestDatabase() : undefined;
const hasDatabase = Boolean(dbConnectionString);
const usesAccelerateProtocol = Boolean(
  dbConnectionString?.startsWith("prisma+postgres://"),
);
const ownerFlowEnabled = process.env.E2E_OWNER_FLOW === "1";

const unique = randomUUID();
const fixture = createOwnerGrowthWorkflowFixture({ namespace: `e2e-growth-${unique}`, now: new Date() });
const businessId = fixture.business.id;
const businessSlug = fixture.business.slug;
const ownerUserId = fixture.owner.id;
const ownerPassword = fixture.password;
const { socialConnectionId, socialPostId, snapshotId, opportunityId } = fixture;
const planId = `${fixture.business.id}-pro-plan`;

let dbClient: Client | null = null;

async function loginAsOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Contact number", { exact: true }).fill(fixture.owner.contactNumber);
  await page.getByLabel("Password", { exact: true }).fill(ownerPassword);

  await Promise.all([
    page.waitForURL(new RegExp(`/app/${businessSlug}`), { timeout: 20_000 }),
    page.getByRole("button", { name: "Sign in to dashboard", exact: true }).click(),
  ]);
}

test.describe("Owner growth guided flow", () => {
  test.setTimeout(90_000);
  test.skip(
    !ownerFlowEnabled,
    "Set E2E_OWNER_FLOW=1 to run owner growth flow E2E.",
  );
  test.skip(
    !hasDatabase,
    "Explicit disposable TEST_DATABASE_URL is required for owner growth flow E2E.",
  );
  test.skip(
    usesAccelerateProtocol,
    "Owner growth flow E2E requires direct Postgres URL (postgresql://...), not prisma+postgres://.",
  );

  test.beforeAll(async () => {
    dbClient = new Client({
      connectionString: dbConnectionString,
      connectionTimeoutMillis: 4000,
    });
    await dbClient.connect();

    const hashedPassword = await hash(ownerPassword, 10);
    const now = fixture.now.toISOString();
    const oneHourLater = fixture.oneHourLater.toISOString();
    const sixHoursLater = fixture.sixHoursLater.toISOString();
    const tomorrow = fixture.tomorrow.toISOString();

    await dbClient.query(
      `INSERT INTO "Business" ("id", "name", "slug", "initials", "description", "created_at", "updated_at")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [businessId, fixture.business.name, businessSlug, fixture.business.initials, fixture.business.description],
    );

    await dbClient.query(
      `INSERT INTO "User" ("id", "contact_number", "hashed_password", "name", "role", "created_at", "updated_at")
       VALUES ($1, $2, $3, $4, 'OWNER', NOW(), NOW())`,
      [ownerUserId, fixture.owner.contactNumber, hashedPassword, fixture.owner.name],
    );

    await dbClient.query(
      `INSERT INTO "Owner" ("user_id", "specialties", "business_id")
       VALUES ($1, $2, $3)`,
      [ownerUserId, ["GENERAL"], businessId],
    );

    // Reuse an existing catalog plan without modifying it; delete only our own ID.
    await dbClient.query(
      `INSERT INTO "SubscriptionPlan" ("id", "code", "name", "billing_interval", "price_amount", "updated_at")
       VALUES ($1, 'PRO_MONTHLY', 'E2E Pro', 'MONTHLY', 2000, NOW())
       ON CONFLICT ("code") DO NOTHING`, [planId],
    );
    await dbClient.query(
      `INSERT INTO "BusinessSubscription" ("id", "business_id", "plan_id", "status", "current_period_start", "current_period_end", "updated_at")
       SELECT $1, $2, "id", 'ACTIVE', $3, $4, NOW() FROM "SubscriptionPlan" WHERE "code" = 'PRO_MONTHLY'`,
      [`${businessId}-subscription`, businessId, now, tomorrow],
    );

    const saleEventInsert = await dbClient.query<{ id: number }>(
      `INSERT INTO "SaleEvent"
         ("title", "description", "start_date", "end_date", "discount_type", "discount_value", "business_id", "created_at", "updated_at")
       VALUES ($1, $2, $3, $4, 'PERCENTAGE', $5, $6, NOW(), NOW())
       RETURNING "id"`,
      [
        "E2E Growth Sale Event",
        "Sale event generated for owner flow E2E",
        now,
        tomorrow,
        10,
        businessId,
      ],
    );
    const saleEventId = saleEventInsert.rows[0].id;

    await dbClient.query(
      `INSERT INTO "SocialConnection"
         ("id", "business_id", "platform", "external_account_id", "display_name", "username", "access_token_encrypted", "scopes", "status", "created_at", "updated_at")
       VALUES
         ($1, $2, 'FACEBOOK_PAGE', $3, $4, $5, $6, $7, 'CONNECTED', NOW(), NOW())`,
      [
        socialConnectionId,
        businessId,
        `fb-${unique}`,
        "E2E FB Page",
        "e2e_fb_page",
        "encrypted-token",
        ["pages_manage_posts"],
      ],
    );

    await dbClient.query(
      `INSERT INTO "SocialPost"
         ("id", "business_id", "sale_event_id", "source", "status", "title", "caption_draft", "caption_final", "hashtags", "media_url", "created_by_user_id", "created_at", "updated_at")
       VALUES
         ($1, $2, $3, 'SALE_EVENT', 'READY', $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
      [
        socialPostId,
        businessId,
        saleEventId,
        "E2E Ready Social Post",
        "E2E caption draft",
        "E2E caption final",
        ["#e2e", "#growth"],
        "/sf-favicon.png",
        ownerUserId,
      ],
    );

    await dbClient.query(
      `INSERT INTO "SocialPostTarget"
         ("id", "social_post_id", "social_connection_id", "status", "attempts", "created_at", "updated_at")
       VALUES
         ($1, $2, $3, 'SKIPPED', 0, NOW(), NOW())`,
      [fixture.socialTargetId, socialPostId, socialConnectionId],
    );

    await dbClient.query(
      `INSERT INTO "GrowthContextSnapshot"
         ("id", "business_id", "snapshot_date", "window_start", "window_end", "context_json", "capacity_summary_json", "demand_summary_json", "weather_summary_json", "created_at")
       VALUES
         ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, NOW())`,
      [
        snapshotId,
        businessId,
        now,
        now,
        tomorrow,
        JSON.stringify({ businessSlug, businessName: "E2E Growth Business" }),
        JSON.stringify({ openSlots: 8, estimatedCapacitySlots: 16 }),
        JSON.stringify({ demand: "normal" }),
        JSON.stringify({ weather: "clear" }),
      ],
    );

    await dbClient.query(
      `INSERT INTO "Opportunity"
         ("id", "business_id", "snapshot_id", "type", "status", "reason", "time_window_start", "time_window_end", "urgency_score", "impact_score", "confidence_score", "feasibility_score", "total_score", "recommended_offer_types", "metadata", "created_at", "updated_at")
       VALUES
         ($1, $2, $3, 'SLOW_HOURS', 'OPEN', $4, $5, $6, 0.8, 0.7, 0.9, 0.8, 0.85, ARRAY['FLASH_DEAL']::"OfferType"[], $7::jsonb, NOW(), NOW())`,
      [
        opportunityId,
        businessId,
        snapshotId,
        "E2E opportunity for guided growth flow",
        oneHourLater,
        sixHoursLater,
        JSON.stringify({ risk: "LOW", openSlots: 8, estimatedCapacitySlots: 16 }),
      ],
    );
  });

  test.afterAll(async () => {
    if (!dbClient) return;
    const client = dbClient;
    let failures = 0;
    try {
      for (const [table, id] of [["Business", businessId], ["User", ownerUserId], ["SubscriptionPlan", planId]] as const) {
        try { await client.query(`DELETE FROM "${table}" WHERE "id" = $1`, [id]); }
        catch { failures++; }
      }
    } finally {
      try { await client.end(); } finally { dbClient = null; }
    }
    if (failures) throw new Error(`Fixture cleanup failed in ${failures} steps`);
  });

  test("moves from dashboard step 1 to social-posts step 3 with clear checklist state", async ({
    page,
  }) => {
    await loginAsOwner(page);

    const createOffer = page.getByRole("link", { name: "Create Offer" });
    await expect(createOffer).toBeVisible();
    await createOffer.click();

    await expect(page).toHaveURL(
      new RegExp(`/app/${businessSlug}/sale-events\\?flow=growth&step=1`),
    );
    await expect(page.getByText("Growth Publishing Flow")).toBeVisible();
    await expect(page.getByText("Step 1 of 3")).toBeVisible();

    await page.getByRole("link", { name: "Review post" }).first().click();
    await expect(page).toHaveURL(
      new RegExp(`/app/${businessSlug}/social-posts\\?flow=growth&step=3`),
      { timeout: 30_000 },
    );
    await expect(page.getByText("Step 3 of 3")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Publish to connected channels" }),
    ).toBeVisible();
  });
});
