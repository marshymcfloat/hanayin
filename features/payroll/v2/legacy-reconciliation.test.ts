import { expect, it, vi } from "vitest";
import type { Prisma } from "@/prisma/generated/prisma/client";
vi.mock("server-only", () => ({}));
import { assertLegacyReconciliationCurrent, legacyFinancialFingerprint } from "./legacy-reconciliation";
import { fingerprint } from "./command";

const original = { id: 1, employee_id: 2, starting_date: new Date("2026-01-01T00:00:00Z"), ending_date: new Date("2026-01-15T00:00:00Z"), released_at: null, comment: null, deduction: 10, status: "PENDING" as const, total_salary: 100, attendance_records: [{ id: 2 }, { id: 1 }], availed_services: [{ id: 4 }, { id: 3 }], employee: { user: { name: "Original name" } } };

it("ignores display changes and source ordering without changing preserved evidence", () => {
  const changed = { ...original, comment: "Updated note", employee: { user: { name: "Updated name" } }, attendance_records: [...original.attendance_records].reverse(), availed_services: [...original.availed_services].reverse() };
  expect(legacyFinancialFingerprint(changed)).toBe(legacyFinancialFingerprint(original));
  expect(original.attendance_records.map(source => source.id)).toEqual([2, 1]);
});

it("detects changes in financial amounts, paid status, dates, or allocated sources", () => {
  for (const change of [{ total_salary: 101 }, { deduction: 11 }, { status: "PAID" as const }, { released_at: new Date("2026-01-16T00:00:00Z") }, { availed_services: [{ id: 5 }] }]) {
    expect(legacyFinancialFingerprint({ ...original, ...change })).not.toBe(legacyFinancialFingerprint(original));
  }
});

it("checks older checkpoints with their preserved display name, without accepting changed pay", async () => {
  const current = { ...original, employee: { user: { name: "Renamed employee" } } };
  const tx = { payrollStatement: { findMany: vi.fn().mockResolvedValue([{ legacy_payslip_id: original.id, review_hash: fingerprint(original), snapshot: { employeeName: original.employee.user.name } }]) }, payslip: { findMany: vi.fn().mockResolvedValue([current]) } };
  await expect(assertLegacyReconciliationCurrent(tx as unknown as Prisma.TransactionClient, "business")).resolves.toBeUndefined();
  tx.payslip.findMany.mockResolvedValue([{ ...current, total_salary: 101 }]);
  await expect(assertLegacyReconciliationCurrent(tx as unknown as Prisma.TransactionClient, "business")).rejects.toThrow("Historical payslips changed");
});
