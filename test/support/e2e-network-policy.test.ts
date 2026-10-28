import { describe, expect, it } from "vitest";
import { shouldBlockSmokeRequest } from "./e2e-network-policy";

const base = "http://127.0.0.1:3100";
describe("smoke browser network isolation", () => {
  it.each(["/login", "/api/auth/session", "/_next/static/chunk.js", "/favicon.ico", "/_next/image?url=%2Fsf-favicon.png"])("allows local application request %s", path => {
    expect(shouldBlockSmokeRequest(`${base}${path}`, base)).toBe(false);
  });
  it.each(["https://va.vercel-scripts.com/v1/script.debug.js", "https://example.test/image.png", "http://127.0.0.1:3000/login", `${base}/monitoring`, `${base}/monitoring/envelope`, `${base}/_vercel/insights/view`, `${base}/_vercel/speed-insights/vitals`, `${base}/_next/image?url=https%3A%2F%2Fexample.test%2Fimage.png`, `${base}/_next/image?url=%2F%2Fexample.test%2Fimage.png`, `${base}/_next/image`, "invalid", "file:///private"])("blocks external, telemetry or invalid request %s", target => {
    expect(shouldBlockSmokeRequest(target, base)).toBe(true);
  });
  it.each(["data:image/png;base64,AA==", `blob:${base}/fixture`])("allows non-network fixture %s", target => {
    expect(shouldBlockSmokeRequest(target, base)).toBe(false);
  });
  it("fails closed for an invalid application origin", () => {
    expect(shouldBlockSmokeRequest(`${base}/login`, "invalid")).toBe(true);
  });
});
