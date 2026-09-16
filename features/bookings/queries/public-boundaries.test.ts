import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/prisma/prisma", () => ({ prisma: { booking: { findFirst: mocks.findFirst } } }));
import { getPublicBookingDetails } from "@/features/bookings/queries/public-details";
import { getPublicBookingSuccess } from "@/features/bookings/queries/public-success";

beforeEach(() => { vi.resetAllMocks(); mocks.findFirst.mockResolvedValue(null); });

it.each([getPublicBookingDetails, getPublicBookingSuccess])("scopes a public booking lookup by id and business slug", async (load) => {
  await load("tenant", 42);
  expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 42, business: { slug: "tenant" } } }));
});
