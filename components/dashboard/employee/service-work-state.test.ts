import { describe, expect, it } from "vitest";
import {
  applyPendingServiceWorkTransitions,
  restoreServiceWorkItem,
  transitionServiceWork,
  type EmployeeServiceWorkData,
  type EmployeeServiceWorkItem,
} from "./service-work-state";

const item = (id: number, status: string): EmployeeServiceWorkItem => ({
  id,
  updated_at: new Date("2026-08-29T09:00:00+08:00"),
  service: { id, name: `Service ${id}`, duration: 60, category: "Nails" },
  booking: {
    customer: { name: "Customer" },
    scheduled_at: new Date("2026-08-29T10:00:00+08:00"),
    created_at: new Date("2026-08-29T08:00:00+08:00"),
    downpayment: null,
    downpayment_status: null,
    grand_total: 280,
    amount_paid: 280,
    payment_status: "PAID",
  },
  scheduled_at: new Date("2026-08-29T10:00:00+08:00"),
  price: 280,
  status,
  package_id: null,
  package: null,
});

const initial = (): EmployeeServiceWorkData => ({
  pending: [item(1, "PENDING")],
  active: [item(2, "CLAIMED")],
  completed: [item(3, "COMPLETED")],
});

describe("employee service-work optimistic state", () => {
  it.each([
    ["claim", 1, "active", "CLAIMED"],
    ["unclaim", 2, "pending", "PENDING"],
    ["complete", 2, "completed", "COMPLETED"],
    ["unserve", 3, "active", "CLAIMED"],
  ] as const)("applies %s immediately", (transition, id, destination, status) => {
    const result = transitionServiceWork(initial(), id, transition);

    expect(result[destination].find((service) => service.id === id)?.status).toBe(status);
    expect(
      Object.values(result).flat().filter((service) => service.id === id),
    ).toHaveLength(1);
  });

  it("rolls back only the failed service and preserves another optimistic update", () => {
    const snapshot = initial();
    const first = transitionServiceWork(snapshot, 1, "claim");
    const concurrent = transitionServiceWork(first, 2, "complete");
    const rolledBack = restoreServiceWorkItem(concurrent, snapshot, 1);

    expect(rolledBack.pending.some((service) => service.id === 1)).toBe(true);
    expect(rolledBack.completed.some((service) => service.id === 2)).toBe(true);
  });

  it("replaces optimistic fields with the snapshot during rollback", () => {
    const snapshot = initial();
    const optimistic = transitionServiceWork(snapshot, 1, "claim", {
      final_price: 200,
      discount: 80,
    });
    const rolledBack = restoreServiceWorkItem(optimistic, snapshot, 1);

    expect(rolledBack.pending[0]).toEqual(snapshot.pending[0]);
  });

  it("reapplies only still-pending transitions to a polled server result", () => {
    const snapshot = initial();
    const pending = [
      { serviceId: 1, transition: "claim" as const },
      { serviceId: 2, transition: "complete" as const },
    ];
    const polled = applyPendingServiceWorkTransitions(snapshot, pending);
    expect(polled.active.some((service) => service.id === 1)).toBe(true);
    expect(polled.completed.some((service) => service.id === 2)).toBe(true);

    const secondStillPending = applyPendingServiceWorkTransitions(snapshot, pending.slice(1));
    const rolledBack = restoreServiceWorkItem(secondStillPending, snapshot, 1);
    expect(rolledBack.pending.some((service) => service.id === 1)).toBe(true);
    expect(rolledBack.completed.some((service) => service.id === 2)).toBe(true);
  });
});
