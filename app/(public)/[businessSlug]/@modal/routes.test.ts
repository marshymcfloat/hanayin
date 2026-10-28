import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import Closed from "@/app/(public)/[businessSlug]/@modal/page";
import Services from "@/app/(public)/[businessSlug]/@modal/services/page";
import Success from "@/app/(public)/[businessSlug]/@modal/booking/success/page";
import Manage from "@/app/(public)/[businessSlug]/@modal/booking/manage/page";
import Booking from "@/app/(public)/[businessSlug]/@modal/bookings/[bookingId]/page";

describe("public modal route boundaries", () => {
  const root = resolve(process.cwd(), "app/(public)/[businessSlug]/@modal");

  it("does not register a business-root catch-all that can capture API routes", () => {
    expect(readdirSync(root).filter((name) => name.includes("..."))).toEqual([]);
  });

  it("closes the modal on supported public destinations", () => {
    for (const page of [Closed, Services, Success, Manage, Booking]) {
      expect(page()).toBeNull();
    }
  });

  it("retains both interceptors and the hard-navigation fallback", () => {
    for (const path of ["(.)booking/page.tsx", "(.)claim-gift-card/page.tsx", "default.tsx"]) {
      expect(existsSync(resolve(root, path))).toBe(true);
    }
  });
});
