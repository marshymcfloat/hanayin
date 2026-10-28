import { z } from "zod";
import { businessSlugSchema } from "@/lib/validation/business-slug";
import { ASSISTANT_INTENTS, ASSISTANT_LANGUAGES } from "@/features/social/conversation-assistant/types";

export const MAX_ASSISTANT_MESSAGE_LENGTH = 2_000;
export const MAX_ASSISTANT_SERVICES = 100;
export const MAX_ASSISTANT_EVENTS = 256;
export const MAX_ASSISTANT_DATES = 14;
export const assistantTimestampSchema = z.iso.datetime({ offset: true });
export const assistantDateSchema = z.iso.date();
const id = z.string().trim().min(1).max(200);
const publicText = z.string().trim().min(1).max(100).refine(value => Array.from(value).every(character => {
  const code = character.charCodeAt(0);
  return code >= 32 && code !== 127;
}));
const serviceId = z.number().int().positive().max(2_147_483_647);
const confidence = z.number().min(0).max(1);
const connectionStatus = z.enum(["CONNECTED", "EXPIRED", "REVOKED", "ERROR"]);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const assistantTenantSchema = z.object({ businessId: id, businessSlug: businessSlugSchema }).strict();
export const assistantPublicFactsSchema = assistantTenantSchema.extend({
  name: publicText,
  timezone: z.literal("Asia/Manila"),
  generatedAt: assistantTimestampSchema,
  services: z.array(z.object({
    id: serviceId, name: publicText, category: publicText,
    price: z.number().finite().min(0).max(1_000_000),
    durationMinutes: z.number().int().min(1).max(1_440).nullable(),
  }).strict()).max(MAX_ASSISTANT_SERVICES).refine(rows => new Set(rows.map(row => row.id)).size === rows.length),
  hours: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6), category: publicText,
    openTime: time, closeTime: time, isClosed: z.boolean(),
  }).strict()).max(100).refine(rows => new Set(rows.map(row => `${row.dayOfWeek}:${row.category.toLowerCase()}`)).size === rows.length),
}).strict();

export const assistantAvailabilitySchema = z.object({
  businessId: id, serviceId, date: assistantDateSchema, checkedAt: assistantTimestampSchema,
  slots: z.array(z.object({ startTime: assistantTimestampSchema, endTime: assistantTimestampSchema }).strict()
    .refine(slot => Date.parse(slot.endTime) > Date.parse(slot.startTime))).max(10),
}).strict();

export const assistantSettingsSchema = z.object({
  enabled: z.boolean(), ownerOptIn: z.boolean(), externalProcessingConsent: z.boolean(),
  connectionVerified: z.boolean(), messagingPermissionVerified: z.boolean(), connectionStatus,
  paused: z.boolean(),
}).strict();

export const assistantDecisionSchema = z.object({
  intent: z.enum(ASSISTANT_INTENTS), intentConfidence: confidence,
  serviceId: serviceId.nullable(), serviceConfidence: confidence,
  date: assistantDateSchema.nullable(), dateConfidence: confidence,
  language: z.enum(ASSISTANT_LANGUAGES).optional(), languageConfidence: confidence.optional(),
}).strict();

export const assistantConversationStateSchema = z.object({
  businessId: id, externalAccountId: id, eventIds: z.array(id).max(MAX_ASSISTANT_EVENTS),
  latestInbound: z.object({ eventId: id, at: assistantTimestampSchema, text: z.string().min(1).max(MAX_ASSISTANT_MESSAGE_LENGTH) }).strict().nullable(),
  latestHumanReplyAt: assistantTimestampSchema.nullable(), latestAssistantReplyAt: assistantTimestampSchema.nullable(),
  controlAt: assistantTimestampSchema.nullable(), paused: z.boolean(), takenOver: z.boolean(), optedOut: z.boolean(),
  ambiguousInbound: z.boolean(), overflowed: z.boolean(),
}).strict();

const eventBase = z.object({ eventId: id, businessId: id, externalAccountId: id, at: assistantTimestampSchema });
export const assistantConversationEventSchema = z.discriminatedUnion("kind", [
  eventBase.extend({ kind: z.literal("inbound"), text: z.string().trim().min(1).max(MAX_ASSISTANT_MESSAGE_LENGTH) }).strict(),
  eventBase.extend({ kind: z.literal("outbound_echo"), author: z.enum(["HUMAN", "ASSISTANT", "UNKNOWN"]) }).strict(),
  ...(["read_receipt", "takeover", "pause", "resume", "opt_out"] as const).map(kind => eventBase.extend({ kind: z.literal(kind) }).strict()),
]);

export const assistantConnectionCandidateSchema = z.object({ businessId: id, externalAccountId: id, status: connectionStatus }).strict();
export const assistantTriageInputSchema = z.object({
  message: z.string().trim().min(1).max(MAX_ASSISTANT_MESSAGE_LENGTH),
  services: z.array(z.object({ id: serviceId, name: publicText, category: publicText }).strict()).max(MAX_ASSISTANT_SERVICES)
    .refine(rows => new Set(rows.map(row => row.id)).size === rows.length),
  dates: z.array(assistantDateSchema).max(MAX_ASSISTANT_DATES).refine(rows => new Set(rows).size === rows.length),
  languageContext: z.object({
    establishedLanguage: z.enum(ASSISTANT_LANGUAGES),
    recentMessages: z.array(z.string().trim().min(1).max(MAX_ASSISTANT_MESSAGE_LENGTH)).max(3),
  }).strict().optional(),
}).strict();

export const assistantSimulationInputSchema = z.object({
  tenant: assistantTenantSchema, facts: assistantPublicFactsSchema, settings: assistantSettingsSchema,
  message: z.string().trim().min(1).max(MAX_ASSISTANT_MESSAGE_LENGTH), receivedAt: assistantTimestampSchema,
  now: assistantTimestampSchema, state: assistantConversationStateSchema.optional(),
  decision: assistantDecisionSchema.optional(), availability: assistantAvailabilitySchema.optional(),
}).strict();
