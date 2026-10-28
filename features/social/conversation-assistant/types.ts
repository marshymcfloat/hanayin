export type AssistantTenant = { businessId: string; businessSlug: string };

export type AssistantPublicFacts = AssistantTenant & {
  name: string;
  timezone: "Asia/Manila";
  generatedAt: string;
  services: Array<{ id: number; name: string; category: string; price: number; durationMinutes: number | null }>;
  hours: Array<{ dayOfWeek: number; category: string; openTime: string; closeTime: string; isClosed: boolean }>;
};

export type AssistantAvailability = {
  businessId: string;
  serviceId: number;
  date: string;
  checkedAt: string;
  slots: Array<{ startTime: string; endTime: string }>;
};

export type AssistantSettings = {
  enabled: boolean;
  ownerOptIn: boolean;
  externalProcessingConsent: boolean;
  connectionVerified: boolean;
  messagingPermissionVerified: boolean;
  connectionStatus: "CONNECTED" | "EXPIRED" | "REVOKED" | "ERROR";
  paused: boolean;
};

export const ASSISTANT_INTENTS = ["services", "hours", "categories", "availability", "recommendation", "booking_link", "clarify", "handoff"] as const;
export type AssistantIntent = (typeof ASSISTANT_INTENTS)[number];
export const ASSISTANT_LANGUAGES = ["ENGLISH", "FILIPINO", "TAGLISH", "UNKNOWN"] as const;
export type AssistantLanguage = (typeof ASSISTANT_LANGUAGES)[number];

export type AssistantDecision = {
  intent: AssistantIntent;
  intentConfidence: number;
  serviceId: number | null;
  serviceConfidence: number;
  date: string | null;
  dateConfidence: number;
  language?: AssistantLanguage;
  languageConfidence?: number;
};

export type AssistantConversationState = {
  businessId: string;
  externalAccountId: string;
  eventIds: string[];
  latestInbound: { eventId: string; at: string; text: string } | null;
  latestHumanReplyAt: string | null;
  latestAssistantReplyAt: string | null;
  controlAt: string | null;
  paused: boolean;
  takenOver: boolean;
  optedOut: boolean;
  ambiguousInbound: boolean;
  overflowed: boolean;
};

type AssistantEventIdentity = { eventId: string; businessId: string; externalAccountId: string; at: string };
export type AssistantConversationEvent = AssistantEventIdentity & (
  | { kind: "inbound"; text: string }
  | { kind: "outbound_echo"; author: "HUMAN" | "ASSISTANT" | "UNKNOWN" }
  | { kind: "read_receipt" | "takeover" | "pause" | "resume" | "opt_out" }
);

export type AssistantConnectionCandidate = {
  businessId: string;
  externalAccountId: string;
  status: AssistantSettings["connectionStatus"];
};

export type AssistantSimulationInput = {
  tenant: AssistantTenant;
  facts: AssistantPublicFacts;
  settings: AssistantSettings;
  message: string;
  receivedAt: string;
  now: string;
  state?: AssistantConversationState;
  decision?: AssistantDecision;
  availability?: AssistantAvailability;
};

export type AssistantTriageInput = {
  message: string;
  services: Array<Pick<AssistantPublicFacts["services"][number], "id" | "name" | "category">>;
  dates: string[];
  languageContext?: {
    establishedLanguage: AssistantLanguage;
    recentMessages: string[];
  };
};

export type AssistantSimulationResult = {
  mode: "DRY_RUN";
  sent: false;
  status: "WAITING" | "SUPPRESSED" | "HANDOFF" | "PROPOSED";
  reason: string;
  reply: string | null;
  eligibleAt: string | null;
  decision?: AssistantDecision;
};
