import { describe, expect, it, vi } from "vitest";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import type { Prisma } from "@/prisma/generated/prisma/client";

vi.mock("@/prisma/prisma", () => ({ prisma: {} }));
import { getOwnerBusinessHoursPreviewData } from "./owner-business-hours-preview";

const actor = { businessId: "business-a", businessSlug: "beautyfeel", userId: "owner-a", ownerId: 7 } as OwnerActorContext;

describe("owner business-hours preview read", () => {
  it("reads a narrow tenant and persisted-owner-scoped DTO", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      name: "BeautyFeel",
      services: [{ category: "Skin" }],
      business_hours: [{ day_of_week: 1, category: "Hair", open_time: "09:00", close_time: "17:00", is_closed: false, id: 99, business_id: "private" }],
    });
    const db = { business: { findFirst } } as unknown as Pick<Prisma.TransactionClient, "business">;
    expect(await getOwnerBusinessHoursPreviewData(actor, db)).toEqual({
      businessName: "BeautyFeel",
      serviceCategories: ["Hair", "Skin"],
      hours: [{ day_of_week: 1, category: "Hair", open_time: "09:00", close_time: "17:00", is_closed: false }],
    });
    expect(findFirst.mock.calls[0][0].where).toEqual({
      id: "business-a", slug: "beautyfeel",
      owners: { some: { id: 7, user_id: "owner-a", business_id: "business-a", user: { role: "OWNER" } } },
    });
    expect(findFirst.mock.calls[0][0].select.business_hours.select).toEqual({ day_of_week: true, open_time: true, close_time: true, is_closed: true, category: true });
  });

  it("returns nothing when the owner membership no longer exists", async () => {
    const db = { business: { findFirst: vi.fn().mockResolvedValue(null) } } as unknown as Pick<Prisma.TransactionClient, "business">;
    expect(await getOwnerBusinessHoursPreviewData(actor, db)).toBeNull();
  });
});
