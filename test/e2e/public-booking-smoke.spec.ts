import { expect, test } from "@playwright/test";
import "dotenv/config";
import { Client } from "pg";

const dbConnectionString =
  process.env.E2E_DATABASE_URL ||
  process.env.DIRECT_DATABASE_URL ||
  process.env.DATABASE_URL;
const hasDatabase = Boolean(dbConnectionString);
const usesAccelerateProtocol = Boolean(
  dbConnectionString?.startsWith("prisma+postgres://"),
);
const businessSlug = `e2e-booking-${Date.now()}`;
const businessName = "E2E Booking Salon";
const businessId = `e2e_${Date.now()}`;
let dbClient: Client | null = null;

test.describe("Public booking smoke", () => {
  test.skip(
    !hasDatabase,
    "DIRECT_DATABASE_URL (or E2E_DATABASE_URL) is required for booking smoke E2E.",
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

    await dbClient.query(
      `INSERT INTO "Business" ("id", "name", "slug", "initials", "description", "created_at", "updated_at")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [
        businessId,
        businessName,
        businessSlug,
        "E2",
        "Deterministic smoke-test business",
      ],
    );

    await dbClient.query(
      `INSERT INTO "Service" ("name", "category", "price", "duration", "business_id", "created_at", "updated_at")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      ["E2E Signature Service", "GENERAL", 799, 45, businessId],
    );
  });

  test.afterAll(async () => {
    if (!dbClient) return;
    await dbClient.query(`DELETE FROM "Business" WHERE "slug" = $1`, [
      businessSlug,
    ]);
    await dbClient.end();
    dbClient = null;
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
