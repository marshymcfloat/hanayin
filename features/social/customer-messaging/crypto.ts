import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

export interface MessagingEncryptionScope {
  purpose: "MESSAGE_TEXT" | "DRAFT_TEXT" | "RECIPIENT" | "CHANNEL_TOKEN";
  businessId: string;
  conversationId: string;
}

function key() {
  const encoded = process.env.SOCIAL_MESSAGING_ENCRYPTION_KEY ?? "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error("Messaging encryption unavailable.");
  const value = Buffer.from(encoded, "base64");
  if (value.length !== 32) throw new Error("Messaging encryption unavailable.");
  return value;
}

export function isMessagingEncryptionAvailable() {
  try { key(); return true; } catch { return false; }
}

function aad(scope: MessagingEncryptionScope) {
  return Buffer.from(JSON.stringify(["serviceflow-messenger-v1", scope.purpose, scope.businessId, scope.conversationId]));
}

export function encryptMessagingValue(value: string, scope: MessagingEncryptionScope): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(aad(scope));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptMessagingValue(value: string, scope: MessagingEncryptionScope): string {
  const [version, iv, tag, encrypted, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || encrypted === undefined || extra !== undefined) throw new Error("Messaging content unavailable.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAAD(aad(scope));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
}

export function messagingFingerprint(domain: string, ...values: string[]): string {
  return createHmac("sha256", key()).update(JSON.stringify(["serviceflow-messenger-v1", domain, ...values])).digest("hex");
}
