import type { Page } from "@playwright/test";
import { expect as baseExpect, test } from "@/test/e2e/isolated-test";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { simplePayrollFixture } from "@/test/support/payroll-simple-fixture";

const enabled = process.env.E2E_SIMPLE_PAYROLL === "1";
const expect = baseExpect.configure({ timeout: 30_000 });
if (enabled) requireTestDatabase();

test.describe("Simple payroll owner and employee flow", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(240_000);
  test.use({ actionTimeout: 30_000, navigationTimeout: 60_000 });
  test.skip(!enabled, "Set E2E_SIMPLE_PAYROLL=1 with a verified disposable TEST_DATABASE_URL.");
  const fixture = simplePayrollFixture();
  test.beforeAll(async () => { await fixture.seed(); });
  test.afterAll(async () => { await fixture.cleanup(); });

  async function login(page: Page, contactNumber: string) {
    await page.goto("/login");
    await page.getByLabel("Contact number", { exact: true }).fill(contactNumber);
    await page.getByLabel("Password", { exact: true }).fill(fixture.password);
    await Promise.all([
      page.waitForURL(new RegExp(`/app/${fixture.business.slug}(?:[/?]|$)`)),
      page.getByRole("button", { name: "Sign in to dashboard", exact: true }).click(),
    ]);
  }

  async function waitForSheet(page: Page) {
    await expect.poll(() => page.getByRole("dialog").evaluate(element => {
      const style = getComputedStyle(element);
      const transform = new DOMMatrixReadOnly(style.transform);
      return { opacity: style.opacity, x: transform.m41, y: transform.m42 };
    })).toEqual({ opacity: "1", x: 0, y: 0 });
  }

  test("saves an unpaid payslip without government setup, records an installment, and shares the same sources", async ({ page, context }, testInfo) => {
    const runtimeErrors: string[] = [];
    page.on("pageerror", error => runtimeErrors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await login(page, fixture.owner.contactNumber);
    await page.goto("/redesign/owner-dashboard/team/employees");
    await page.getByRole("button", { name: `Manage ${fixture.employee.name}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Edit employee", exact: true }).click();
    const profile = page.getByRole("dialog", { name: "Edit employee", exact: true });
    await expect(profile.getByLabel("Joined on", { exact: true })).toHaveValue("2024-01-01");
    await profile.getByLabel("Joined on", { exact: true }).fill("2023-12-01");
    await profile.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(profile).toBeHidden();
    await expect.poll(async () => (await fixture.client.query(`SELECT employment_start::text FROM "Employee" WHERE id=$1`, [fixture.employeeId])).rows[0]?.employment_start).toBe("2023-12-01");
    await page.goto("/redesign/owner-dashboard/team/payroll");
    await expect(page.getByRole("heading", { name: "Payroll", exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "Prepare payroll", exact: true })).toContainText("Choose dates");
    await expect(page.getByText("Statutory rule package", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Prepare pay", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Choose dates", exact: true });
    await dialog.getByLabel("From", { exact: true }).fill(fixture.workDate);
    await dialog.getByLabel("Through", { exact: true }).fill(fixture.workDate);
    await dialog.getByLabel("Planned payday", { exact: true }).fill(fixture.workDate);
    await dialog.getByRole("button", { name: "Review pay", exact: true }).click();
    await expect(dialog).toBeHidden();
    const row = page.getByRole("listitem").filter({ has: page.getByText(fixture.employee.name, { exact: true }) });
    await expect(row.getByText("Draft", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Review pay", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Review pay", exact: true });
    await expect(dialog.getByText(/Government contributions and tax are not calculated automatically/)).toBeVisible();
    await dialog.getByRole("button", { name: "Add addition or deduction", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Add an adjustment", exact: true });
    await dialog.getByLabel("Amount", { exact: true }).fill("100");
    await dialog.getByLabel("Label", { exact: true }).fill("Synthetic travel allowance");
    await dialog.getByLabel("Reason", { exact: true }).fill("Owner approved this synthetic travel allowance");
    await dialog.getByRole("button", { name: "Save adjustment", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await fixture.client.query<{ gross: string }>(`SELECT gross FROM "PayrollStatement" WHERE business_id=$1`, [fixture.business.id])).rows[0]?.gross).toBe("1100.00");
    await row.getByRole("button", { name: "Review pay", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Review pay", exact: true });
    await expect(dialog.getByText("Manual amount", { exact: true })).toBeVisible();
    await waitForSheet(page);
    expect(await dialog.locator("strong").evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth))).toBe(true);
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("payroll-desktop-review.png"), fullPage: true });
    await dialog.getByLabel("I reviewed these earnings and deductions.", { exact: true }).check();
    await dialog.getByRole("button", { name: "Save payslip", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(row.getByText("Ready to pay", { exact: true })).toBeVisible();

    const persisted = await fixture.client.query<{ id: string; net: string; paid_amount: string; status: string; calculation_policy: string }>(`SELECT s.id,s.net,s.paid_amount,s.status,r.calculation_policy FROM "PayrollStatement" s JOIN "PayrollRun" r ON r.id=s.run_id WHERE s.business_id=$1`, [fixture.business.id]);
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0]).toMatchObject({ status: "PUBLISHED", net: "1100.00", paid_amount: "0.00", calculation_policy: "SIMPLE" });
    const statementId = persisted.rows[0].id;
    expect((await fixture.client.query(`SELECT count(*)::int AS count FROM "EmployeePayrollProfile" WHERE business_id=$1`, [fixture.business.id])).rows[0].count).toBe(0);
    expect((await fixture.client.query(`SELECT count(*)::int AS count FROM "PayrollAssessment" WHERE business_id=$1`, [fixture.business.id])).rows[0].count).toBe(0);
    const manual = await fixture.client.query<{ description: string; source: { manual: boolean; actorId: string; reason: string } }>(`SELECT description,source FROM "PayrollStatementLine" WHERE statement_id=$1 AND source->>'manual'='true'`, [statementId]);
    expect(manual.rows).toHaveLength(1);
    expect(manual.rows[0]).toMatchObject({ description: "Synthetic travel allowance", source: { manual: true, actorId: fixture.owner.id, reason: "Owner approved this synthetic travel allowance" } });
    const fixedSources = await fixture.client.query(`SELECT code,description,amount::text,source FROM "PayrollStatementLine" WHERE statement_id=$1 ORDER BY id`, [statementId]);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await row.getByRole("button", { name: "Record payment", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Record payment", exact: true });
    await dialog.getByLabel("Amount paid", { exact: true }).fill("400");
    await dialog.getByLabel("Payment reference or note", { exact: true }).fill("SYNTHETIC-SIMPLE-INSTALLMENT");
    await dialog.getByRole("button", { name: "Record payment", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(row.getByText("Partly paid", { exact: true })).toBeVisible();
    await expect(row.getByRole("button", { name: "View payslip", exact: true })).toBeFocused();
    const payment = await fixture.client.query<{ count: number; total: string }>(`SELECT count(*)::int AS count,sum(amount)::text AS total FROM "PayrollPayment" WHERE statement_id=$1`, [statementId]);
    expect(payment.rows[0]).toEqual({ count: 1, total: "400.00" });
    expect((await fixture.client.query(`SELECT code,description,amount::text,source FROM "PayrollStatementLine" WHERE statement_id=$1 ORDER BY id`, [statementId])).rows).toEqual(fixedSources.rows);
    await page.reload();
    await expect(row.getByText("Partly paid", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "View payslip", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Payslip", exact: true });
    const ownerPayslip = dialog.getByRole("region", { name: fixture.employee.name + " payslip", exact: true });
    await expect(ownerPayslip.getByText(/SYNTHETIC-SIMPLE-INSTALLMENT/)).toBeVisible();
    await waitForSheet(page);
    await page.screenshot({ path: testInfo.outputPath("payroll-mobile-payslip.png") });
    const ownerBreakdown = await ownerPayslip.getByRole("table").innerText();

    await page.getByRole("button", { name: "Close editor", exact: true }).click();
    await page.goto("/redesign/owner-dashboard/team/employees");
    await page.getByRole("button", { name: `Manage ${fixture.employee.name}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Pay settings", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Pay settings", exact: true });
    await expect(dialog.getByLabel("Daily rate", { exact: true })).toHaveValue("1000");
    await dialog.getByLabel("Daily rate", { exact: true }).fill("1200");
    await expect(dialog.getByLabel("Employment started", { exact: true })).toHaveCount(0);
    await dialog.getByLabel("Apply this pay from", { exact: true }).fill("2024-02-01");
    await dialog.getByRole("button", { name: "Save pay settings", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await fixture.client.query<{ matches: boolean }>(`SELECT (rate=1200) AS matches FROM "CompensationAgreement" WHERE business_id=$1 AND effective_from='2024-02-01'`, [fixture.business.id])).rows[0]?.matches).toBe(true);
    expect((await fixture.client.query(`SELECT daily_rate FROM "Employee" WHERE id=$1`, [fixture.employeeId])).rows[0].daily_rate).toBe(1000);
    expect((await fixture.client.query(`SELECT employment_start::text,employment_end FROM "Employee" WHERE id=$1`, [fixture.employeeId])).rows[0]).toEqual({ employment_start: "2023-12-01", employment_end: null });
    expect((await fixture.client.query(`SELECT code,description,amount::text,source FROM "PayrollStatementLine" WHERE statement_id=$1 ORDER BY id`, [statementId])).rows).toEqual(fixedSources.rows);
    expect((await fixture.client.query(`SELECT net::text,paid_amount::text FROM "PayrollStatement" WHERE id=$1`, [statementId])).rows[0]).toEqual({ net: "1100.00", paid_amount: "400.00" });

    await page.goto("/redesign/owner-dashboard/team/payroll");
    await page.getByRole("button", { name: "Payroll settings", exact: true }).click();
    await page.getByRole("button", { name: "Edit pay terms", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Pay settings", exact: true });
    await expect(dialog.getByLabel("Daily rate", { exact: true })).toHaveValue("1200");
    await expect(dialog.getByRole("region", { name: "Pay history", exact: true })).toContainText("2024-01-01");
    await expect(dialog.getByRole("region", { name: "Pay history", exact: true })).toContainText("2024-02-01");
    await expect(dialog.getByRole("button", { name: "Save pay settings", exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();

    await context.clearCookies();
    await login(page, fixture.employee.contactNumber);
    await page.goto(`/app/${fixture.business.slug}/my-pay?statement=${statementId}`);
    const employeePayslip = page.getByRole("region", { name: fixture.employee.name + " payslip", exact: true });
    await expect(employeePayslip).toBeVisible();
    await expect(employeePayslip.getByText("Partly paid", { exact: true })).toBeVisible();
    await expect(employeePayslip.getByText(/Government contributions and tax are not calculated automatically/)).toBeVisible();
    await expect.poll(() => employeePayslip.getByRole("table").innerText()).toBe(ownerBreakdown);
    await expect(employeePayslip.getByText(/SYNTHETIC-SIMPLE-INSTALLMENT/)).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    expect(runtimeErrors).toEqual([]);
  });
});
