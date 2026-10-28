import { expect, it } from "vitest";
import { currentPayTerms, paySettingsDraft, type PaySettingsEmployee } from "@/features/payroll/pay-settings";

const employee: PaySettingsEmployee = { id: 1, name: "Ana", revision: 3, agreements: [
  { id: "future", from: "2027-01-01", to: null, basis: "DAILY", rate: "900", hours: "8", commissionRate: "10" },
  { id: "current", from: "2026-01-01", to: "2026-12-31", basis: "DAILY", rate: "600", hours: "8", commissionRate: "5" },
] };
it("uses the rate effective on the selected date, not the newest future rate", () => {
  expect(currentPayTerms(employee, "2026-10-19")?.rate).toBe("600");
  expect(paySettingsDraft(employee, "2026-10-19")).toMatchObject({ rate: "600", from: "2026-10-19", expectedRevision: 3 });
  expect(paySettingsDraft(employee, "2026-10-19")).not.toHaveProperty("employmentStart");
});
it("does not infer a joining date and starts future hires no earlier than their recorded date", () => {
  expect(paySettingsDraft({ ...employee, agreements: [] }, "2026-10-19")).not.toHaveProperty("employmentStart");
  expect(paySettingsDraft({ ...employee, employmentStart: "2026-11-01" }, "2026-10-19").from).toBe("2026-11-01");
});
it("keeps missing pay distinct from zero pay", () => {
  expect(paySettingsDraft({ ...employee, agreements: [] }, "2026-10-19").rate).toBe("");
  expect(paySettingsDraft({ ...employee, agreements: [{ ...employee.agreements[1], rate: "0" }] }, "2026-10-19").rate).toBe("0");
});
