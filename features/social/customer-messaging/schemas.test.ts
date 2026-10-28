import { describe, expect, it } from "vitest";
import { messagingSettingsSchema } from "@/features/social/customer-messaging/schemas";
const settings = { mode: "SUGGEST", consent: true, aiConsent: true, paused: false, defaultLanguage: "FIL" };
describe("owner inbox settings validation", () => {
  it("requires independent privacy and AI consent outside OFF", () => {
    expect(messagingSettingsSchema.safeParse(settings).success).toBe(true);
    expect(messagingSettingsSchema.safeParse({ ...settings, consent: false }).success).toBe(false);
    expect(messagingSettingsSchema.safeParse({ ...settings, aiConsent: false }).success).toBe(false);
    expect(messagingSettingsSchema.safeParse({ ...settings, mode: "OFF", consent: false, aiConsent: false }).success).toBe(true);
  });
  it("rejects tenant/provider facts and unsupported owner language", () => {
    expect(messagingSettingsSchema.safeParse({ ...settings, businessId: "foreign" }).success).toBe(false);
    expect(messagingSettingsSchema.safeParse({ ...settings, channelVerified: true }).success).toBe(false);
    expect(messagingSettingsSchema.safeParse({ ...settings, defaultLanguage: "UNKNOWN" }).success).toBe(false);
  });
});
