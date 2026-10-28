import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matchesMessengerEchoContent, ownMessengerEchoDeliveryKey, parseVerifiedMessengerBody, readBoundedMessengerBody, receiveMessengerWebhook, verifyMessengerChallenge, verifyMessengerSignature } from "@/features/social/customer-messaging/ingestion";
import { encryptMessagingValue } from "@/features/social/customer-messaging/crypto";
import { MAX_MESSENGER_BODY_BYTES } from "@/features/social/customer-messaging/config";

const database = vi.hoisted(() => ({ messengerChannel: { findMany: vi.fn() }, customerMessagingJob: { updateMany: vi.fn() }, customerMessagingSettings: { findUnique: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("@/prisma/prisma", () => ({ prisma: database }));
const now = Date.parse("2030-01-15T09:00:00Z");
const event = { sender: { id: "synthetic-recipient" }, recipient: { id: "synthetic-page" }, timestamp: now,
  message: { mid: "synthetic-mid", text: "Magkano po?" } };
const envelope = (events = [event]) => ({ object: "page", entry: [{ id: "synthetic-page", time: now, messaging: events }] });
const raw = (value: unknown) => Buffer.from(JSON.stringify(value));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SOCIAL_MESSAGING_APP_ID", "synthetic-app");
  vi.stubEnv("SOCIAL_MESSAGING_APP_SECRET", "synthetic-signing-proof");
  vi.stubEnv("SOCIAL_MESSAGING_VERIFY_TOKEN", "synthetic-verification-proof");
  vi.stubEnv("SOCIAL_MESSAGING_INTAKE_ENABLED", "true");
  vi.stubEnv("SOCIAL_MESSAGING_KILL_SWITCH", "false");
  vi.stubEnv("SOCIAL_MESSAGING_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
  database.messengerChannel.findMany.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

describe("Messenger transport proof and bounds", () => {
  it("requires typed own-app echoes with an exact stable delivery UUID", () => {
    const deliveryKey = "11111111-1111-4111-8111-111111111111";
    const proof = { is_echo: true, app_id: "synthetic-app", metadata: `sf:${deliveryKey}` };
    expect(ownMessengerEchoDeliveryKey(proof, "synthetic-app")).toBe(deliveryKey);
    for (const invalid of [
      { ...proof, is_echo: false }, { ...proof, app_id: "another-app" }, { ...proof, metadata: "sf:fake-key" },
      { ...proof, metadata: proof.metadata + "\n" }, { ...proof, metadata: "prefix" + proof.metadata },
      { ...proof, metadata: "sf:11111111-1111-1111-8111-111111111111" },
    ]) expect(ownMessengerEchoDeliveryKey(invalid, "synthetic-app")).toBeNull();
  });
  it("compares authenticated own echoes to the exact retained draft without reviving expired text", () => {
    const clock = new Date(now);
    const scope = { purpose: "DRAFT_TEXT" as const, businessId: "tenant", conversationId: "conversation" };
    const proof = { providerMessageHash: null, draftEncrypted: encryptMessagingValue("Synthetic grounded reply", scope), textExpiresAt: new Date(now + 1000) };
    expect(matchesMessengerEchoContent("Synthetic grounded reply", proof, "mid-hash", clock, scope)).toBe(true);
    expect(matchesMessengerEchoContent("Different reply", proof, "mid-hash", clock, scope)).toBe(false);
    expect(matchesMessengerEchoContent("Synthetic grounded reply", proof, "mid-hash", clock, { ...scope, businessId: "foreign" })).toBe(false);
    expect(matchesMessengerEchoContent("Synthetic grounded reply", { ...proof, providerMessageHash: "other-mid" }, "mid-hash", clock, scope)).toBe(false);
    const expired = { ...proof, draftEncrypted: "must-not-decrypt", textExpiresAt: clock };
    expect(matchesMessengerEchoContent(undefined, expired, "mid-hash", clock, scope)).toBe(false);
    expect(matchesMessengerEchoContent(undefined, { ...expired, providerMessageHash: "mid-hash" }, "mid-hash", clock, scope)).toBe(true);
  });
  it("checks raw bytes with SHA-256 HMAC and rejects mutations/invalid signatures", () => {
    const bytes = raw(envelope());
    const signature = "sha256=" + createHmac("sha256", "synthetic-signing-proof").update(bytes).digest("hex");
    expect(verifyMessengerSignature(bytes, signature, "synthetic-signing-proof")).toBe(true);
    expect(verifyMessengerSignature(Buffer.concat([bytes, Buffer.from(" ")]), signature, "synthetic-signing-proof")).toBe(false);
    for (const invalid of [null, "sha1=abc", "sha256=abc", "sha256=" + "g".repeat(64)]) expect(verifyMessengerSignature(bytes, invalid, "synthetic-signing-proof")).toBe(false);
  });
  it("checks authentication before parsing and before any database mapping", async () => {
    await expect(receiveMessengerWebhook(new Request("http://localhost/webhook", { method: "POST", body: "malformed" }))).rejects.toMatchObject({ status: 401 });
    expect(database.messengerChannel.findMany).not.toHaveBeenCalled();
  });
  it("counts all events before Zod parsing and rejects excess/nonfinite events", () => {
    expect(() => parseVerifiedMessengerBody(raw(envelope(Array.from({ length: 101 }, () => event))))).toThrow("Webhook event limit exceeded.");
    expect(() => parseVerifiedMessengerBody(raw({ object: "page", entry: [{ id: "x", time: now, messaging: [event] }, { id: "x", time: now, messaging: Array.from({ length: 100 }, () => event) }] }))).toThrow("Webhook event limit exceeded.");
    expect(() => parseVerifiedMessengerBody(Buffer.from('{"object":"page","entry":[{"id":"x","time":1e999,"messaging":[]}]}'))).toThrow("Invalid webhook events.");
    expect(parseVerifiedMessengerBody(raw(envelope())).entry[0].messaging).toHaveLength(1);
  });
  it("bounds streamed bytes even without a trusted Content-Length", async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array(MAX_MESSENGER_BODY_BYTES)); controller.enqueue(new Uint8Array(1)); controller.close();
    } });
    const request = new Request("http://localhost/webhook", { method: "POST", body, duplex: "half" } as RequestInit & { duplex: string });
    await expect(readBoundedMessengerBody(request)).rejects.toMatchObject({ status: 413 });
    await expect(readBoundedMessengerBody(new Request("http://localhost/webhook", { method: "POST", body: "x", headers: { "content-length": String(MAX_MESSENGER_BODY_BYTES + 1) } }))).rejects.toMatchObject({ status: 413 });
  });
  it("answers only a matching separate verification secret", () => {
    const url = "http://localhost/webhook?hub.mode=subscribe&hub.verify_token=synthetic-verification-proof&hub.challenge=12345";
    expect(verifyMessengerChallenge(new Request(url))).toBe("12345");
    expect(() => verifyMessengerChallenge(new Request(url.replace("synthetic-verification-proof", "wrong")))).toThrow("Invalid webhook verification.");
    vi.stubEnv("SOCIAL_MESSAGING_VERIFY_TOKEN", "synthetic-signing-proof");
    expect(() => verifyMessengerChallenge(new Request(url))).toThrow("Messaging verification unavailable.");
  });
  it("fails closed when intake is off, without database reads", async () => {
    vi.stubEnv("SOCIAL_MESSAGING_INTAKE_ENABLED", "false");
    await expect(receiveMessengerWebhook(new Request("http://localhost/webhook", { method: "POST", body: "x" }))).rejects.toMatchObject({ status: 503 });
    expect(database.messengerChannel.findMany).not.toHaveBeenCalled();
  });
  it("does not map a publishing connection or a nonexistent destination", async () => {
    const bytes = raw(envelope());
    const signature = "sha256=" + createHmac("sha256", "synthetic-signing-proof").update(bytes).digest("hex");
    await expect(receiveMessengerWebhook(new Request("http://localhost/webhook", { method: "POST", body: bytes,
      headers: { "x-hub-signature-256": signature } }))).resolves.toEqual({ accepted: 0 });
    expect(database.messengerChannel.findMany).toHaveBeenCalledWith({ where: { app_id: "synthetic-app", page_id: "synthetic-page", active: true }, take: 2 });
  });
});
