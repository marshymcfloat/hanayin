import { expect, it, vi } from "vitest";
import { saveBusinessHours } from "./business-hours";
import type { OwnerActorContext } from "@/lib/auth/owner-access";

const transaction = vi.hoisted(() => vi.fn());
vi.mock("@/prisma/prisma", () => ({ prisma: { $transaction: transaction } }));
vi.mock("@/lib/services/booking-conflicts", () => ({ detectAndEmitFutureBookingConflicts: vi.fn() }));

it("denies a non-owner actor even when called directly outside the action", async () => {
  expect(await saveBusinessHours({ actorType: "EMPLOYEE" } as unknown as OwnerActorContext, [])).toEqual({ success: false, error: "Forbidden" });
  expect(transaction).not.toHaveBeenCalled();
});
