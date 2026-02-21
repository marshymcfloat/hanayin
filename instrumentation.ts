import * as Sentry from "@sentry/nextjs";
import { validateServerRuntimeEnv } from "@/lib/env-runtime";

export async function register() {
  if (process.env.NODE_ENV === "development") {
    return;
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    validateServerRuntimeEnv({
      strict: process.env.NODE_ENV === "production",
    });
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError: typeof Sentry.captureRequestError = (...args) => {
  if (process.env.NODE_ENV === "development") {
    return;
  }

  return Sentry.captureRequestError(...args);
};
