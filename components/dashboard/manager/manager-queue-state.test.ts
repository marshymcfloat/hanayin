import { describe, expect, it } from "vitest";
import { AvailedServiceStatus } from "@/prisma/generated/prisma/enums";
import {
  applyPendingManagerTransitions,
  restoreManagerQueueItem,
  transitionManagerQueue,
  type ManagerQueueData,
} from "./manager-queue-state";

const original = (): ManagerQueueData => ({
  employees: [{ id: 7, specialties: ["Nails"], user: { name: "Ana" } }],
  services: [1, 2].map((id) => ({
    id,
    status: AvailedServiceStatus.PENDING,
    price: 280,
    scheduled_at: null,
    package: null,
    service: { name: `Service ${id}`, category: "Nails", duration: 60 },
    served_by_id: null,
    served_by: null,
    booking: { customer: { name: "Customer" }, scheduled_at: null, created_at: new Date("2026-08-29T09:00:00Z") },
  })),
});

describe("manager queue optimistic state", () => {
  it("moves an assignment immediately and restores only the failed item", () => {
    const snapshot = original();
    const first = transitionManagerQueue(snapshot, { serviceId: 1, status: AvailedServiceStatus.CLAIMED, assigneeId: 7 });
    const second = transitionManagerQueue(first, { serviceId: 2, status: AvailedServiceStatus.COMPLETED, assigneeId: 7 });
    const rolledBack = restoreManagerQueueItem(second, snapshot, 1);
    expect(rolledBack.services.find((item) => item.id === 1)).toEqual(snapshot.services[0]);
    expect(rolledBack.services.find((item) => item.id === 2)?.status).toBe(AvailedServiceStatus.COMPLETED);
  });

  it("retains a second pending transition when a server refetch arrives", () => {
    const fetched = original();
    const merged = applyPendingManagerTransitions(fetched, [
      { serviceId: 2, status: AvailedServiceStatus.CLAIMED, assigneeId: 7 },
    ]);
    expect(merged.services.find((item) => item.id === 2)?.served_by?.user.name).toBe("Ana");
    expect(merged.services.find((item) => item.id === 2)?.status).toBe(AvailedServiceStatus.CLAIMED);
  });
});
