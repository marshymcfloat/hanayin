import { describe, expect, it, vi } from "vitest";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import type { Prisma } from "@/prisma/generated/prisma/client";

vi.mock("@/prisma/prisma", () => ({ prisma: {} }));

import { getVerifiedOwnerPreviewBusinessName } from "./owner-preview";

const context = {
  success: true,
  actorType: "OWNER",
  role: "OWNER",
  ownerId: 7,
  userId: "owner-a",
  businessId: "business-a",
  businessSlug: "studio-a",
  employeeId: null,
  profile: null,
  permissions: [],
  businessPolicy: {
    structure: "OWNER_EMPLOYEE_SELF_SERVICE",
    allowEmployeeSelfBooking: true,
    managerCanServe: true,
  },
} as OwnerActorContext;

describe("verified owner preview business name", () => {
  it("selects the name only through the persisted owner and tenant membership", async () => {
    const findFirst = vi.fn().mockResolvedValue({ name: "Studio A" });
    const db = { business: { findFirst } } as unknown as Pick<Prisma.TransactionClient, "business">;

    expect(await getVerifiedOwnerPreviewBusinessName(context, db)).toEqual({ name: "Studio A" });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "business-a",
        slug: "studio-a",
        owners: {
          some: {
            id: 7,
            user_id: "owner-a",
            business_id: "business-a",
            user: { role: "OWNER" },
          },
        },
      },
      select: { name: true },
    });
  });

  it("returns no business if current membership is absent", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const db = { business: { findFirst } } as unknown as Pick<Prisma.TransactionClient, "business">;
    expect(await getVerifiedOwnerPreviewBusinessName(context, db)).toBeNull();
  });
});
