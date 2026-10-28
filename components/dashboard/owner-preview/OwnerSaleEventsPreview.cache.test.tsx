import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerSaleEventPreviewData, OwnerSaleEventPreviewEvent } from "@/features/catalog/types/owner-sale-event-preview";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), publish: vi.fn(), retry: vi.fn() }));
vi.mock("@/features/catalog/actions/owner-sale-event-preview", () => ({
  createOwnerSaleEventPreviewAction: mocks.create,
  updateOwnerSaleEventPreviewAction: mocks.update,
  deleteOwnerSaleEventPreviewAction: mocks.remove,
}));
vi.mock("@/features/social/actions/social", () => ({
  publishSocialPostAction: mocks.publish,
  retrySocialPostTargetAction: mocks.retry,
}));

import { OwnerSaleEventsPreview } from "./OwnerSaleEventsPreview";

const data: OwnerSaleEventPreviewData = {
  section: "sale-events", generatedAt: "2026-09-25T00:00:00.000Z", now: "2026-09-25T00:00:00.000Z",
  business: { slug: "beautyfeel", name: "BeautyFeel" }, events: [],
  availableServices: [{ id: 1, name: "Facial", category: "Spa" }], availablePackages: [],
  connectedPlatforms: [], socialPublishingEnabled: false,
  metrics: { total: 0, active: 0, upcoming: 0, ended: 0, bookings: 0, attention: 0 },
};

beforeEach(() => vi.clearAllMocks());

describe("sale event optimistic reconciliation", () => {
  it("removes a temporary create row after success even if the follow-up read fails", async () => {
    let resolve!: (value: unknown) => void;
    mocks.create.mockReturnValue(new Promise((done) => { resolve = done; }));
    const changed = vi.fn();
    render(<OwnerSaleEventsPreview result={{ success: true, data }} onChanged={changed} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Create sale event" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Create sale event" });
    fireEvent.change(within(dialog).getByLabelText("Event title"), { target: { value: "New offer" } });
    fireEvent.click(within(dialog).getByLabelText("Facial"));
    fireEvent.submit(document.getElementById("sale-event-form")!);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("heading", { name: "New offer", hidden: true })).toBeInTheDocument();
    await act(async () => resolve({ success: true }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "New offer", hidden: true })).not.toBeInTheDocument());
    expect(changed).toHaveBeenCalledWith(undefined);
    expect(screen.getByText(/Sale event created\. Refresh to see the saved offer/)).toBeInTheDocument();
  });

  it("does not offer a second publish action for an in-progress linked post", () => {
    const event: OwnerSaleEventPreviewEvent = {
      id: 3, title: "Offer", description: null, startDate: data.now, endDate: "2026-10-01T00:00:00.000Z",
      status: "active", discountType: "PERCENTAGE", discountValue: 10, slotLimit: null, bookings: 0,
      services: data.availableServices, packages: [],
      socialPosts: [{ id: "post-1", title: "Linked post", status: "PUBLISHING", lastError: null, publishedAt: null,
        targets: [{ id: "target-1", platform: "FACEBOOK_PAGE", status: "QUEUED", lastError: null }] }],
    };
    render(<OwnerSaleEventsPreview result={{ success: true, data: { ...data, events: [event] } }} />);
    fireEvent.click(screen.getByRole("button", { name: /View.*Offer|Details/ }));
    expect(screen.queryByRole("button", { name: "Publish post" })).not.toBeInTheDocument();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
