import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/social/messaging/webhook/route";

const mocks = vi.hoisted(() => ({ receive: vi.fn(), challenge: vi.fn(), connection: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/features/social/customer-messaging/ingestion", () => ({
  MessagingWebhookError: class extends Error { constructor(public status: number, message: string) { super(message); } },
  receiveMessengerWebhook: mocks.receive, verifyMessengerChallenge: mocks.challenge,
}));
beforeEach(() => vi.clearAllMocks());
describe("Messenger webhook adapter", () => {
  it("acknowledges only durable successful receipt", async () => {
    mocks.receive.mockResolvedValue({ accepted: 1 });
    const result = await POST(new Request("http://localhost/webhook", { method: "POST" }));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ received: true });
    expect(result.headers.get("cache-control")).toBe("no-store");
  });
  it("returns safe errors without internal/provider content", async () => {
    mocks.receive.mockRejectedValue(new Error("synthetic-private-message-and-token"));
    const result = await POST(new Request("http://localhost/webhook", { method: "POST" }));
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("synthetic-private");
  });
  it("returns the verified challenge as uncached plaintext", async () => {
    mocks.challenge.mockReturnValue("12345");
    const result = await GET(new Request("http://localhost/webhook"));
    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(mocks.challenge.mock.invocationCallOrder[0]);
    expect(await result.text()).toBe("12345");
    expect(result.headers.get("cache-control")).toBe("no-store");
  });
});
