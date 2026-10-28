import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptMessagingValue, encryptMessagingValue, isMessagingEncryptionAvailable, messagingFingerprint } from "@/features/social/customer-messaging/crypto";

vi.mock("server-only", () => ({}));
const scope = { purpose: "MESSAGE_TEXT" as const, businessId: "synthetic-business", conversationId: "synthetic-conversation" };
beforeEach(() => vi.stubEnv("SOCIAL_MESSAGING_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64")));
afterEach(() => vi.unstubAllEnvs());

describe("messaging authenticated encryption", () => {
  it("encrypts independently and decrypts only in the owning domain", () => {
    const first = encryptMessagingValue("Magkano po?", scope);
    const second = encryptMessagingValue("Magkano po?", scope);
    expect(first).not.toBe(second);
    expect(first).not.toContain("Magkano");
    expect(decryptMessagingValue(first, scope)).toBe("Magkano po?");
    for (const wrong of [
      { ...scope, businessId: "other" }, { ...scope, conversationId: "other" },
      { ...scope, purpose: "DRAFT_TEXT" as const },
    ]) expect(() => decryptMessagingValue(first, wrong)).toThrow();
  });
  it("rejects tampered and malformed ciphertext", () => {
    const encrypted = encryptMessagingValue("Synthetic", scope);
    const parts = encrypted.split(".");
    parts[3] = Buffer.alloc(9).toString("base64");
    expect(() => decryptMessagingValue(parts.join("."), scope)).toThrow();
    expect(() => decryptMessagingValue("v2.invalid", scope)).toThrow();
  });
  it("fails closed without the dedicated key", () => {
    vi.stubEnv("SOCIAL_MESSAGING_ENCRYPTION_KEY", "");
    expect(isMessagingEncryptionAvailable()).toBe(false);
    expect(() => encryptMessagingValue("Synthetic", scope)).toThrow("Messaging encryption unavailable.");
    vi.stubEnv("SOCIAL_MESSAGING_ENCRYPTION_KEY", Buffer.alloc(16).toString("base64"));
    expect(isMessagingEncryptionAvailable()).toBe(false);
  });
  it("scopes deterministic minimized fingerprints by domain and tenant", () => {
    expect(messagingFingerprint("recipient", "tenant-a", "user-1")).toBe(messagingFingerprint("recipient", "tenant-a", "user-1"));
    expect(messagingFingerprint("recipient", "tenant-a", "user-1")).not.toBe(messagingFingerprint("recipient", "tenant-b", "user-1"));
    expect(messagingFingerprint("recipient", "user-1")).not.toBe(messagingFingerprint("message", "user-1"));
  });
});
