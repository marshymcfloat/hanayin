import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isSessionUserValid } from "@/lib/auth/session-validity";
import { proxy } from "./proxy";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("@/lib/auth/session-validity", () => ({ isSessionUserValid: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn() }));

beforeEach(() => { vi.resetAllMocks(); });

it.each(["/", "/login", "/app/salon", "/platform"])(
  "recovers a deleted account at %s and expires all session cookie chunks",
  async (path) => {
    vi.mocked(getToken).mockResolvedValue({ id: "deleted", role: "OWNER", businessSlug: "salon" });
    vi.mocked(isSessionUserValid).mockResolvedValue(false);
    const response = await proxy(new NextRequest(`https://example.com${path}`, {
      headers: { cookie: "next-auth.session-token=old; __Secure-next-auth.session-token.0=a; __Secure-next-auth.session-token.1=b; preference=keep" },
    }));
    expect(response.headers.get("location")).toBe("https://example.com/login");
    expect(response.cookies.getAll()).toHaveLength(3);
    for (const cookie of response.cookies.getAll()) {
      expect(cookie.value).toBe("");
      expect(cookie.expires).toEqual(new Date(0));
    }

    vi.mocked(getToken).mockResolvedValue(null);
    const login = await proxy(new NextRequest("https://example.com/login"));
    expect(login.headers.get("location")).toBeNull();
  },
);

it("preserves valid account redirects", async () => {
  vi.mocked(getToken).mockResolvedValue({ id: "valid", role: "OWNER", businessSlug: "salon" });
  vi.mocked(isSessionUserValid).mockResolvedValue(true);
  const response = await proxy(new NextRequest("https://example.com/login"));
  expect(response.headers.get("location")).toBe("https://example.com/app/salon");
  expect(response.cookies.getAll()).toHaveLength(0);
});

it("leaves NextAuth endpoints alone", async () => {
  await proxy(new NextRequest("https://example.com/api/auth/session"));
  expect(getToken).not.toHaveBeenCalled();
  expect(isSessionUserValid).not.toHaveBeenCalled();
});
