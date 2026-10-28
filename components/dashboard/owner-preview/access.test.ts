import { describe, expect, it } from "vitest";
import { resolveOwnerPreviewAccess } from "./access";

describe("resolveOwnerPreviewAccess", () => {
  it("allows the matching owner tenant", () => {
    expect(resolveOwnerPreviewAccess({ authenticated: true, role: "OWNER", sessionBusinessSlug: "studio-luna", requestedBusinessSlug: "studio-luna" })).toEqual({ allowed: true });
  });

  it("redirects unauthenticated visitors", () => {
    expect(resolveOwnerPreviewAccess({ authenticated: false, requestedBusinessSlug: "studio-luna" })).toEqual({ allowed: false, redirectTo: "/" });
  });

  it("returns non-owners to the regular tenant dashboard", () => {
    expect(resolveOwnerPreviewAccess({ authenticated: true, role: "EMPLOYEE", sessionBusinessSlug: "studio-luna", requestedBusinessSlug: "studio-luna" })).toEqual({ allowed: false, redirectTo: "/app/studio-luna" });
  });

  it("corrects a mismatched owner tenant", () => {
    expect(resolveOwnerPreviewAccess({ authenticated: true, role: "OWNER", sessionBusinessSlug: "studio-luna", requestedBusinessSlug: "other" })).toEqual({ allowed: false, redirectTo: "/owner-dashboard-preview/studio-luna" });
  });
});
