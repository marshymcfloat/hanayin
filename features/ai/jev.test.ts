// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { isJevConfigured, triageCustomerMessage } from "@/features/ai/jev";

function responseFor(answers: unknown) {
  return new Response(JSON.stringify({ model: "jev-test", answers, usage: { input_tokens: 1, output_tokens: 1 } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Jev customer message triage", () => {
  it("reports configuration without exposing the key", () => {
    vi.stubEnv("TYPESAFE_API_KEY", " test-key ");
    expect(isJevConfigured()).toBe(true);
    vi.stubEnv("TYPESAFE_API_KEY", " ");
    expect(isJevConfigured()).toBe(false);
    vi.unstubAllEnvs();
  });

  it("submits one bounded structured request and returns typed decisions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseFor({
      intent: { type: "choice", choice: "reschedule", confidence: 0.91, probabilities: { booking: 0, reschedule: 0.91, cancel: 0, payment: 0, service_question: 0, complaint: 0, other: 0.09 } },
      urgency: { type: "score", score: 1, confidence: 0.8, legend: { 0: urgencyLevels[0], 1: urgencyLevels[1], 2: urgencyLevels[2] }, probabilities: { 0: 0, 1: 1, 2: 0 } },
    }));
    const testClient = new TypeSafeClient({ apiKey: "test-key", fetch: fetchMock, retry: { maxRetries: 0 } });

    await expect(triageCustomerMessage("Please move my appointment to tomorrow.", { client: testClient })).resolves.toEqual({
      intent: "reschedule",
      intentConfidence: 0.91,
      urgency: 1,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({
      state: { customer_message: "Please move my appointment to tomorrow." },
      questions: { intent: { type: "choice" }, urgency: { type: "score" } },
    });
    expect(request.headers).toMatchObject({ Authorization: "Bearer test-key" });
  });

  it("rejects invalid input before contacting the provider", async () => {
    const fetchMock = vi.fn();
    const testClient = new TypeSafeClient({ apiKey: "test-key", fetch: fetchMock });

    await expect(triageCustomerMessage("  ", { client: testClient })).rejects.toThrow("1–8000 characters");
    await expect(triageCustomerMessage("x".repeat(8_001), { client: testClient })).rejects.toThrow("1–8000 characters");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a key when no client is injected", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    await expect(triageCustomerMessage("Hello")).rejects.toThrow("TYPESAFE_API_KEY is not configured");
    vi.unstubAllEnvs();
  });
});

const urgencyLevels = [
  "Routine; no time pressure is expressed.",
  "Time-sensitive; the customer asks for prompt help.",
  "Critical; delay could cause immediate significant harm or loss.",
] as const;
