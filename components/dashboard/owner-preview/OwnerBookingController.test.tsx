import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { OwnerBookingControllerProvider, useOwnerBookingController } from "./OwnerBookingController";

const mocks = vi.hoisted(() => ({
  pathname: "/app/beautyfeel/bookings",
  identity: { userId: "owner-a", businessId: "business-a", businessSlug: "beautyfeel" },
  createBooking: vi.fn(),
  invalidate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastMessage: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("./OwnerPreviewQueryProvider", () => ({ useOwnerPreviewContext: () => mocks.identity }));
vi.mock("@/features/bookings/actions/booking", () => ({ createBooking: mocks.createBooking }));
vi.mock("./owner-booking-invalidation", () => ({ invalidateOwnerBookingViews: mocks.invalidate }));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError, message: mocks.toastMessage } }));
vi.mock("./OwnerPreviewBookingQuickPanel", () => ({
  OwnerPreviewBookingQuickPanel: ({ open, onOwnerSubmit, bookingSession, businessSlug }: {
    open: boolean;
    bookingSession: number;
    businessSlug: string;
    onOwnerSubmit: (payload: { businessSlug: string }) => void;
  }) => <div role="dialog" hidden={!open} data-session={bookingSession}><input key={bookingSession} aria-label="Customer name" defaultValue="" /><button type="button" onClick={() => onOwnerSubmit({ businessSlug })}>Submit booking</button></div>,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function Controls() {
  const { openBooking, pending, recoveryAvailable } = useOwnerBookingController();
  return <><button type="button" onClick={() => openBooking()}>New booking</button><output data-testid="pending">{String(pending)}</output><output data-testid="recovery">{String(recoveryAvailable)}</output></>;
}

function harness(key = "owner-a") {
  const client = new QueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}><OwnerBookingControllerProvider key={key}>{children}</OwnerBookingControllerProvider></QueryClientProvider>;
  }
  return render(<Controls />, { wrapper: Wrapper });
}

beforeEach(() => {
  mocks.pathname = "/app/beautyfeel/bookings";
  mocks.identity = { userId: "owner-a", businessId: "business-a", businessSlug: "beautyfeel" };
  mocks.createBooking.mockReset();
  mocks.invalidate.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
  mocks.toastMessage.mockReset();
});

describe("owner booking controller", () => {
  it("closes immediately, guards duplicate requests, and invalidates only after confirmed success", async () => {
    const request = deferred<{ type: "internal"; url: string }>();
    mocks.createBooking.mockReturnValue(request.promise);
    harness();
    fireEvent.click(screen.getByRole("button", { name: "New booking" }));
    expect(await screen.findByRole("dialog")).toHaveAttribute("data-session", "1");
    fireEvent.change(screen.getByRole("textbox", { name: "Customer name" }), { target: { value: "Mila" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit booking" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("pending")).toHaveTextContent("true");
    expect(mocks.createBooking).toHaveBeenCalledTimes(1);
    expect(mocks.invalidate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "New booking" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    request.resolve({ type: "internal", url: "/app/beautyfeel/bookings" });
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledTimes(1));
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Booking successfully created");
    fireEvent.click(screen.getByRole("button", { name: "New booking" }));
    expect(await screen.findByRole("dialog")).toHaveAttribute("data-session", "3");
    expect(screen.getByRole("textbox", { name: "Customer name" })).toHaveValue("");
  });

  it("keeps the draft after a failed response and offers explicit recovery across navigation", async () => {
    const request = deferred<{ type: "error"; code: string }>();
    mocks.createBooking.mockReturnValue(request.promise);
    const view = harness();
    fireEvent.click(screen.getByRole("button", { name: "New booking" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Customer name" }), { target: { value: "Mila" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit booking" }));
    mocks.pathname = "/app/beautyfeel/customers";
    view.rerender(<Controls />);
    request.resolve({ type: "error", code: "SLOT_JUST_TAKEN" });
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(screen.getByTestId("recovery")).toHaveTextContent("true");
    const action = mocks.toastError.mock.calls[0][1].action;
    action.onClick();
    expect(await screen.findByRole("dialog")).toHaveAttribute("data-session", "1");
    expect(screen.getByRole("textbox", { name: "Customer name" })).toHaveValue("Mila");
  });

  it("drops the result when the verified owner changes before settlement", async () => {
    const request = deferred<{ type: "internal"; url: string }>();
    mocks.createBooking.mockReturnValue(request.promise);
    const client = new QueryClient();
    const renderTree = (key: string) => <QueryClientProvider client={client}><OwnerBookingControllerProvider key={key}><Controls /></OwnerBookingControllerProvider></QueryClientProvider>;
    const view = render(renderTree("owner-a"));
    fireEvent.click(screen.getByRole("button", { name: "New booking" }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit booking" }));
    mocks.identity = { userId: "owner-b", businessId: "business-b", businessSlug: "other-business" };
    view.rerender(renderTree("owner-b"));
    request.resolve({ type: "internal", url: "/app/beautyfeel/bookings" });
    await waitFor(() => expect(screen.getByTestId("pending")).toHaveTextContent("false"));
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("does not let an old recovery action reopen a later successful booking", async () => {
    mocks.createBooking
      .mockResolvedValueOnce({ type: "error", code: "BOOKING_FAILED" })
      .mockResolvedValueOnce({ type: "internal", url: "/app/beautyfeel/bookings" });
    harness();
    fireEvent.click(screen.getByRole("button", { name: "New booking" }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit booking" }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce());
    const oldAction = mocks.toastError.mock.calls[0][1].action;
    oldAction.onClick();
    fireEvent.click(await screen.findByRole("button", { name: "Submit booking" }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledOnce());
    oldAction.onClick();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
