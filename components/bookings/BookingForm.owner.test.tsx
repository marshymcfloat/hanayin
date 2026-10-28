import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Service } from "@/prisma/generated/prisma/client";

const mocks = vi.hoisted(() => ({ create: vi.fn(), onSuccess: vi.fn(), onOwnerSubmit: vi.fn(), duplicate: vi.fn(), toastError: vi.fn() }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ businessSlug: "beautyfeel" }),
  useRouter: () => ({ back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/features/bookings/actions/booking", () => ({ createBooking: mocks.create }));
vi.mock("@/features/bookings/actions/availability", () => ({
  getAvailableSlots: vi.fn().mockResolvedValue([]),
  getAlternativeSlots: vi.fn().mockResolvedValue([]),
  getAvailableProviders: vi.fn().mockResolvedValue([]),
  getDayCapacityRange: vi.fn().mockResolvedValue({}),
  checkCategoryAvailability: vi.fn().mockResolvedValue({ hasBusinessHours: true, businessHoursPassed: false, qualifiedEmployeeCount: 1, qualifiedOwnerCount: 0, qualifiedProviderCount: 1 }),
}));
vi.mock("@/features/bookings/actions/booking-policy", () => ({ getBookingPolicy: vi.fn().mockResolvedValue({ slotIntervalMinutes: 30, bookingHorizonDays: 14, bookingV2Enabled: true, downpaymentPercentage: 50 }) }));
vi.mock("@/features/catalog/actions/sale-event", () => ({ getActiveSaleEvents: vi.fn().mockResolvedValue({ success: true, data: [] }) }));
vi.mock("@/features/catalog/actions/vouchers", () => ({ verifyVoucherAction: vi.fn() }));
vi.mock("@/features/catalog/actions/flow-actions", () => ({ getCustomerPendingFlows: vi.fn().mockResolvedValue([]) }));
vi.mock("@/features/customers/actions/customer", () => ({ searchCustomer: vi.fn(), findDuplicateCustomerForBooking: mocks.duplicate }));
vi.mock("@/features/bookings/actions/booking-otp", () => ({ resolveCustomerTrust: vi.fn(), requestBookingOtp: vi.fn(), verifyBookingOtp: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn(), info: vi.fn(), message: vi.fn() } }));

import BookingForm from "./BookingForm";

const service = { id: 1, name: "Manicure", category: "Nails", price: 280, duration: 60 } as Service;

beforeEach(() => {
  mocks.create.mockReset();
  mocks.duplicate.mockReset();
  mocks.onOwnerSubmit.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

function renderDelegatedOwnerForm(open = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const form = (ownerFormOpen: boolean) => <QueryClientProvider client={client}><BookingForm presentation="owner" services={[service]} categories={["Nails"]} isEmployee allowServiceClaim isModal ownerFormOpen={ownerFormOpen} onOwnerSubmit={mocks.onOwnerSubmit} /></QueryClientProvider>;
  const view = render(form(open));
  return { view, form };
}

async function fillReviewedNewCustomer(confirm = true) {
  fireEvent.click(screen.queryByRole("option", { name: /Manicure/i }) ?? screen.getByRole("button", { name: "Add Manicure" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Continue" })[0]);
  fireEvent.click(screen.getByRole("switch", { name: "Walk-in booking" }));
  fireEvent.click(screen.getByRole("button", { name: "New" }));
  fireEvent.change(screen.getByRole("textbox", { name: /Full name/i }), { target: { value: "Mila Santos" } });
  fireEvent.change(screen.getByRole("textbox", { name: /Email/i }), { target: { value: "mila@example.test" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Continue" })[0]);
  await screen.findByRole("region", { name: "Booking checkout review" });
  if (confirm) fireEvent.click(document.getElementById("confirm-booking-details")!);
}

describe("owner booking form", () => {
  it("uses the verified slug for the redesigned flow and delegates a real payload after review", async () => {
    mocks.duplicate.mockResolvedValue({ success: true, data: null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><BookingForm businessSlug="verified-studio" bookingDesign="redesign" presentation="owner" services={[service]} categories={["Nails"]} isEmployee isModal onOwnerSubmit={mocks.onOwnerSubmit} /></QueryClientProvider>);
    expect(screen.getByRole("heading", { name: "Your selection" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to schedule" })).toBeDisabled();
    await fillReviewedNewCustomer();
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(mocks.onOwnerSubmit).toHaveBeenCalledOnce());
    expect(mocks.onOwnerSubmit).toHaveBeenCalledWith(expect.objectContaining({ businessSlug: "verified-studio", services: expect.arrayContaining([expect.objectContaining({ id: 1 })]) }));
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("renders the shell while only the catalog is pending and preserves the form on resolution", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (pending: boolean) => <QueryClientProvider client={client}><BookingForm presentation="owner" services={pending ? [] : [service]} categories={pending ? [] : ["Nails"]} catalogPending={pending} isEmployee allowServiceClaim isModal onOwnerSubmit={mocks.onOwnerSubmit} /></QueryClientProvider>;
    const view = render(tree(true));
    const form = document.querySelector("form");
    expect(screen.getByRole("list", { name: "Booking progress" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Choose services" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Booking summary" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading service catalog" })).toBeInTheDocument();
    for (const label of ["Services", "Schedule", "Customer", "Review"]) {
      expect(screen.getByRole("button", { name: new RegExp(label + "$") })).toBeDisabled();
    }
    expect(screen.getAllByRole("button", { name: "Continue" }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.queryByRole("option", { name: /Manicure/i })).not.toBeInTheDocument();
    view.rerender(tree(false));
    expect(document.querySelector("form")).toBe(form);
    expect(screen.queryByRole("status", { name: "Loading service catalog" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /Manicure/i }));
    expect(screen.getAllByRole("button", { name: "Continue" }).every((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
  });

  it("does not delegate a valid form submitted before review confirmation", async () => {
    mocks.duplicate.mockResolvedValue({ success: true, data: null });
    renderDelegatedOwnerForm();
    await fillReviewedNewCustomer(false);
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(screen.getByText("Confirm these details to continue.")).toBeInTheDocument());
    expect(mocks.onOwnerSubmit).not.toHaveBeenCalled();
    expect(mocks.duplicate).not.toHaveBeenCalled();
  });

  it("keeps the catalog ahead of selections and updates units and estimated total from one quantity control", () => {
    renderDelegatedOwnerForm();
    const catalog = screen.getByRole("region", { name: "Choose services or packages" });
    fireEvent.click(screen.getByRole("option", { name: /Manicure/i }));
    const selected = screen.getByRole("region", { name: "Selected treatments" });
    expect(catalog.compareDocumentPosition(selected) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("1 treatment unit")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Increase Manicure quantity" })[0]);
    expect(screen.getByText("2 treatment units")).toBeInTheDocument();
    expect(screen.getAllByText("₱560.00").length).toBeGreaterThan(0);
  });

  it("validates before delegation and waits for duplicate confirmation", async () => {
    mocks.duplicate.mockResolvedValue({ success: true, data: { id: "customer-1", name: "Mila Existing", email: "mila@example.test", phone: null, matchedOn: "email", nameMismatch: true } });
    renderDelegatedOwnerForm();
    fireEvent.submit(document.querySelector("form")!);
    expect(mocks.onOwnerSubmit).not.toHaveBeenCalled();
    await fillReviewedNewCustomer();
    fireEvent.submit(document.querySelector("form")!);
    expect(await screen.findByText("Possible duplicate customer")).toBeInTheDocument();
    expect(mocks.onOwnerSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use existing customer" }));
    expect(mocks.onOwnerSubmit).toHaveBeenCalledOnce();
    expect(mocks.onOwnerSubmit.mock.calls[0][0]).toEqual(expect.objectContaining({ customerId: "customer-1", customerName: "Mila Existing" }));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("drops a late duplicate result after the owner closes the form", async () => {
    let resolveLookup!: (value: { success: boolean; data: null }) => void;
    mocks.duplicate.mockReturnValue(new Promise((resolve) => { resolveLookup = resolve; }));
    const { view, form } = renderDelegatedOwnerForm();
    await fillReviewedNewCustomer();
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(mocks.duplicate).toHaveBeenCalledOnce());
    view.rerender(form(false));
    await act(async () => resolveLookup({ success: true, data: null }));
    expect(mocks.onOwnerSubmit).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("does not submit when the owner duplicate check fails", async () => {
    mocks.duplicate.mockRejectedValue(new Error("unavailable"));
    renderDelegatedOwnerForm();
    await fillReviewedNewCustomer();
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Could not check for an existing customer. Please try again."));
    expect(mocks.onOwnerSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Booking checkout review" })).toBeInTheDocument();
  });

  it("does not dispatch a duplicate result after owner scope unmounts", async () => {
    let resolveLookup!: (value: { success: boolean; data: null }) => void;
    mocks.duplicate.mockReturnValue(new Promise((resolve) => { resolveLookup = resolve; }));
    const { view } = renderDelegatedOwnerForm();
    await fillReviewedNewCustomer();
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(mocks.duplicate).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => resolveLookup({ success: true, data: null }));
    expect(mocks.onOwnerSubmit).not.toHaveBeenCalled();
  });

  it("requires review confirmation and keeps the form available after a failed mocked submit", async () => {
    mocks.create.mockReset();
    mocks.onSuccess.mockReset();
    mocks.toastError.mockReset();
    let resolveSuccess: ((value: { type: "internal"; url: string }) => void) | undefined;
    mocks.create
      .mockResolvedValueOnce({ type: "error", code: "BOOKING_FAILED" })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSuccess = resolve; }));

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BookingForm presentation="owner" services={[service]} categories={["Nails"]} isEmployee allowServiceClaim isModal onSuccess={mocks.onSuccess} />
      </QueryClientProvider>,
    );

    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("option", { name: /Manicure/i }));
    fireEvent.click(screen.getAllByRole("button", { name: "Continue" })[0]);
    fireEvent.click(screen.getByRole("switch", { name: "Walk-in booking" }));
    fireEvent.click(screen.getByRole("button", { name: "Walk-in" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Continue" })[0]);

    expect(screen.getByRole("region", { name: "Booking checkout review" })).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Review & confirm" }));
    expect(screen.getByText("Confirm these details to continue.")).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.click(document.getElementById("confirm-booking-details")!);
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.onSuccess).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expect.stringMatching(/couldn't create the booking/i)));

    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Processing..." }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true));
    expect(mocks.onSuccess).not.toHaveBeenCalled();
    await act(async () => { resolveSuccess?.({ type: "internal", url: "/app/beautyfeel/bookings" }); });
    await waitFor(() => expect(mocks.onSuccess).toHaveBeenCalledOnce());
    expect(mocks.create.mock.calls[0][0]).toEqual(expect.objectContaining({
      businessSlug: "beautyfeel",
      isAnonymousWalkIn: true,
      services: [expect.objectContaining({ id: 1, quantity: 1, claimedByCurrentEmployee: false })],
    }));
  });
});
