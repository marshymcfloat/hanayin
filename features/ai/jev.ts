import "server-only";

import { choice, score, TypeSafeClient } from "@typesafe-ai/sdk";
import { z } from "zod";

const customerMessageSchema = z.string().trim().min(1).max(8_000);

const intentOptions = {
  booking: "The customer wants to make a new appointment.",
  reschedule: "The customer wants to change an existing appointment.",
  cancel: "The customer wants to cancel an existing appointment.",
  payment: "The customer asks about a charge, payment, or refund.",
  service_question: "The customer asks about services, prices, or availability.",
  complaint: "The customer reports dissatisfaction or a problem.",
  other: "The message does not fit another category.",
} as const;

const urgencyLevels = [
  "Routine; no time pressure is expressed.",
  "Time-sensitive; the customer asks for prompt help.",
  "Critical; delay could cause immediate significant harm or loss.",
] as const;

const triageResultSchema = z.object({
  intent: z.enum(Object.keys(intentOptions) as [keyof typeof intentOptions, ...(keyof typeof intentOptions)[]]),
  intentConfidence: z.number().min(0).max(1),
  urgency: z.number().min(0).max(2),
});

export type CustomerMessageTriage = z.infer<typeof triageResultSchema>;

let client: TypeSafeClient | undefined;

function getClient() {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is not configured.");
  client ??= new TypeSafeClient({ apiKey, timeout: 8_000, retry: { maxRetries: 1 } });
  return client;
}

export function isJevConfigured() {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim());
}

/** Classify a customer message. Call only with data approved for external processing. */
export async function triageCustomerMessage(
  message: string,
  options: { client?: TypeSafeClient } = {},
): Promise<CustomerMessageTriage> {
  const parsedMessage = customerMessageSchema.safeParse(message);
  if (!parsedMessage.success) throw new Error("Customer message must contain 1–8000 characters.");

  const response = await (options.client ?? getClient()).systemOne({
    state: { customer_message: parsedMessage.data },
    questions: {
      intent: choice(
        "What is the customer's primary request in `customer_message`?",
        intentOptions,
      ),
      urgency: score(
        "How urgent is `customer_message` based on explicit time pressure and potential impact?",
        urgencyLevels,
      ),
    },
  });

  return triageResultSchema.parse({
    intent: response.answers.intent.choice,
    intentConfidence: response.answers.intent.confidence,
    urgency: response.answers.urgency.score,
  });
}
