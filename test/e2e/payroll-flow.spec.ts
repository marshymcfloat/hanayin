import type { Page } from "@playwright/test";
import { expect, test } from "./isolated-test";
import type { Client } from "pg";
import { hash } from "bcryptjs";
import { createHash, randomUUID } from "node:crypto";
import { requireTestDatabase } from "../../scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { createFixtureDatabaseClient } from "@/test/support/e2e-database";

const enabled = process.env.E2E_PAYROLL_FLOW === "1";
const connectionString = enabled ? requireTestDatabase() : undefined;
const namespace = `e2e-payroll-${randomUUID()}`;
const clock = new Date("2024-01-15T01:00:00.000Z");
const timestamp = clock.toISOString();
const factory = createSharedWorkflowFactory({ namespace, now: clock });
const suffix = String(createHash("sha256").update(namespace).digest().readUInt32BE(0) % 10_000_000).padStart(7, "0");
const business = factory.business({ name: "E2E Payroll Salon" });
const foreignBusiness = factory.business({ id: `${namespace}-foreign-business`, slug: `${namespace}-foreign-salon`, name: "Foreign Payroll Sentinel" });
const owner = factory.user({ name: "E2E Payroll Owner", contactNumber: `63999${suffix}` });
const employee = factory.user({ id: `${namespace}-employee-user`, name: "E2E Payroll Employee", role: "EMPLOYEE", contactNumber: `63998${suffix}` });
const foreignEmployee = factory.user({ id: `${namespace}-foreign-user`, name: "Foreign Payroll Employee", role: "EMPLOYEE", contactNumber: `63997${suffix}` });
const customer = factory.customer({ businessId: business.id });
const service = factory.service({ businessId: business.id, name: "E2E Payroll Service", price: 1000 });
const booking = factory.booking({ businessId: business.id, customerId: customer.id, status: "COMPLETED", paymentStatus: "PAID", grandTotal: 1000, amountPaid: 1000 });
const password = "SyntheticPayroll123!";
const planId = `${namespace}-plan`;
const comment = `${namespace}-payout`;
let client: Client | null = null;
let employeeId: number;
let foreignEmployeeId: number;
let attendanceId: number;
let eligibleServiceId: number;
let unpaidServiceId: number;

async function login(page: Page, contactNumber: string) {
  await page.goto("/login");
  await page.getByLabel("Contact number", { exact: true }).fill(contactNumber);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await Promise.all([
    page.waitForURL(new RegExp(`/app/${business.slug}(?:[/?]|$)`), { timeout: 20_000 }),
    page.getByRole("button", { name: "Sign in to dashboard", exact: true }).click(),
  ]);
}

test.describe("Isolated payroll payout", () => {
  test.setTimeout(90_000);
  test.skip(!enabled, "Set E2E_PAYROLL_FLOW=1 with a verified disposable TEST_DATABASE_URL.");

  test.beforeAll(async () => {
    client = createFixtureDatabaseClient(connectionString);
    await client.connect();
    const hashedPassword = await hash(password, 10);
    await client.query("BEGIN");
    try {
      for (const record of [business, foreignBusiness]) {
        await client.query(
          `INSERT INTO "Business" ("id", "name", "slug", "initials", "description", "created_at", "updated_at") VALUES ($1,$2,$3,$4,$5,$6,$6)`,
          [record.id, record.name, record.slug, record.initials, record.description, timestamp],
        );
      }
      for (const record of [owner, employee, foreignEmployee]) {
        await client.query(
          `INSERT INTO "User" ("id", "name", "contact_number", "hashed_password", "role", "created_at", "updated_at") VALUES ($1,$2,$3,$4,$5::"Role",$6,$6)`,
          [record.id, record.name, record.contactNumber, hashedPassword, record.role, timestamp],
        );
      }
      await client.query(`INSERT INTO "Owner" ("user_id", "business_id", "specialties") VALUES ($1,$2,ARRAY['GENERAL'])`, [owner.id, business.id]);
      const own = await client.query<{ id: number }>(
        `INSERT INTO "Employee" ("user_id", "business_id", "salary", "daily_rate", "commission_percentage", "specialties") VALUES ($1,$2,0,500,10,ARRAY['GENERAL']) RETURNING "id"`,
        [employee.id, business.id],
      );
      employeeId = own.rows[0].id;
      const foreign = await client.query<{ id: number }>(
        `INSERT INTO "Employee" ("user_id", "business_id", "salary", "daily_rate", "commission_percentage") VALUES ($1,$2,0,9999,0) RETURNING "id"`,
        [foreignEmployee.id, foreignBusiness.id],
      );
      foreignEmployeeId = foreign.rows[0].id;
      await client.query(
        `INSERT INTO "SubscriptionPlan" ("id", "code", "name", "billing_interval", "price_amount", "updated_at") VALUES ($1,$2,'Synthetic Payroll Plan','MONTHLY',2000,$3)`,
        [planId, namespace.toUpperCase(), timestamp],
      );
      for (const record of [business, foreignBusiness]) {
        await client.query(
          `INSERT INTO "BusinessSubscription" ("id", "business_id", "plan_id", "status", "current_period_start", "current_period_end", "updated_at") VALUES ($1,$2,$3,'ACTIVE',$4,$5,$4)`,
          [`${record.id}-subscription`, record.id, planId, timestamp, "2040-01-15T01:00:00.000Z"],
        );
      }
      await client.query(`INSERT INTO "Customer" ("id", "business_id", "name", "email", "phone", "created_at", "updated_at") VALUES ($1,$2,$3,$4,$5,$6,$6)`, [customer.id, business.id, customer.name, customer.email, customer.phone, timestamp]);
      const createdService = await client.query<{ id: number }>(
        `INSERT INTO "Service" ("business_id", "name", "category", "price", "estimated_cost", "duration", "created_at", "updated_at") VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING "id"`,
        [business.id, service.name, service.category, service.price, service.estimatedCost, service.duration, timestamp],
      );
      for (const paid of [true, false]) {
        const createdBooking = await client.query<{ id: number }>(
          `INSERT INTO "Booking" ("business_id", "customer_id", "status", "payment_status", "payment_method", "amount_paid", "grand_total", "total_discount", "created_at", "updated_at") VALUES ($1,$2,$3::"BookingStatus",$4::"PaymentStatus",'CASH',$5,$6,0,$7,$7) RETURNING "id"`,
          [booking.businessId, booking.customerId, booking.status, paid ? booking.paymentStatus : "UNPAID", paid ? booking.amountPaid : 0, booking.grandTotal, timestamp],
        );
        const line = await client.query<{ id: number }>(
          `INSERT INTO "AvailedService" ("booking_id", "service_id", "served_by_id", "status", "price", "final_price", "commission_base", "completed_at", "created_at", "updated_at") VALUES ($1,$2,$3,'COMPLETED',1000,1000,800,$4,$4,$4) RETURNING "id"`,
          [createdBooking.rows[0].id, createdService.rows[0].id, employeeId, timestamp],
        );
        if (paid) eligibleServiceId = line.rows[0].id;
        else unpaidServiceId = line.rows[0].id;
      }
      const attendance = await client.query<{ id: number }>(
        `INSERT INTO "EmployeeAttendance" ("employee_id", "date", "status", "time_in", "time_out", "created_at", "updated_at") VALUES ($1,$2,'PRESENT',$2,$3,$2,$2) RETURNING "id"`,
        [employeeId, timestamp, "2024-01-15T09:00:00.000Z"],
      );
      attendanceId = attendance.rows[0].id;
      await client.query(`INSERT INTO "Payslip" ("employee_id", "starting_date", "ending_date", "released_at", "status", "total_salary", "comment") VALUES ($1,$2,$3,$3,'PAID',7777,'Foreign payroll sentinel')`, [foreignEmployeeId, timestamp, "2024-01-16T01:00:00.000Z" ]);
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
      requireTestDatabase();
      if (![business.id, foreignBusiness.id].every(id => id.startsWith(namespace))) throw new Error("Invalid payroll fixture namespace");
      await database.query("BEGIN");
      // Retained evidence is removed only from this disposable fixture transaction.
      await database.query("SET LOCAL session_replication_role = replica");
      await database.query(`DELETE FROM "PayrollAdjustment" WHERE "business_id" = ANY($1::text[])`, [[business.id, foreignBusiness.id]]);
      await database.query(`DELETE FROM "PayrollEarning" WHERE "business_id" = ANY($1::text[])`, [[business.id, foreignBusiness.id]]);
      await database.query(`DELETE FROM "AvailedService" WHERE "booking_id" IN (SELECT "id" FROM "Booking" WHERE "business_id" = ANY($1::text[]))`, [[business.id, foreignBusiness.id]]);
      await database.query(`DELETE FROM "EmployeeAttendance" WHERE "employee_id" = ANY($1::int[])`, [[employeeId, foreignEmployeeId].filter(Boolean)]);
      await database.query(`DELETE FROM "Payslip" WHERE "employee_id" = ANY($1::int[])`, [[employeeId, foreignEmployeeId].filter(Boolean)]);
      await database.query("SET LOCAL session_replication_role = origin");
      const cleanup = [
        [`DELETE FROM "AuditLog" WHERE "business_id" = ANY($1::text[])`, [[business.id, foreignBusiness.id]]],
        [`DELETE FROM "Business" WHERE "id" = ANY($1::text[])`, [[business.id, foreignBusiness.id]]],
        [`DELETE FROM "User" WHERE "id" = ANY($1::text[])`, [[owner.id, employee.id, foreignEmployee.id]]],
        [`DELETE FROM "SubscriptionPlan" WHERE "id" = $1`, [planId]],
      ] as const;
      for (const [sql, parameters] of cleanup) {
        try { await database.query(sql, [...parameters]); }
        catch { failures++; }
      }
      if (failures) await database.query("ROLLBACK");
      else await database.query("COMMIT");
    } catch (error) {
      await database.query("ROLLBACK");
      throw error;
    } finally {
      try { await database.end(); } finally { client = null; }
    }
    if (failures) throw new Error(`Payroll fixture cleanup failed in ${failures} steps`);
  });

  test("releases eligible pay with audit and denies employee/foreign payroll access", async ({ page, context }) => {
    if (!client) throw new Error("Payroll fixture database is unavailable");
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page, owner.contactNumber);
    await page.goto(`/app/${business.slug}/payroll`);
    await expect(page.getByRole("heading", { name: "Payroll", exact: true })).toBeVisible();
    await expect(page.getByText(foreignEmployee.name, { exact: true })).toHaveCount(0);
    const row = page.getByRole("row").filter({ hasText: employee.name });
    await expect(row.getByText("No payout yet", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Generate", exact: true }).click();
    const preview = page.getByRole("dialog", { name: "Generate Payslip", exact: true });
    await expect(preview.getByText(employee.name, { exact: true })).toBeVisible();
    await expect(preview.getByText("1 services", { exact: true })).toBeVisible();
    await expect(preview.getByText("₱500", { exact: true })).toHaveCount(2);
    await expect(preview.getByText("₱80", { exact: true })).toBeVisible();
    await expect(preview.getByText("₱580", { exact: true })).toBeVisible();
    await preview.getByRole("button", { name: "View commission details", exact: true }).click();
    await expect(preview.getByText(service.name, { exact: false })).toBeVisible();
    await preview.getByLabel("Deduction / adjustment", { exact: true }).fill("30");
    await preview.getByLabel("Notes (optional)", { exact: true }).fill(comment);
    await expect(preview.getByText("₱550", { exact: true })).toBeVisible();
    await preview.getByRole("button", { name: "Confirm Payout", exact: true }).click();
    await expect(preview).not.toBeVisible();
    await expect(row.getByText(/₱\s*550\.00/)).toBeVisible();

    const persisted = await client.query<{ id: number; status: string; total_salary: number; deduction: number; comment: string; released_at: Date }>(
      `SELECT "id", "status", "total_salary", "deduction", "comment", "released_at" FROM "Payslip" WHERE "employee_id" = $1`, [employeeId],
    );
    expect(persisted.rows).toHaveLength(1);
    const payslip = persisted.rows[0];
    expect(payslip).toMatchObject({ status: "PAID", total_salary: 550, deduction: 30, comment });
    expect(payslip.released_at).toBeInstanceOf(Date);
    const linkedAttendance = await client.query(`SELECT "paid_in_payslip_id" FROM "EmployeeAttendance" WHERE "id" = $1 AND "employee_id" = $2`, [attendanceId, employeeId]);
    expect(linkedAttendance.rows).toEqual([{ paid_in_payslip_id: payslip.id }]);
    const lines = await client.query<{ id: number; paid_in_payslip_id: number | null }>(`SELECT "id", "paid_in_payslip_id" FROM "AvailedService" WHERE "id" = ANY($1::int[]) AND "served_by_id" = $2`, [[eligibleServiceId, unpaidServiceId], employeeId]);
    expect(lines.rows).toHaveLength(2);
    expect(lines.rows.find(line => line.id === eligibleServiceId)?.paid_in_payslip_id).toBe(payslip.id);
    expect(lines.rows.find(line => line.id === unpaidServiceId)?.paid_in_payslip_id).toBeNull();
    const audit = await client.query(`SELECT "action", "actor_id", "changes" FROM "AuditLog" WHERE "business_id" = $1 AND "entity_type" = 'Payslip' AND "entity_id" = $2`, [business.id, String(payslip.id)]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ action: "CREATED", actor_id: owner.id, changes: { after: { days_present: 1, basic_salary: 500, commission_total: 80, gross_salary: 580, deduction: 30, net_salary: 550, attendance_count: 1, services_count: 1, comment } } });
    await row.getByRole("button", { name: `View payslip audit for ${employee.name}`, exact: true }).click();
    const history = page.getByRole("dialog", { name: "Payslip Audit History", exact: true });
    await expect(history.getByText("Released", { exact: true })).toBeVisible();
    await expect(history.getByText(`Payslip #${payslip.id}`, { exact: true })).toBeVisible();
    await expect(history.getByText("Net Salary", { exact: true })).toBeVisible();

    await context.clearCookies();
    await login(page, employee.contactNumber);
    await page.goto(`/app/${business.slug}/payroll`);
    await expect(page).toHaveURL(new RegExp(`/app/${business.slug}/?$`));
    await expect(page.getByRole("heading", { name: "Payroll", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Confirm Payout", exact: true })).toHaveCount(0);
    await page.goto(`/app/${foreignBusiness.slug}/payroll`);
    await expect(page).toHaveURL(new RegExp(`/app/${business.slug}/?$`));
    await expect(page.getByText(foreignEmployee.name, { exact: true })).toHaveCount(0);
    const foreignPayslips = await client.query(`SELECT "total_salary", "status" FROM "Payslip" WHERE "employee_id" = $1`, [foreignEmployeeId]);
    expect(foreignPayslips.rows).toEqual([{ total_salary: 7777, status: "PAID" }]);
  });
});
