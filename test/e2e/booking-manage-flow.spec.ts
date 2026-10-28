import { randomUUID, createHmac } from "node:crypto";
import type { Client } from "pg";
import { test, expect } from "./isolated-test";
import { requireTestDatabase } from "../../scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { ISOLATED_AUTH_SECRET } from "@/test/support/e2e-environment";
import { createFixtureDatabaseClient } from "@/test/support/e2e-database";

const connectionString = requireTestDatabase();
const namespace = `e2e-manage-${randomUUID()}`;
const factory = createSharedWorkflowFactory({ namespace, now: new Date() });
const business = factory.business();
const owner = factory.user();
const service = factory.service();
let client: Client | undefined;
let bookingId: number;
let serviceId: number;
let lineId: number;

function futureDate(days: number, hour: number) {
  const date = new Date(Date.now() + days * 86_400_000);
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
  return new Date(`${key}T${String(hour).padStart(2, "0")}:00:00+08:00`);
}

function manageUrl(purpose = "manage") {
  const payload = Buffer.from(JSON.stringify({
    bookingId, businessSlug: business.slug, purpose,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url");
  const signature = createHmac("sha256", ISOLATED_AUTH_SECRET).update(payload).digest("base64url");
  return `/${business.slug}/booking/manage?bookingId=${bookingId}&token=${payload}.${signature}`;
}

async function cleanup() {
  if (!client) return;
  const db = client;
  let failures = 0;
  try {
    for (const [query, id] of [
      ['DELETE FROM "OutboxMessage" WHERE "business_id" = $1', business.id],
      ['DELETE FROM "Business" WHERE "id" = $1', business.id],
      ['DELETE FROM "User" WHERE "id" = $1', owner.id],
    ]) {
      try { await db.query(query, [id]); } catch { failures++; }
    }
  } finally { try { await db.end(); } finally { client = undefined; } }
  if (failures) throw new Error(`Manage fixture cleanup failed in ${failures} steps`);
}

test.describe("Customer booking manage workflow", () => {
  test.use({ timezoneId: "Asia/Manila" });
  test.setTimeout(90_000);

  test.beforeAll(async () => {
    client = createFixtureDatabaseClient(connectionString);
    await client.connect();
    await client.query("BEGIN");
    try {
      await client.query(
        'INSERT INTO "Business" ("id", "name", "slug", "initials", "updated_at") VALUES ($1,$2,$3,$4,NOW())',
        [business.id, business.name, business.slug, business.initials],
      );
      await client.query(
        'INSERT INTO "User" ("id", "name", "contact_number", "hashed_password", "role", "updated_at") VALUES ($1,$2,$3,$4,\'OWNER\',NOW())',
        [owner.id, owner.name, `+639${BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 12)}`).toString().padStart(9, "0").slice(-9)}`, owner.hashedPassword],
      );
      await client.query(
        'INSERT INTO "Owner" ("user_id", "business_id", "specialties") VALUES ($1,$2,$3)',
        [owner.id, business.id, [service.category]],
      );
      await client.query(
        'INSERT INTO "BusinessHours" ("business_id", "day_of_week", "open_time", "close_time") SELECT $1, day, \'09:00\', \'17:00\' FROM generate_series(0,6) AS day',
        [business.id],
      );
      serviceId = (await client.query<{ id: number }>(
        'INSERT INTO "Service" ("name", "category", "price", "duration", "business_id", "updated_at") VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING "id"',
        [service.name, service.category, service.price, service.duration, business.id],
      )).rows[0].id;
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
  });

  test.beforeEach(async () => {
    if (!client) throw new Error("Missing manage fixture connection");
    await client.query('DELETE FROM "OutboxMessage" WHERE "business_id" = $1', [business.id]);
    await client.query('DELETE FROM "Booking" WHERE "business_id" = $1', [business.id]);
    const scheduled = futureDate(3, 12);
    const end = new Date(scheduled.getTime() + service.duration * 60_000);
    bookingId = (await client.query<{ id: number }>(
      'INSERT INTO "Booking" ("business_id", "status", "is_anonymous_walk_in", "customer_label", "grand_total", "total_discount", "scheduled_at", "estimated_end", "updated_at") VALUES ($1,\'ACCEPTED\',true,\'Synthetic customer\',$2,0,$3,$4,NOW()) RETURNING "id"',
      [business.id, service.price, scheduled.toISOString(), end.toISOString()],
    )).rows[0].id;
    lineId = (await client.query<{ id: number }>(
      'INSERT INTO "AvailedService" ("booking_id", "service_id", "price", "final_price", "commission_base", "scheduled_at", "estimated_end", "updated_at") VALUES ($1,$2,$3,$3,$3,$4,$5,NOW()) RETURNING "id"',
      [bookingId, serviceId, service.price, scheduled.toISOString(), end.toISOString()],
    )).rows[0].id;
  });

  test.afterAll(cleanup);

  test("rejects a correctly signed token for a different purpose without writes", async ({ page }) => {
    await page.goto(manageUrl("details"));
    await expect(page.getByRole("heading", { name: "This link is invalid or has expired" })).toBeVisible();
    const result = await client!.query('SELECT "status", "reschedule_count" FROM "Booking" WHERE "id" = $1', [bookingId]);
    expect(result.rows).toEqual([{ status: "ACCEPTED", reschedule_count: 0 }]);
    expect((await client!.query('SELECT "id" FROM "OutboxMessage" WHERE "business_id"=$1', [business.id])).rows).toEqual([]);
  });

  test("cancels from a verified manage link and persists the graph and event", async ({ page }) => {
    await page.goto(manageUrl());
    await page.getByRole("button", { name: "Cancel booking", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel booking", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Booking cancelled", exact: true })).toBeVisible();
    const result = await client!.query('SELECT "status", "cancelled_by_customer", "cancelled_at" IS NOT NULL AS cancelled FROM "Booking" WHERE "id"=$1', [bookingId]);
    expect(result.rows).toEqual([{ status: "CANCELLED", cancelled_by_customer: true, cancelled: true }]);
    expect((await client!.query('SELECT "status" FROM "AvailedService" WHERE "id"=$1', [lineId])).rows).toEqual([{ status: "CANCELLED" }]);
    expect((await client!.query('SELECT "event_type" FROM "OutboxMessage" WHERE "business_id"=$1', [business.id])).rows).toEqual([{ event_type: "BOOKING_CANCELLED_BY_CUSTOMER" }]);
  });

  test("reschedules using real slot availability and persists the new schedule", async ({ page }) => {
    const nextDate = futureDate(4, 9);
    await page.goto(manageUrl());
    await page.getByRole("button", { name: "Reschedule", exact: true }).click();
    await page.getByRole("button", { name: "Pick a new date", exact: true }).click();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric", year: "numeric",
    }).formatToParts(nextDate);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)!.value;
    const label = new RegExp(`^${part("weekday")}, ${part("month")} ${part("day")}(?:st|nd|rd|th)?, ${part("year")}$`);
    if (!await page.getByRole("button", { name: label }).count()) {
      await page.getByRole("button", { name: "Go to the Next Month", exact: true }).click();
    }
    await page.getByRole("button", { name: label }).click();
    await page.getByRole("button", { name: /^9:00 AM/ }).click();
    await page.getByRole("button", { name: "Confirm reschedule", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Booking rescheduled", exact: true })).toBeVisible();
    const result = await client!.query('SELECT "scheduled_at", "reschedule_count" FROM "Booking" WHERE "id"=$1', [bookingId]);
    expect(result.rows).toEqual([{ scheduled_at: nextDate, reschedule_count: 1 }]);
    const line = await client!.query('SELECT "scheduled_at", "status", "served_by_id", "claimed_at" FROM "AvailedService" WHERE "id"=$1', [lineId]);
    expect(line.rows).toEqual([{ scheduled_at: nextDate, status: "PENDING", served_by_id: null, claimed_at: null }]);
    expect((await client!.query('SELECT "event_type" FROM "OutboxMessage" WHERE "business_id"=$1', [business.id])).rows).toEqual([{ event_type: "BOOKING_RESCHEDULED_BY_CUSTOMER" }]);
  });
});
