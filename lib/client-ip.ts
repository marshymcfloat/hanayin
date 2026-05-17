/**
 * Client-IP normalization for rate-limit keys.
 *
 * The naive pattern `forwardedFor.split(",")[0].trim()` returns the raw
 * client address. For IPv4 that's fine — one user, one bucket. For IPv6
 * it's a footgun: every ISP gives a customer an entire `/64` (≈18
 * quintillion addresses), so an attacker rotating within their `/64`
 * gets a fresh bucket per request and bypasses every per-IP rate limit.
 *
 * `normalizeClientIp` collapses IPv6 addresses to their `/64` prefix so
 * one ISP-level customer maps to one bucket. IPv4 and IPv4-mapped IPv6
 * pass through unchanged. Output is suitable as a Redis key fragment.
 */
export function normalizeClientIp(rawIp: string | null | undefined): string {
  if (!rawIp) return "unknown";
  const ip = rawIp.trim().toLowerCase();
  if (!ip || ip === "unknown") return "unknown";

  // IPv4: no colons.
  if (!ip.includes(":")) return ip;

  // IPv4-mapped IPv6 (::ffff:192.0.2.1) — treat as IPv4 since the
  // underlying client is on an IPv4 network.
  const v4Mapped = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Mapped) return v4Mapped[1];

  // IPv6: expand "::" compression and take the first 4 hextets (/64).
  // Note: split("::") yields at most two parts because "::" can only
  // appear once per address.
  const parts = ip.split("::");
  if (parts.length > 2) return "unknown"; // malformed
  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const fill = Math.max(0, 8 - head.length - tail.length);
  const expanded = [...head, ...Array(fill).fill("0"), ...tail];
  if (expanded.length < 4) return "unknown";

  // /64 representation. Suffix `::/64` makes the bucketing intent
  // visible in logs without changing collision behavior.
  return `${expanded.slice(0, 4).join(":")}::/64`;
}

/**
 * Convenience: pulls the first hop from `x-forwarded-for` (the client),
 * trims, and normalizes. Centralizes the pattern so call sites don't
 * each re-implement the IPv6 fix.
 */
export function clientIpFromForwardedFor(
  forwardedFor: string | null | undefined,
): string {
  if (!forwardedFor) return "unknown";
  const first = forwardedFor.split(",")[0]?.trim();
  return normalizeClientIp(first);
}
