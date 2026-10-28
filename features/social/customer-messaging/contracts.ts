export type MessagingLanguage = "EN" | "FIL" | "TAGLISH";
export type MessagingReplyLanguage = MessagingLanguage | "UNKNOWN";
export type MessagingMode = "OFF" | "SUGGEST" | "AUTO";
export type MessagingReadinessReason =
  | "SCHEMA_UNAVAILABLE" | "ENCRYPTION_UNAVAILABLE" | "INTAKE_DISABLED"
  | "DELIVERY_DISABLED" | "WORKER_DISABLED" | "WEBHOOK_UNCONFIGURED"
  | "CHANNEL_UNVERIFIED" | "PERMISSIONS_UNVERIFIED" | "PILOT_UNVERIFIED"
  | "AI_UNAVAILABLE" | "RATE_STORE_UNAVAILABLE" | "GRAPH_VERSION_UNCONFIGURED" | "PUBLIC_URL_UNCONFIGURED";

export interface MessagingSettings {
  mode: MessagingMode;
  consent: boolean;
  aiConsent: boolean;
  paused: boolean;
  defaultLanguage: MessagingLanguage;
}

export interface InboxConversationSummary {
  id: string;
  title: string;
  status: "OPEN" | "HUMAN" | "OPTED_OUT";
  lastActivityAt: string;
  takeover: boolean;
  optedOut: boolean;
}

export interface InboxSnapshot {
  setupStatus: "READY" | "SETUP_REQUIRED";
  readinessReasons: MessagingReadinessReason[];
  channel: { displayName: string; verified: boolean } | null;
  settings: MessagingSettings;
  canEnableAuto: boolean;
  conversations: InboxConversationSummary[];
}

export type MessagingDeliveryTruth = "NONE" | "PENDING" | "CONFIRMED" | "FAILED" | "UNKNOWN";
export interface InboxConversationDetail {
  conversation: InboxConversationSummary;
  messages: Array<{
    id: string;
    direction: "INBOUND" | "OUTBOUND";
    text: string | null;
    occurredAt: string;
    deliveryStatus: MessagingDeliveryTruth;
  }>;
  draft: { text: string; createdAt: string } | null;
  deliveryTruth: MessagingDeliveryTruth;
}

export interface ClaimedMessagingJob {
  id: string;
  businessId: string;
  conversationId: string;
  revision: number;
  leaseToken: string;
  attempts: number;
  deliveryKey: string;
}

// This worker-only context must never be serialized to an owner/client DTO.
export interface MessagingContext {
  job: ClaimedMessagingJob;
  businessId: string;
  businessSlug: string;
  settings: MessagingSettings & { revision: number };
  channel: {
    id: string;
    appId: string;
    pageId: string;
    revision: number;
    verifiedAt: Date;
    permissionsVerifiedAt: Date;
    tokenEncrypted: string;
    tokenExpiresAt: Date | null;
    metadataEchoVerified: boolean;
    facebookLoginVerified: boolean;
    permissionsVerified: boolean;
    pilotVerified: boolean;
  };
  conversation: {
    revision: number;
    latestInboundAt: Date;
    latestInboundMessageId: string;
    lastHumanReplyAt: Date | null;
    takeover: boolean;
    optedOut: boolean;
    languagePreference: MessagingLanguage | null;
  };
  messages: Array<{ id: string; text: string; direction: "INBOUND" | "OUTBOUND"; occurredAt: Date }>;
  recipientId: string;
  draft: { text: string; language: MessagingReplyLanguage } | null;
}

export interface MessagingJobStore {
  claimDue(input: { limit: number; now: Date; leaseMs: number }): Promise<ClaimedMessagingJob[]>;
  loadContext(job: ClaimedMessagingJob, now: Date): Promise<MessagingContext | null>;
  saveProposal(job: ClaimedMessagingJob, proposal: { text: string; language: MessagingReplyLanguage }, now: Date, expected: { settingsRevision: number; channelRevision: number }): Promise<boolean>;
  markSending(job: ClaimedMessagingJob, now: Date, expected: { settingsRevision: number; channelRevision: number }): Promise<MessagingContext | null>;
  markOutcome(job: ClaimedMessagingJob, outcome: {
    status: "CONFIRMED" | "FAILED" | "UNKNOWN";
    providerMessageId?: string;
    retryable?: boolean;
  }, now: Date): Promise<boolean>;
  cancel(job: ClaimedMessagingJob, reason: string, now: Date): Promise<boolean>;
  recordOptOut(job: ClaimedMessagingJob, now: Date): Promise<boolean>;
  cleanupRetention(now: Date, limit: number): Promise<{ textPurged: number; metadataPurged: number }>;
}
