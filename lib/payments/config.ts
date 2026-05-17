const DEFAULT_QR_EXPIRY_SECONDS = 480;
const MIN_QR_EXPIRY_SECONDS = 60;
const MAX_QR_EXPIRY_SECONDS = 1800;

function parsePositiveInt(value: string | undefined) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function getQrExpirySeconds() {
  const configured = parsePositiveInt(process.env.QR_HOLD_EXPIRY_SECONDS);

  const value = configured ?? DEFAULT_QR_EXPIRY_SECONDS;
  return Math.min(MAX_QR_EXPIRY_SECONDS, Math.max(MIN_QR_EXPIRY_SECONDS, value));
}

export function getQrHoldExpiresAt(from = new Date()) {
  return new Date(from.getTime() + getQrExpirySeconds() * 1000);
}
