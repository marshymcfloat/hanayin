import { expect, it, vi } from "vitest";
import { saveBookingPolicy } from "./booking-policy";
import type { OwnerActorContext } from "@/lib/auth/owner-access";

const transaction = vi.hoisted(() => vi.fn());
vi.mock("@/prisma/prisma", () => ({ prisma: { $transaction: transaction } }));

it("denies a non-owner actor even when called directly outside the action", async () => {
  expect(await saveBookingPolicy({ actorType: "EMPLOYEE" } as unknown as OwnerActorContext, {})).toEqual({ success: false, error: "Forbidden" });
  expect(transaction).not.toHaveBeenCalled();
});
