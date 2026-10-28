import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

const envelopeSchema = z.object({ version: z.literal(1), iv: z.string(), tag: z.string(), data: z.string() });
function key() {
  const raw = process.env.PAYROLL_IDENTIFIER_ENCRYPTION_KEY;
  if (!raw || !/^[A-Za-z0-9+/]{43}=$/.test(raw)) throw new Error("Payroll identifier encryption is unavailable");
  const result = Buffer.from(raw, "base64");
  if (result.length !== 32) throw new Error("Payroll identifier encryption is unavailable");
  return result;
}
export function encryptPayrollIdentifiers(identifiers: Record<string, string>) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(identifiers), "utf8"), cipher.final()]);
  return JSON.stringify({ version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") });
}
export function decryptPayrollIdentifiers(payload: string): Record<string, string> {
  const envelope = envelopeSchema.parse(JSON.parse(payload));
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return z.record(z.string(), z.string()).parse(JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")), decipher.final()]).toString("utf8")));
}
export const maskPayrollIdentifier = (value: string) => value.length <= 4 ? "••••" : "••••" + value.slice(-4);
