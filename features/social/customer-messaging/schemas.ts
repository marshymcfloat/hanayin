import { z } from "zod";

export const messagingSettingsSchema = z.object({
  mode: z.enum(["OFF", "SUGGEST", "AUTO"]),
  consent: z.boolean(),
  aiConsent: z.boolean(),
  paused: z.boolean(),
  defaultLanguage: z.enum(["EN", "FIL", "TAGLISH"]),
}).strict().superRefine((value, context) => {
  if (value.mode !== "OFF" && !value.consent) {
    context.addIssue({ code: "custom", path: ["consent"], message: "Privacy consent is required." });
  }
  if (value.mode !== "OFF" && !value.aiConsent) {
    context.addIssue({ code: "custom", path: ["aiConsent"], message: "External AI processing consent is required." });
  }
});

const identifier = z.string().min(1).max(256);
const messageSchema = z.object({
  mid: identifier,
  text: z.string().max(4000).optional(),
  is_echo: z.boolean().optional(),
  app_id: identifier.optional(),
  metadata: z.string().max(1000).optional(),
  attachments: z.array(z.unknown()).max(10).optional(),
}).passthrough();
export const messengerEnvelopeSchema = z.object({
  object: z.literal("page"),
  entry: z.array(z.object({
    id: identifier,
    time: z.number().int().nonnegative().finite(),
    messaging: z.array(z.object({
      sender: z.object({ id: identifier }),
      recipient: z.object({ id: identifier }),
      timestamp: z.number().int().nonnegative().finite(),
      message: messageSchema.optional(),
    }).passthrough()).max(100),
  }).passthrough()).max(20),
}).passthrough();

export type MessagingSettingsInput = z.infer<typeof messagingSettingsSchema>;
export type MessengerEnvelope = z.infer<typeof messengerEnvelopeSchema>;
