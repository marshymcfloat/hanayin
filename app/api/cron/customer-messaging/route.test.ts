// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ run: vi.fn(), connection: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/features/social/customer-messaging/worker/runtime", () => ({ runMessagingWorker: mocks.run }));
import { GET } from "@/app/api/cron/customer-messaging/route";

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("CRON_SECRET", "synthetic-secret"); mocks.run.mockResolvedValue({ processed: 0, enabled: false }); });
afterEach(() => vi.unstubAllEnvs());
const request = (authorization?: string) => new Request("https://app.test/api/cron/customer-messaging", { headers: authorization ? { authorization } : {} });
describe("customer messaging cron", () => {
  it.each([undefined, "Basic c2FmZTpzYWZl", "Bearer wrong", "Bearer synthetic-secret extra", "bearer synthetic-secret"])("denies invalid bearer before persistence", async authorization => {
    expect((await GET(request(authorization))).status).toBe(401); expect(mocks.run).not.toHaveBeenCalled();
  });
  it("fails closed with no cron secret", async () => {
    vi.stubEnv("CRON_SECRET", ""); expect((await GET(request("Bearer synthetic-secret"))).status).toBe(401); expect(mocks.run).not.toHaveBeenCalled();
  });
  it("runs required cleanup/worker entry only after exact bearer authentication", async () => {
    const response = await GET(request("Bearer synthetic-secret"));
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store"); expect(mocks.run).toHaveBeenCalledOnce();
  });
  it("exposes a safe setup/retention error on unavailable infrastructure", async () => {
    mocks.run.mockRejectedValue(new Error("raw customer content token"));
    const response = await GET(request("Bearer synthetic-secret")); expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("raw customer");
  });
});
