import { expect, test, type Page } from "@playwright/test";
import "dotenv/config";
import { Client } from "pg";
import { hash } from "bcryptjs";

const dbConnectionString =
  process.env.E2E_DATABASE_URL ||
  process.env.DIRECT_DATABASE_URL ||
  process.env.DATABASE_URL;
const hasDatabase = Boolean(dbConnectionString);
const usesAccelerateProtocol = Boolean(
  dbConnectionString?.startsWith("prisma+postgres://"),
);
const ownerFlowEnabled = process.env.E2E_OWNER_FLOW === "1";

const unique = Date.now();
const businessId = `e2e_growth_biz_${unique}`;
const businessSlug = `e2e-growth-${unique}`;
const ownerUserId = `e2e_growth_owner_${unique}`;
const ownerEmail = process.env.E2E_OWNER_EMAIL || `e2e-owner-${unique}@example.com`;
const ownerPassword = process.env.E2E_OWNER_PASSWORD || "E2EOwner123!";
const socialConnectionId = `e2e_growth_conn_${unique}`;
const socialPostId = `e2e_growth_post_${unique}`;
const snapshotId = `e2e_growth_snapshot_${unique}`;
const opportunityId = `e2e_growth_opp_${unique}`;

let dbClient: Client | null = null;

async function loginAsOwner(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.locator('input[type="email"]').fill(ownerEmail);
  await page.locator('input[type="password"]').fill(ownerPassword);

  await Promise.all([
    page.waitForURL(new RegExp(`/app/${businessSlug}`), { timeout: 20_000 }),
    page.getByRole("button", { name: "Login to Dashboard" }).click(),
  ]);
}

test.describe("Owner growth guided flow", () => {
  test.skip(
    !ownerFlowEnabled,
    "Set E2E_OWNER_FLOW=1 to run owner growth flow E2E.",
  );
  test.skip(
    !hasDatabase,
    "DIRECT_DATABASE_URL (or E2E_DATABASE_URL) is required for owner growth flow E2E.",
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
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    await dbClient.query(
      `INSERT INTO "Business" ("id", "name", "slug", "initials", "description", "created_at", "updated_at")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [businessId, "E2E Growth Business", businessSlug, "EG", "E2E growth flow business"],
    );

    await dbClient.query(
      `INSERT INTO "User" ("id", "email", "hashed_password", "name", "role", "created_at", "updated_at")
       VALUES ($1, $2, $3, $4, 'OWNER', NOW(), NOW())`,
      [ownerUserId, ownerEmail, hashedPassword, "E2E Growth Owner"],
    );

    await dbClient.query(
      `INSERT INTO "Owner" ("user_id", "specialties", "business_id")
       VALUES ($1, $2, $3)`,
      [ownerUserId, ["GENERAL"], businessId],
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
        "https://example.com/e2e-growth.jpg",
        ownerUserId,
      ],
    );

    await dbClient.query(
      `INSERT INTO "SocialPostTarget"
         ("id", "social_post_id", "social_connection_id", "status", "attempts", "created_at", "updated_at")
       VALUES
         ($1, $2, $3, 'SKIPPED', 0, NOW(), NOW())`,
      [`e2e_growth_target_${unique}`, socialPostId, socialConnectionId],
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
    await dbClient.query(`DELETE FROM "Business" WHERE "id" = $1`, [businessId]);
    await dbClient.query(`DELETE FROM "User" WHERE "id" = $1`, [ownerUserId]);
    await dbClient.end();
    dbClient = null;
  });

  test("moves from dashboard step 1 to social-posts step 3 with clear checklist state", async ({
    page,
  }) => {
    await loginAsOwner(page);

    await expect(page.getByText("Today's Growth Opportunity")).toBeVisible();
    await page.getByRole("link", { name: "Start Step 1: Create Offer" }).click();

    await expect(page).toHaveURL(
      new RegExp(`/app/${businessSlug}/sale-events\\?flow=growth&step=1`),
    );
    await expect(page.getByText("Growth Publishing Flow")).toBeVisible();
    await expect(page.getByText("Step 1 of 3")).toBeVisible();

    await page.getByRole("link", { name: "Review post" }).first().click();
    await expect(page).toHaveURL(
      new RegExp(`/app/${businessSlug}/social-posts\\?flow=growth&step=3`),
    );
    await expect(page.getByText("Step 3 of 3")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Publish to connected channels" }),
    ).toBeVisible();
  });
});
