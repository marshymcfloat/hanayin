import "server-only";

export const MAX_MESSENGER_BODY_BYTES = 256 * 1024;
export const MAX_MESSENGER_EVENTS = 100;
export const MESSAGING_DEBOUNCE_MS = 120_000;
export const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MESSAGING_TEXT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const MESSAGING_METADATA_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_MESSAGING_ATTEMPTS = 3;

export function getMessagingConfig() {
  return {
    intakeEnabled: process.env.SOCIAL_MESSAGING_INTAKE_ENABLED === "true",
    deliveryEnabled: process.env.SOCIAL_MESSAGING_DELIVERY_ENABLED === "true",
    workerEnabled: process.env.SOCIAL_MESSAGING_WORKER_ENABLED === "true",
    aiEnabled: process.env.SOCIAL_MESSAGING_AI_ENABLED === "true",
    killSwitch: process.env.SOCIAL_MESSAGING_KILL_SWITCH !== "false",
    graphApiVersion: process.env.SOCIAL_MESSAGING_GRAPH_API_VERSION ?? "",
    publicBaseUrl: process.env.SOCIAL_MESSAGING_PUBLIC_BASE_URL ?? "",
    appId: process.env.SOCIAL_MESSAGING_APP_ID ?? "",
    appSecret: process.env.SOCIAL_MESSAGING_APP_SECRET ?? "",
    verifyToken: process.env.SOCIAL_MESSAGING_VERIFY_TOKEN ?? "",
  };
}
