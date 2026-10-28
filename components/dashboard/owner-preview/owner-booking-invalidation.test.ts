import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { invalidateOwnerBookingViews } from "@/components/dashboard/owner-preview/owner-booking-invalidation";
import { ownerPreviewKeys } from "@/components/dashboard/owner-preview/owner-preview-query";

describe("owner booking invalidation", () => {
  it("refreshes redesigned analytics within the same verified identity", () => {
    const identity = { userId: "u1", businessId: "b1", businessSlug: "studio", businessName: "Studio", ownerName: "Owner" };
    const invalidateQueries = vi.fn();
    invalidateOwnerBookingViews({ invalidateQueries } as unknown as QueryClient, identity);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "redesign") });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "today") });
  });
});
