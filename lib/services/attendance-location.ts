export const MAX_ATTENDANCE_DISTANCE_METERS = 100;

function isValidLatitude(value: number) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function verifyAttendanceLocation(input: {
  staffLatitude: number;
  staffLongitude: number;
  businessLatitude: number;
  businessLongitude: number;
  maxDistanceMeters?: number;
}) {
  const {
    staffLatitude,
    staffLongitude,
    businessLatitude,
    businessLongitude,
    maxDistanceMeters = MAX_ATTENDANCE_DISTANCE_METERS,
  } = input;

  if (
    !isValidLatitude(staffLatitude) ||
    !isValidLongitude(staffLongitude) ||
    !isValidLatitude(businessLatitude) ||
    !isValidLongitude(businessLongitude)
  ) {
    return { success: false as const, error: "Invalid location coordinates." };
  }

  const earthRadiusMeters = 6_371_000;
  const latitude1 = (staffLatitude * Math.PI) / 180;
  const latitude2 = (businessLatitude * Math.PI) / 180;
  const latitudeDelta = ((businessLatitude - staffLatitude) * Math.PI) / 180;
  const longitudeDelta = ((businessLongitude - staffLongitude) * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(longitudeDelta / 2) ** 2;
  const distanceMeters =
    earthRadiusMeters *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  if (distanceMeters > maxDistanceMeters) {
    return {
      success: false as const,
      error: `You are too far from the workplace (${Math.round(distanceMeters)}m away). Max allowed: ${maxDistanceMeters}m.`,
    };
  }

  return { success: true as const, distanceMeters };
}
