import { expect, it, vi } from "vitest";
import { replaceOwnerPermissions, switchPrimaryOwner } from "./owner-administration";
import type { OwnerActorContext } from "@/lib/auth/owner-access";

const transaction = vi.hoisted(() => vi.fn());
vi.mock("@/prisma/prisma", () => ({ prisma: { $transaction: transaction } }));

it("denies non-owner actors when use cases are invoked directly", async () => {
  const context = { actorType: "EMPLOYEE" } as unknown as OwnerActorContext;
  expect(await replaceOwnerPermissions(context, 1, [])).toEqual({ result: { success: false, error: "Forbidden" }, changed: false });
  expect(await switchPrimaryOwner(context, 1)).toEqual({ result: { success: false, error: "Forbidden" }, changed: false });
  expect(transaction).not.toHaveBeenCalled();
});
