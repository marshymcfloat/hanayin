import type { Page } from "@playwright/test";
import { expect, test } from "./isolated-test";
import type { Client } from "pg";
import { hash } from "bcryptjs";
import { createHash, randomUUID } from "node:crypto";
import { requireTestDatabase } from "../../scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { createFixtureDatabaseClient } from "@/test/support/e2e-database";

const enabled = process.env.E2E_BOOKING_FLOW === "1";
const connectionString = enabled ? requireTestDatabase() : undefined;
const namespace = `e2e-internal-booking-${randomUUID()}`;
const now = new Date();
const timestamp = now.toISOString();
const factory = createSharedWorkflowFactory({ namespace, now });
const suffix = String(createHash("sha256").update(namespace).digest().readUInt32BE(0) % 10_000_000).padStart(7, "0");
const business = factory.business({ name: "E2E Internal Booking Salon" });
const owner = factory.user({ name: "E2E Booking Owner", contactNumber: `63996${suffix}` });
const provider = factory.user({ id: `${namespace}-provider-user`, name: "E2E Booking Provider", role: "EMPLOYEE", contactNumber: `63995${suffix}` });
const customer = factory.customer({ name: "E2E Internal Customer", phone: `63994${suffix}`, email: `${namespace}@example.test` });
const service = factory.service({ name: "E2E Internal Signature Service" });
const planId = `${namespace}-plan`;
const password = "SyntheticBooking123!";
const cancellationReason = "Synthetic customer requested cancellation";
let client: Client | null = null;
let serviceId: number;

async function loginOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Contact number", { exact: true }).fill(owner.contactNumber);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await Promise.all([
    page.waitForURL(new RegExp(`/app/${business.slug}(?:[/?]|$)`), { timeout: 20_000 }),
    page.getByRole("button", { name: "Sign in to dashboard", exact: true }).click(),
  ]);
}

test.describe("Authenticated internal booking form", () => {
  test.use({ timezoneId: "Asia/Manila" });
  test.setTimeout(90_000);
  test.skip(!enabled, "Set E2E_BOOKING_FLOW=1 with a verified disposable TEST_DATABASE_URL.");

  test.beforeAll(async () => {
    client = createFixtureDatabaseClient(connectionString);
    await client.connect();
    const hashedPassword = await hash(password, 10);
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO "Business" ("id", "name", "slug", "initials", "description", "created_at", "updated_at") VALUES ($1,$2,$3,$4,$5,$6,$6)`,
        [business.id, business.name, business.slug, business.initials, business.description, timestamp],
      );
      for (const record of [owner, provider]) {
        await client.query(
          `INSERT INTO "User" ("id", "name", "contact_number", "hashed_password", "role", "created_at", "updated_at") VALUES ($1,$2,$3,$4,$5::"Role",$6,$6)`,
          [record.id, record.name, record.contactNumber, hashedPassword, record.role, timestamp],
        );
      }
      await client.query(`INSERT INTO "Owner" ("user_id", "business_id", "specialties") VALUES ($1,$2,ARRAY[]::text[])`, [owner.id, business.id]);
      await client.query(
        `INSERT INTO "Employee" ("user_id", "business_id", "salary", "daily_rate", "commission_percentage", "specialties") VALUES ($1,$2,0,500,10,ARRAY[$3]::text[])`,
        [provider.id, business.id, service.category],
      );
      for (let day = 0; day < 7; day++) {
        await client.query(`INSERT INTO "BusinessHours" ("business_id", "day_of_week", "category", "open_time", "close_time") VALUES ($1,$2,$3,'09:00','17:00')`, [business.id, day, service.category]);
      }
      await client.query(
        `INSERT INTO "SubscriptionPlan" ("id", "code", "name", "billing_interval", "price_amount", "updated_at") VALUES ($1,$2,'Synthetic Booking Plan','MONTHLY',2000,$3)`,
        [planId, namespace.toUpperCase(), timestamp],
      );
      await client.query(
        `INSERT INTO "BusinessSubscription" ("id", "business_id", "plan_id", "status", "current_period_start", "current_period_end", "updated_at") VALUES ($1,$2,$3,'ACTIVE',$4,$5,$4)`,
        [`${namespace}-subscription`, business.id, planId, timestamp, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()],
      );
      await client.query(
        `INSERT INTO "Customer" ("id", "business_id", "name", "email", "phone", "created_at", "updated_at") VALUES ($1,$2,$3,$4,$5,$6,$6)`,
        [customer.id, business.id, customer.name, customer.email, customer.phone, timestamp],
      );
      const catalog = await client.query<{ id: number }>(
        `INSERT INTO "Service" ("business_id", "name", "category", "price", "estimated_cost", "duration", "created_at", "updated_at") VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING "id"`,
        [business.id, service.name, service.category, service.price, service.estimatedCost, service.duration, timestamp],
      );
      serviceId = catalog.rows[0].id;
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  test.afterAll(async () => {
    if (!client) return;
    const database = client;
    let failures = 0;
    try {
      const cleanup = [
        [`DELETE FROM "OutboxMessage" WHERE "business_id" = $1`, [business.id]],
        [`DELETE FROM "AuditLog" WHERE "business_id" = $1`, [business.id]],
        [`DELETE FROM "Business" WHERE "id" = $1`, [business.id]],
        [`DELETE FROM "User" WHERE "id" = ANY($1::text[])`, [[owner.id, provider.id]]],
        [`DELETE FROM "SubscriptionPlan" WHERE "id" = $1`, [planId]],
      ] as const;
      for (const [sql, parameters] of cleanup) {
        try { await database.query(sql, [...parameters]); }
        catch { failures++; }
      }
    } finally {
      try { await database.end(); } finally { client = null; }
    }
    if (failures) throw new Error(`Internal booking fixture cleanup failed in ${failures} steps`);
  });

  test("creates a scheduled cash booking through the form and cancels through the list", async ({ page }) => {
    if (!client) throw new Error("Internal booking fixture database is unavailable");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.clock.setFixedTime(now);
    await loginOwner(page);
    await page.getByRole("button", { name: "Create new booking", exact: true }).click();
    const form = page.getByRole("dialog", { name: "Create new booking", exact: true });
    await form.getByRole("combobox", { name: "Choose services or packages", exact: true }).click();
    await page.getByRole("option", { name: new RegExp(service.name) }).click();
    await form.getByRole("combobox", { name: "Choose services or packages", exact: true }).click();
    await form.getByRole("button", { name: "Continue", exact: true }).click();
    await form.getByRole("button", { name: "Tomorrow", exact: true }).click();
    await form.getByRole("button", { name: /^9:00 AM\s/ }).click();
    await form.getByPlaceholder("Search by name, phone, or email…", { exact: true }).fill(customer.name);
    await form.getByRole("button", { name: new RegExp(`^${customer.name}(?:\\s|$)`) }).click();
    await form.getByRole("button", { name: "Continue", exact: true }).click();
    const review = form.getByRole("region", { name: "Booking checkout review", exact: true });
    await expect(review.getByText(customer.name, { exact: true })).toBeVisible();
    await expect(review.getByRole("button", { name: "Cash", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(review.getByRole("button", { name: "Full", exact: true })).toHaveAttribute("aria-pressed", "true");
    await review.getByRole("checkbox", { name: /^Details are correct/ }).check();
    await review.getByRole("button", { name: "Confirm Booking", exact: true }).click();
    await expect(form).not.toBeVisible();
    await expect(page.getByText("Booking successfully created", { exact: true })).toBeVisible();

    const persisted = await client.query<{ id: number; scheduled_at: Date; estimated_end: Date; status: string; payment_status: string; payment_method: string; amount_paid: number; grand_total: number; total_discount: number; customer_id: string; is_anonymous_walk_in: boolean; hold_expires_at: Date | null }>(
      `SELECT "id", "scheduled_at", "estimated_end", "status", "payment_status", "payment_method", "amount_paid", "grand_total", "total_discount", "customer_id", "is_anonymous_walk_in", "hold_expires_at" FROM "Booking" WHERE "business_id" = $1`, [business.id],
    );
    expect(persisted.rows).toHaveLength(1);
    const booking = persisted.rows[0];
    expect(booking).toMatchObject({ status: "ACCEPTED", payment_status: "UNPAID", payment_method: "CASH", amount_paid: 0, grand_total: service.price, total_discount: 0, customer_id: customer.id, is_anonymous_walk_in: false, hold_expires_at: null });
    const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now.getTime() + 24 * 60 * 60 * 1000));
    expect(booking.scheduled_at.toISOString()).toBe(new Date(`${tomorrow}T09:00:00+08:00`).toISOString());
    expect(booking.estimated_end.getTime() - booking.scheduled_at.getTime()).toBe(service.duration * 60 * 1000);
    const lines = await client.query(`SELECT "service_id", "status", "price", "estimated_cost", "final_price", "commission_base", "discount", "served_by_id", "paid_in_payslip_id" FROM "AvailedService" WHERE "booking_id" = $1`, [booking.id]);
    expect(lines.rows).toEqual([{ service_id: serviceId, status: "PENDING", price: service.price, estimated_cost: service.estimatedCost, final_price: service.price, commission_base: service.price, discount: 0, served_by_id: null, paid_in_payslip_id: null }]);
    const payments = await client.query(`SELECT "id" FROM "BookingPayment" WHERE "booking_id" = $1`, [booking.id]);
    expect(payments.rows).toHaveLength(0);
    const metric = await client.query(`SELECT "changes" FROM "AuditLog" WHERE "business_id" = $1 AND "entity_type" = 'BookingMetric' AND "action" = 'BOOKING_SUBMIT_SUCCESS'`, [business.id]);
    expect(metric.rows).toHaveLength(1);
    expect(metric.rows[0].changes).toMatchObject({ outcome: "SUCCESS", isPublicBooking: false, bookingId: booking.id, paymentMethod: "CASH", paymentType: "FULL", capacityOverrideApplied: false });
    const created = await client.query(`SELECT "event_type", "payload", "processed", "attempts" FROM "OutboxMessage" WHERE "business_id" = $1 AND "aggregate_type" = 'Booking' AND "aggregate_id" = $2`, [business.id, String(booking.id)]);
    expect(created.rows).toHaveLength(1);
    expect(created.rows[0]).toMatchObject({ event_type: "BOOKING_CREATED", processed: false, attempts: 0, payload: { bookingId: booking.id, status: "ACCEPTED", grandTotal: service.price, isWalkIn: false, customerName: customer.name } });

    const listingResponse = await page.goto(`/app/${business.slug}/bookings`);
    expect(listingResponse?.status()).toBe(200);
    const row = page.getByRole("row").filter({ hasText: customer.name });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: `Open actions for booking ${booking.id}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Cancel Booking", exact: true }).click();
    const cancel = page.getByRole("dialog", { name: "Cancel this booking?", exact: true });
    await cancel.getByLabel("Reason", { exact: true }).fill(cancellationReason);
    await cancel.getByRole("button", { name: "Confirm cancel", exact: true }).click();
    await expect(cancel).not.toBeVisible();
    await expect(row.getByText("Cancelled", { exact: true })).toBeVisible();
    const cancelled = await client.query(`SELECT "status", "cancelled_at", "cancelled_by_id", "cancellation_reason", "amount_paid" FROM "Booking" WHERE "id" = $1 AND "business_id" = $2`, [booking.id, business.id]);
    expect(cancelled.rows).toHaveLength(1);
    expect(cancelled.rows[0]).toMatchObject({ status: "CANCELLED", cancelled_by_id: owner.id, cancellation_reason: cancellationReason, amount_paid: 0 });
    expect(cancelled.rows[0].cancelled_at).toBeInstanceOf(Date);
    const audit = await client.query(`SELECT "action", "actor_id", "changes" FROM "AuditLog" WHERE "business_id" = $1 AND "entity_type" = 'Booking' AND "entity_id" = $2`, [business.id, String(booking.id)]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ action: "CANCELLED", actor_id: owner.id, changes: { before: { status: "ACCEPTED" }, after: { status: "CANCELLED", cancellation_reason: cancellationReason } } });
    const events = await client.query(`SELECT "event_type", "processed", "attempts", "payload" FROM "OutboxMessage" WHERE "business_id" = $1 AND "aggregate_id" = $2 ORDER BY "event_type"`, [business.id, String(booking.id)]);
    expect(events.rows.map(event => event.event_type)).toEqual(["BOOKING_CANCELLED", "BOOKING_CREATED"]);
    expect(events.rows.every(event => event.processed === false && event.attempts === 0)).toBe(true);
    expect(events.rows[0].payload).toMatchObject({ bookingId: booking.id, status: "CANCELLED", reason: cancellationReason, actorUserId: owner.id });
  });
});
