import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { editOpenAIImage } from "./openai-image-client";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.OPENAI_KEY = "test-key";
  // Pin output knobs so assertions are deterministic.
  delete process.env.OPENAI_IMAGE_OUTPUT_FORMAT;
  delete process.env.OPENAI_IMAGE_SIZE;
  delete process.env.OPENAI_IMAGE_QUALITY;
  delete process.env.OPENAI_IMAGE_MODEL;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe("editOpenAIImage", () => {
  it("posts multipart form-data to the edits endpoint and decodes b64_json", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: "QUJD" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await editOpenAIImage({
      prompt: "keep this person",
      image: { bytes: Buffer.from([1, 2, 3]), mimeType: "image/png" },
    });

    expect(result.mimeType).toBe("image/png");
    expect(result.bytes.toString()).toBe("ABC");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/images/edits");
    expect(init.method).toBe("POST");
    // Content-Type must be left to fetch so the multipart boundary is set.
    expect(
      (init.headers as Record<string, string>)["Content-Type"],
    ).toBeUndefined();

    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("model")).toBe("gpt-image-1");
    expect(body.get("prompt")).toBe("keep this person");
    expect(body.get("size")).toBe("1024x1536");
    expect(body.get("image")).toBeTruthy();
  });

  it("throws when the response carries no image bytes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{}] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      editOpenAIImage({
        prompt: "x",
        image: { bytes: Buffer.from([1]), mimeType: "image/png" },
      }),
    ).rejects.toThrow();
  });
});
