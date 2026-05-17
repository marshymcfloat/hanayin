import { describe, expect, it } from "vitest";
import { clientIpFromForwardedFor, normalizeClientIp } from "./client-ip";

describe("normalizeClientIp", () => {
  it("returns IPv4 addresses unchanged", () => {
    expect(normalizeClientIp("203.0.113.10")).toBe("203.0.113.10");
    expect(normalizeClientIp("192.168.1.1")).toBe("192.168.1.1");
  });

  it("collapses IPv6 to its /64 prefix so /64-rotation cannot bypass limits", () => {
    // Full IPv6 — first 4 hextets retained, rest dropped.
    expect(normalizeClientIp("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe(
      "2001:0db8:85a3:0000::/64",
    );
  });

  it("handles compressed IPv6 (`::`) by expanding then taking /64", () => {
    expect(normalizeClientIp("2001:db8:85a3::8a2e:370:7334")).toBe(
      "2001:db8:85a3:0::/64",
    );
    expect(normalizeClientIp("2001:db8::1")).toBe("2001:db8:0:0::/64");
  });

  it("treats IPv4-mapped IPv6 (::ffff:x.x.x.x) as the underlying IPv4", () => {
    // The customer is on an IPv4 network — bucket them as IPv4 so two
    // clients on the same dual-stack proxy don't share a /64 bucket.
    expect(normalizeClientIp("::ffff:192.0.2.1")).toBe("192.0.2.1");
  });

  it("collapses every IPv6 in the same /64 to one bucket", () => {
    const a = normalizeClientIp("2001:db8:85a3:0:1::1");
    const b = normalizeClientIp("2001:db8:85a3:0:ffff::ffff");
    expect(a).toBe(b);
  });

  it("returns 'unknown' for empty / null / malformed input", () => {
    expect(normalizeClientIp(null)).toBe("unknown");
    expect(normalizeClientIp(undefined)).toBe("unknown");
    expect(normalizeClientIp("")).toBe("unknown");
    expect(normalizeClientIp("   ")).toBe("unknown");
    expect(normalizeClientIp("unknown")).toBe("unknown");
    // Two "::" segments would mean a malformed address.
    expect(normalizeClientIp("2001::db8::1")).toBe("unknown");
  });

  it("handles loopback and link-local IPv6 without throwing", () => {
    expect(normalizeClientIp("::1")).toBe("0:0:0:0::/64");
    expect(normalizeClientIp("fe80::1")).toBe("fe80:0:0:0::/64");
  });
});

describe("clientIpFromForwardedFor", () => {
  it("takes the first hop from a comma-separated x-forwarded-for", () => {
    expect(clientIpFromForwardedFor("203.0.113.10, 10.0.0.1, 10.0.0.2")).toBe(
      "203.0.113.10",
    );
  });

  it("normalizes IPv6 in the first hop", () => {
    expect(
      clientIpFromForwardedFor(
        "2001:db8:85a3::8a2e:370:7334, 10.0.0.1",
      ),
    ).toBe("2001:db8:85a3:0::/64");
  });

  it("returns 'unknown' when the header is missing or empty", () => {
    expect(clientIpFromForwardedFor(null)).toBe("unknown");
    expect(clientIpFromForwardedFor("")).toBe("unknown");
  });
});
