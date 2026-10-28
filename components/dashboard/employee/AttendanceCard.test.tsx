import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.stubGlobal("React", React);

const { clockInMock, clockOutMock, statusMock } = vi.hoisted(() => ({
  clockInMock: vi.fn(),
  clockOutMock: vi.fn(),
  statusMock: vi.fn(),
}));

vi.mock("@/features/workforce/actions/attendance", () => ({
  clockInAction: clockInMock,
  clockOutAction: clockOutMock,
  checkAttendanceStatusAction: statusMock,
  getMonthlyAttendanceAction: vi.fn(),
}));
vi.mock("./AttendanceCalendar", () => ({ default: () => <div>Calendar</div> }));

import AttendanceCard from "./AttendanceCard";

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AttendanceCard employeeId={7} businessSlug="beautyfeel" todayAttendance={null} compact />
    </QueryClientProvider>,
  );
}

describe("staff attendance confirmation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    statusMock.mockResolvedValue({ success: true, data: null });
  });

  it("blocks duplicate submissions and changes status only after the server confirms", async () => {
    let resolveClockIn!: (value: unknown) => void;
    clockInMock.mockReturnValue(new Promise((resolve) => { resolveClockIn = resolve; }));
    const getCurrentPosition = vi.fn((success: (position: GeolocationPosition) => void) =>
      success({ coords: { latitude: 14, longitude: 121 } } as GeolocationPosition));
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Start Shift" }));
    fireEvent.click(screen.getByRole("button", { name: "Processing..." }));
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    await waitFor(() => expect(clockInMock).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button", { name: "End Shift" })).not.toBeInTheDocument();

    const attendance = { time_in: new Date("2026-10-04T08:00:00+08:00"), time_out: null };
    statusMock.mockResolvedValue({ success: true, data: attendance });
    resolveClockIn({ success: true, data: attendance });
    await waitFor(() => expect(screen.getByRole("button", { name: "End Shift" })).toBeInTheDocument());
  });

  it("keeps the shift unchanged when location is denied", async () => {
    const getCurrentPosition = vi.fn((_success: unknown, failure: (error: GeolocationPositionError) => void) =>
      failure({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError));
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Start Shift" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Start Shift" })).toBeEnabled());
    expect(clockInMock).not.toHaveBeenCalled();
    expect(clockOutMock).not.toHaveBeenCalled();
  });

  it("releases the button when geolocation throws synchronously", async () => {
    const getCurrentPosition = vi.fn(() => { throw new Error("unavailable"); });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Start Shift" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Start Shift" })).toBeEnabled());
    expect(clockInMock).not.toHaveBeenCalled();
  });

  it("keeps the shift unchanged and allows retry after a rejected action", async () => {
    const getCurrentPosition = vi.fn((success: (position: GeolocationPosition) => void) =>
      success({ coords: { latitude: 14, longitude: 121 } } as GeolocationPosition));
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
    clockInMock.mockRejectedValue(new Error("network"));
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Start Shift" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Start Shift" })).toBeEnabled());
    expect(clockInMock).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Start Shift" }));
    await waitFor(() => expect(clockInMock).toHaveBeenCalledTimes(2));
  });
});
