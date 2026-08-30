import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getTokenMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth/jwt", () => ({ getToken: getTokenMock }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn() }));
vi.mock("@/lib/client-ip", () => ({
  clientIpFromForwardedFor: vi.fn(() => "127.0.0.1"),
}));

import { config, proxy } from "./proxy";

describe("login proxy redirects", () => {
  beforeEach(() => {
    getTokenMock.mockReset();
  });

  it("allows signed-out visitors to open the login page", async () => {
    getTokenMock.mockResolvedValue(null);

    const response = await proxy(
      new NextRequest("https://www.serviceflow.store/login"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects an authenticated owner or employee to their workspace", async () => {
    getTokenMock.mockResolvedValue({
      role: "OWNER",
      businessSlug: "beautyfeel",
      mustChangePassword: false,
    });

    const response = await proxy(
      new NextRequest("https://www.serviceflow.store/login"),
    );

    expect(response.headers.get("location")).toBe(
      "https://www.serviceflow.store/app/beautyfeel",
    );
  });

  it("redirects temporary-password users to change their password", async () => {
    getTokenMock.mockResolvedValue({
      role: "EMPLOYEE",
      businessSlug: "beautyfeel",
      mustChangePassword: true,
    });

    const response = await proxy(
      new NextRequest("https://www.serviceflow.store/login"),
    );

    expect(response.headers.get("location")).toBe(
      "https://www.serviceflow.store/app/beautyfeel/change-password",
    );
  });

  it("redirects platform admins to the platform dashboard", async () => {
    getTokenMock.mockResolvedValue({ role: "PLATFORM_ADMIN" });

    const response = await proxy(
      new NextRequest("https://www.serviceflow.store/login"),
    );

    expect(response.headers.get("location")).toBe(
      "https://www.serviceflow.store/platform",
    );
  });

  it("matches only the credential login page, not the magic-link route", () => {
    expect(config.matcher).toContain("/login");
    expect(config.matcher).not.toContain("/login/:path*");
  });
});
