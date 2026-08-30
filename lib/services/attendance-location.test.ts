import { describe, expect, it } from "vitest";

import {
  MAX_ATTENDANCE_DISTANCE_METERS,
  verifyAttendanceLocation,
} from "./attendance-location";

describe("verifyAttendanceLocation", () => {
  const business = {
    businessLatitude: 9.7410628,
    businessLongitude: 118.7400023,
  };

  it("accepts staff at the business location", () => {
    expect(
      verifyAttendanceLocation({
        ...business,
        staffLatitude: business.businessLatitude,
        staffLongitude: business.businessLongitude,
      }),
    ).toEqual({ success: true, distanceMeters: 0 });
  });

  it("rejects staff outside the attendance radius", () => {
    const result = verifyAttendanceLocation({
      ...business,
      staffLatitude: 9.75,
      staffLongitude: 118.7400023,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      `Max allowed: ${MAX_ATTENDANCE_DISTANCE_METERS}m`,
    );
  });

  it("rejects invalid coordinates", () => {
    expect(
      verifyAttendanceLocation({
        ...business,
        staffLatitude: Number.NaN,
        staffLongitude: 0,
      }),
    ).toEqual({ success: false, error: "Invalid location coordinates." });
  });
});
