import { expect, test } from "./isolated-test";
import { requireTestDatabase } from "../../scripts/test-database-target.mjs";
import { Client } from "pg";
import { createSharedWorkflowFactory } from "../factories/shared-workflows";

const dbConnectionString = requireTestDatabase();
const hasDatabase = Boolean(dbConnectionString);
const usesAccelerateProtocol = Boolean(
  dbConnectionString?.startsWith("prisma+postgres://"),
);
const seed = createSharedWorkflowFactory({
  namespace: "e2e-public-booking",
}).sharedWorkflowSeed();
const { id: businessId, slug: businessSlug, name: businessName } = seed.business;
let dbClient: Client | null = null;

test.describe("Public booking smoke", () => {
  test.setTimeout(90_000);
  test.skip(
    !hasDatabase,
    "Explicit disposable TEST_DATABASE_URL is required for booking smoke E2E.",
  );

  test.beforeAll(async () => {
    if (usesAccelerateProtocol) {
      throw new Error(
        "DB smoke E2E requires direct Postgres URL (postgresql://...), not prisma+postgres://.",
      );
    }

    try {
      dbClient = new Client({
        connectionString: dbConnectionString,
        connectionTimeoutMillis: 4000,
      });
      await dbClient.connect();
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Unknown DB connection error";
      if (dbClient) {
        await dbClient.end().catch(() => undefined);
        dbClient = null;
      }
      throw new Error(
        `Database is not reachable for booking smoke E2E: ${reason}`,
      );
    }

    await dbClient.query(`DELETE FROM "Business" WHERE "id" = $1`, [
      businessId,
    ]);
    await dbClient.query(
      `INSERT INTO "Business" ("id", "name", "slug", "initials", "description", "created_at", "updated_at")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [
        businessId,
        businessName,
        businessSlug,
        seed.business.initials,
        seed.business.description,
      ],
    );

    await dbClient.query(
      `INSERT INTO "Service" ("name", "category", "price", "duration", "business_id", "created_at", "updated_at")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [
        seed.service.name,
        seed.service.category,
        seed.service.price,
        seed.service.duration,
        businessId,
      ],
    );
  });

  test.afterAll(async () => {
    if (!dbClient) return;
    const client = dbClient;
    try { await client.query(`DELETE FROM "Business" WHERE "id" = $1`, [businessId]); }
    finally { try { await client.end(); } finally { dbClient = null; } }
  });

  test("opens business page and reaches booking screen", async ({ page }) => {
    await page.goto(`/${businessSlug}`, { waitUntil: "networkidle" });

    const pathname = new URL(page.url()).pathname;
    const onBookingPage =
      pathname.endsWith(`/${businessSlug}/booking/`) ||
      pathname.endsWith(`/${businessSlug}/booking`);

    if (!onBookingPage) {
      // No server-side redirect → land on a public facing page. Navigate
      // directly to /booking rather than relying on a "Book now" CTA,
      // which has different shapes across the BeautyFeel layout, the
      // generic fallback page, and city/industry landing pages.
      await page.goto(`/${businessSlug}/booking`, {
        waitUntil: "networkidle",
      });
    }

    const bookingStepHeading = page.getByRole("heading", {
      name: "Verify Your Number",
    });
    const modalBadge = page.getByText("Secure booking").first();
    const fullPageBusinessHeading = page.getByRole("heading", {
      name: businessName,
    });

    await Promise.race([
      bookingStepHeading.waitFor({ state: "visible", timeout: 10_000 }),
      modalBadge.waitFor({ state: "visible", timeout: 10_000 }),
      fullPageBusinessHeading.waitFor({ state: "visible", timeout: 10_000 }),
    ]);

    const modalFlowVisible = await modalBadge.isVisible().catch(() => false);

    if (modalFlowVisible) {
      await expect(page.getByText(`Book with ${businessName}`)).toBeVisible();
      await expect(
        page.getByText("Choose services, pick a time, and confirm your slot."),
      ).toBeVisible();
    } else {
      await expect(fullPageBusinessHeading).toBeVisible();
    }

    // Public bookings now start with phone verification. Service selection is
    // intentionally hidden until that step succeeds.
    await expect(bookingStepHeading).toBeVisible();
    await expect(
      page.getByText("Booking Summary", { exact: true }),
    ).toBeVisible();
  });
});
