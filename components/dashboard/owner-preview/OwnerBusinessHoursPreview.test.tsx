import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerBusinessHoursPreviewData } from "@/features/businesses/types/owner-business-hours-preview";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/features/businesses/actions/business-hours", () => ({ updateBusinessHours: mocks.update }));
import { OwnerBusinessHoursPreview } from "./OwnerBusinessHoursPreview";

const first: OwnerBusinessHoursPreviewData = {
  businessName: "BeautyFeel",
  serviceCategories: ["Skin"],
  hours: [{ day_of_week: 1, category: "Skin", open_time: "09:00", close_time: "17:00", is_closed: false }],
};
const changed: OwnerBusinessHoursPreviewData = {
  ...first,
  hours: [{ ...first.hours[0], open_time: "10:00" }],
};

const props = { businessSlug: "beautyfeel", refreshControl: <button type="button">Refresh</button>, onSaved: vi.fn().mockResolvedValue(true) };

describe("OwnerBusinessHoursPreview draft protection", () => {
  beforeEach(() => { vi.clearAllMocks(); props.onSaved.mockResolvedValue(true); });

  it("adopts background data when pristine but preserves unsaved edits with a server-update notice", () => {
    const view = render(<OwnerBusinessHoursPreview {...props} data={first} />);
    const opening = () => screen.getByLabelText("Monday opening time") as HTMLInputElement;
    expect(opening()).toHaveValue("09:00");
    view.rerender(<OwnerBusinessHoursPreview {...props} data={changed} />);
    expect(opening()).toHaveValue("10:00");
    fireEvent.change(opening(), { target: { value: "11:00" } });
    view.rerender(<OwnerBusinessHoursPreview {...props} data={first} />);
    expect(opening()).toHaveValue("11:00");
    expect(screen.getByText(/The server changed an edited time/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save business hours" })).toBeDisabled();
  });

  it("retains the draft when save fails and clears it only after a confirmed refetch", async () => {
    mocks.update.mockResolvedValueOnce({ success: false, error: "Save failed" }).mockResolvedValueOnce({ success: true });
    const view = render(<OwnerBusinessHoursPreview {...props} data={first} />);
    const opening = () => screen.getByLabelText("Monday opening time") as HTMLInputElement;
    fireEvent.change(opening(), { target: { value: "11:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save business hours" }));
    await waitFor(() => expect(screen.getByText("Save failed")).toBeInTheDocument());
    expect(opening()).toHaveValue("11:00");
    expect(props.onSaved).not.toHaveBeenCalled();
    props.onSaved.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Save business hours" }));
    await waitFor(() => expect(screen.getByText(/could not be reloaded/)).toBeInTheDocument());
    expect(opening()).toHaveValue("11:00");
    view.rerender(<OwnerBusinessHoursPreview {...props} data={changed} />);
    expect(opening()).toHaveValue("11:00");
  });

  it("disables schedule changes while save is pending", async () => {
    let resolveUpdate!: (value: { success: true }) => void;
    mocks.update.mockReturnValue(new Promise((resolve) => { resolveUpdate = resolve; }));
    render(<OwnerBusinessHoursPreview {...props} data={first} />);
    fireEvent.click(screen.getByRole("button", { name: "Save business hours" }));
    expect(screen.getByRole("switch", { name: "Close Monday" })).toBeDisabled();
    expect(screen.getByLabelText("Monday opening time")).toBeDisabled();
    resolveUpdate({ success: true });
    await waitFor(() => expect(screen.getByText("Business hours saved.")).toBeInTheDocument());
  });

  it("rebases untouched categories onto the latest server data before saving", async () => {
    mocks.update.mockResolvedValue({ success: true });
    const initial = { ...first, serviceCategories: ["Skin", "Hair"], hours: [...first.hours, { day_of_week: 1, category: "Hair", open_time: "08:00", close_time: "16:00", is_closed: false }] };
    const updated = { ...initial, hours: [initial.hours[0], { ...initial.hours[1], open_time: "10:00" }] };
    const view = render(<OwnerBusinessHoursPreview {...props} data={initial} />);
    fireEvent.change(screen.getByLabelText("Monday opening time"), { target: { value: "11:00" } });
    view.rerender(<OwnerBusinessHoursPreview {...props} data={updated} />);
    expect(screen.getByText(/Untouched hours use the latest server values/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save business hours" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    const saved = mocks.update.mock.calls[0][1] as Array<{ category: string; day_of_week: number; open_time: string }>;
    expect(saved.find((day) => day.category === "Skin" && day.day_of_week === 1)?.open_time).toBe("11:00");
    expect(saved.find((day) => day.category === "Hair" && day.day_of_week === 1)?.open_time).toBe("10:00");
  });

  it("requires explicit review before saving a field changed on the server", () => {
    const view = render(<OwnerBusinessHoursPreview {...props} data={first} />);
    fireEvent.change(screen.getByLabelText("Monday opening time"), { target: { value: "11:00" } });
    view.rerender(<OwnerBusinessHoursPreview {...props} data={changed} />);
    expect(screen.getByRole("button", { name: "Save business hours" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Keep my edits over latest" }));
    expect(screen.getByRole("button", { name: "Save business hours" })).toBeEnabled();
    expect(screen.getByLabelText("Monday opening time")).toHaveValue("11:00");
  });
});
