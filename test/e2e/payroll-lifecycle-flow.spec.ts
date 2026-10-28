import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { expect as baseExpect, test } from "./isolated-test";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { payrollLifecycleFixture } from "@/test/support/payroll-lifecycle-fixture";

const enabled = process.env.E2E_PAYROLL_LIFECYCLE === "1";
const expect = baseExpect.configure({ timeout: 30000 });
if (enabled) requireTestDatabase();

test.describe("Immutable payroll owner and employee workflow", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(300_000);
  test.use({ actionTimeout: 30000, navigationTimeout: 60000 });
  test.skip(!enabled, "Set E2E_PAYROLL_LIFECYCLE=1 with a verified disposable TEST_DATABASE_URL.");
  const fixture = payrollLifecycleFixture();
  test.beforeAll(async () => { await fixture.seed(); });
  test.afterAll(async () => { await fixture.cleanup(); });

  async function login(page: Page, number: string) {
    await page.goto("/login");
    await page.getByLabel("Contact number", { exact: true }).fill(number);
    await page.getByLabel("Password", { exact: true }).fill(fixture.password);
    await Promise.all([
      page.waitForURL(new RegExp(`/app/${fixture.business.slug}(?:[/?]|$)`)),
      page.getByRole("button", { name: "Sign in to dashboard", exact: true }).click(),
    ]);
  }

  test("resolves work and leave, publishes once, records installments, and shares the identical statement", async ({ page, context }) => {
    const runtimeErrors: string[] = [];
    page.on("pageerror", error => runtimeErrors.push(error.message));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
    await page.setViewportSize({ width: 1440, height: 1000 });
    await login(page, fixture.owner.contactNumber);
    await page.goto(`/app/${fixture.business.slug}/payroll`);
    await expect(page.getByRole("heading", { name: "Choose a payroll period", exact: true })).toBeVisible();
    await page.getByLabel("Work starts", { exact: true }).fill(fixture.workStart);
    await page.getByLabel("Work ends", { exact: true }).fill(today);
    await page.getByLabel("Planned payment date", { exact: true }).fill(today);
    await page.getByRole("button", { name: "Prepare payroll", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Resolve exceptions", exact: true })).toBeVisible();
    await expect(page.getByText(/missing.*clock|clock.*missing|clock-out|incomplete clock/i).first()).toBeVisible();

    await page.getByLabel("Work date", { exact: true }).fill(fixture.workStart);
    await page.getByRole("button", { name: "Load attendance", exact: true }).click();
    await page.getByLabel("Correction reason", { exact: true }).fill("Verified full day; missing clock-out confirmed by owner");
    await page.getByLabel("Confirm a full working day without complete clock records", { exact: true }).check();
    await page.getByRole("button", { name: "Save reviewed correction", exact: true }).click();
    await expect(page.getByText("Correction saved. Recalculate the affected statement and review it again.", { exact: true })).toBeVisible();

    const leave = page.locator("form").filter({ hasText: "Synthetic paid discretionary leave" });
    await leave.getByLabel("Decision and authorization reason", { exact: true }).fill("Owner authorizes paid scheduled discretionary leave");
    await leave.getByLabel("Paid leave", { exact: true }).check();
    await leave.getByRole("button", { name: "Approve reviewed leave", exact: true }).click();
    await expect(page.getByText("Leave decision saved. Recalculate affected payroll statements.", { exact: true })).toBeVisible();
    const attendanceRows = await fixture.client.query(`SELECT count(*)::int AS count FROM "EmployeeAttendance" WHERE employee_id=$1 AND date=$2`, [fixture.employeeId, new Date(`${fixture.leaveDate}T00:00:00+08:00`).toISOString()]);
    expect(attendanceRows.rows[0].count).toBe(0);
    await page.getByRole("button", { name: `Recalculate ${fixture.employee.name}`, exact: true }).click();
    await expect(page.getByText("No unresolved exceptions. Review the breakdown before publication.", { exact: true })).toBeVisible();

    const reviewStage = page.getByRole("button", { name: "3 · Review and publish", exact: true });
    await reviewStage.focus();
    await page.keyboard.press("Enter");
    await expect(reviewStage).toHaveAttribute("aria-pressed", "true");
    const statement = page.locator("details").filter({ has: page.locator("summary").filter({ hasText: fixture.employee.name }) });
    await statement.locator(":scope > summary").click();
    const ownerStatement = statement.getByRole("region", { name: `${fixture.employee.name} payslip`, exact: true });
    await expect(ownerStatement.getByText("Net pay", { exact: true }).locator("..").getByText("₱2,200.00", { exact: true })).toBeVisible();
    const commission = ownerStatement.getByRole("row").filter({ hasText: /commission/i });
    await expect(commission.getByText("₱200.00", { exact: true })).toBeVisible();
    await commission.getByText("Source details", { exact: true }).click();
    await expect(commission.getByText(/Source record:/)).toBeVisible();
    await commission.getByText("Source details", { exact: true }).click();
    await statement.getByLabel("I reviewed the amounts and their sources.", { exact: true }).check();
    await statement.getByRole("button", { name: "Approve", exact: true }).click();
    await statement.getByRole("button", { name: "Publish payslip", exact: true }).click();
    await expect(statement.locator(":scope > summary")).toContainText("PUBLISHED · UNPAID");
    const persisted = await fixture.client.query<{ id: string; net: string; paid_amount: string; status: string }>(`SELECT id,net,paid_amount,status FROM "PayrollStatement" WHERE business_id=$1`, [fixture.business.id]);
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0]).toMatchObject({ net: "2200.00", paid_amount: "0.00", status: "PUBLISHED" });
    const statementId = persisted.rows[0].id;
    expect((await fixture.client.query(`SELECT count(*)::int AS count FROM "PayrollNotification" WHERE statement_id=$1`, [statementId])).rows[0].count).toBe(1);

    await page.getByRole("button", { name: "4 · Record payments", exact: true }).click();
    await statement.getByLabel("Amount", { exact: true }).fill("700");
    await statement.getByLabel("Payment reference", { exact: true }).fill("SYNTHETIC-INSTALLMENT-1");
    await statement.getByRole("button", { name: "Record payment", exact: true }).click();
    await expect(statement.locator(":scope > summary")).toContainText("PUBLISHED · PARTIAL");
    await expect(statement.getByLabel("Amount", { exact: true })).toHaveValue("1500.00");
    await page.reload();
    await page.getByRole("button", { name: "4 · Record payments", exact: true }).click();
    await statement.locator(":scope > summary").click();
    await statement.getByLabel("Payment reference", { exact: true }).fill("SYNTHETIC-INSTALLMENT-2");
    await statement.getByRole("button", { name: "Record payment", exact: true }).click();
    await expect(statement.locator(":scope > summary")).toContainText("PUBLISHED · PAID");
    await expect(statement.getByText("Fully settled.", { exact: true })).toBeVisible();
    const paymentCount = await fixture.client.query(`SELECT count(*)::int AS count,sum(amount)::text AS total FROM "PayrollPayment" WHERE statement_id=$1`, [statementId]);
    expect(paymentCount.rows[0]).toEqual({ count: 2, total: "2200.00" });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV", exact: true }).click();
    const download = await downloadPromise;
    const path = await download.path();
    if (!path) throw new Error("Payroll register download is unavailable");
    const register = await readFile(path, "utf8");
    expect(register).toContain(statementId);
    expect(register).toContain('"2200.00"');
    expect(register).toContain('"PAID"');
    const ownerBreakdown = await statement.getByRole("region", { name: `${fixture.employee.name} payslip`, exact: true }).getByRole("table").innerText();

    await context.clearCookies();
    await login(page, fixture.employee.contactNumber);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/app/${fixture.business.slug}/my-pay?statement=${statementId}`);
    const employeeStatement = page.getByRole("region", { name: `${fixture.employee.name} payslip`, exact: true });
    await expect(employeeStatement).toBeVisible();
    await expect(employeeStatement.getByText("PUBLISHED · PAID", { exact: true })).toBeVisible();
    await expect.poll(() => employeeStatement.getByRole("table").innerText()).toBe(ownerBreakdown);
    await expect(employeeStatement.getByText(/SYNTHETIC-INSTALLMENT-1/)).toBeVisible();
    await expect(employeeStatement.getByText(/SYNTHETIC-INSTALLMENT-2/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Print / save PDF", exact: true })).toBeVisible();
    await page.reload();
    await expect(employeeStatement).toBeVisible();
    await page.getByRole("button", { name: "Back to My Pay", exact: true }).click();
    await expect(page.getByText("Commissions awaiting customer payment", { exact: true })).toBeVisible();
    await expect(page.getByText("₱200.00", { exact: true })).toBeVisible();
    await page.goto(`/app/${fixture.business.slug}/payroll`);
    await expect(page).toHaveURL(new RegExp(`/app/${fixture.business.slug}/?$`));
    expect(runtimeErrors).toEqual([]);
  });
});
