// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendMessengerReply, type VerifiedMessengerSendTarget } from "@/features/social/customer-messaging/worker/meta-send";

const target: VerifiedMessengerSendTarget = { pageId: "123", recipientId: "456", pageAccessToken: "synthetic-token", graphVersion: "v25.0", facebookLoginVerified: true, permissionsVerified: true, pilotVerified: true, metadataEchoVerified: true };
const input = { target, text: "Reviewed template", deliveryKey: "job-stable-1" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
afterEach(() => vi.useRealTimers());

describe("Messenger delivery truth", () => {
  it("uses verified Page/token and configured version with RESPONSE, no redirects, and explicit stable metadata", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ recipient_id: "456", message_id: "mid.1" }));
    expect(await sendMessengerReply(input, { fetch })).toEqual({ status: "CONFIRMED", providerMessageId: "mid.1" });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("https://graph.facebook.com/v25.0/123/messages", expect.objectContaining({ redirect: "error", cache: "no-store", headers: { Authorization: "Bearer synthetic-token", "Content-Type": "application/json" } }));
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toEqual({ recipient: { id: "456" }, messaging_type: "RESPONSE", message: { text: input.text, metadata: "sf:job-stable-1" } });
  });
  it("omits metadata unless echo behavior was separately verified", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ recipient_id: "456", message_id: "mid.1" }));
    await sendMessengerReply({ ...input, target: { ...target, metadataEchoVerified: false } }, { fetch });
    expect(JSON.parse(fetch.mock.calls[0][1].body).message).not.toHaveProperty("metadata");
  });
  it.each([
    { facebookLoginVerified: false }, { permissionsVerified: false }, { pilotVerified: false }, { graphVersion: "https://evil.test" }, { pageId: "../me" }, { pageAccessToken: "" },
  ])("denies missing or unsafe activation criteria locally", async changed => {
    const fetch = vi.fn();
    expect(await sendMessengerReply({ ...input, target: { ...target, ...changed } as VerifiedMessengerSendTarget }, { fetch })).toEqual({ status: "FAILED", retryable: false });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("marks a valid explicit client rejection as confirmed failure", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ error: { code: 190, type: "OAuthException" } }, 401));
    expect(await sendMessengerReply(input, { fetch })).toEqual({ status: "FAILED", retryable: false });
  });
  it.each([
    json({ recipient_id: "other", message_id: "mid.1" }), json({ accepted: true }), json({ error: { code: 1, type: "Unknown" } }, 500),
    new Response("not JSON", { status: 400 }), new Response("x".repeat(20_000)), new Response("{}", { headers: { "Content-Length": "20000" } }),
  ])("quarantines malformed, oversized and server responses", async response => {
    const fetch = vi.fn().mockResolvedValue(response);
    expect(await sendMessengerReply(input, { fetch })).toEqual({ status: "UNKNOWN" });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("quarantines a network exception without retrying or exposing provider error", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("secret token/provider data"));
    expect(await sendMessengerReply(input, { fetch })).toEqual({ status: "UNKNOWN" }); expect(fetch).toHaveBeenCalledOnce();
  });
  it("bounds both request and response-body stalls even if an adapter ignores AbortSignal", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(() => new Promise(() => undefined));
    const request = sendMessengerReply(input, { fetch, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    expect(await request).toEqual({ status: "UNKNOWN" }); expect(fetch).toHaveBeenCalledOnce();
    const body = new ReadableStream<Uint8Array>({ start() {} });
    const stalled = sendMessengerReply(input, { fetch: vi.fn().mockResolvedValue(new Response(body)), timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100); expect(await stalled).toEqual({ status: "UNKNOWN" });
  });
});
