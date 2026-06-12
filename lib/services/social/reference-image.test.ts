import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchReferenceImageBytes } from "./reference-image";

const URL = "https://example.public.blob.vercel-storage.com/ref.png";

// Minimal Response stand-in. The helper only reads ok / headers.get /
// arrayBuffer, and a real Response recomputes Content-Length from the body
// (which would defeat the oversized-header test), so we fake it directly.
function imageResponse(
  bytes: Uint8Array,
  contentType: string,
  extraHeaders: Record<string, string> = {},
) {
  const headers = new Headers({ "Content-Type": contentType, ...extraHeaders });
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return {
    ok: true,
    status: 200,
    headers,
    arrayBuffer: async () => arrayBuffer,
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchReferenceImageBytes", () => {
  it("returns base64 + mimeType on a valid image response", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      imageResponse(bytes, "image/png"),
    );

    const result = await fetchReferenceImageBytes(URL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mimeType).toBe("image/png");
      expect(result.data).toBe(Buffer.from(bytes).toString("base64"));
    }
  });

  it("normalizes a content-type with charset and casing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      imageResponse(new Uint8Array([9]), "IMAGE/JPEG; charset=binary"),
    );

    const result = await fetchReferenceImageBytes(URL);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mimeType).toBe("image/jpeg");
  });

  it("rejects an unsupported content type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      imageResponse(new Uint8Array([1]), "application/pdf"),
    );

    const result = await fetchReferenceImageBytes(URL);
    expect(result.ok).toBe(false);
  });

  it("rejects a non-200 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 404 }),
    );

    const result = await fetchReferenceImageBytes(URL);
    expect(result.ok).toBe(false);
  });

  it("rejects when the declared content-length exceeds the budget", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      imageResponse(new Uint8Array([1, 2]), "image/png", {
        "Content-Length": String(8 * 1024 * 1024 + 1),
      }),
    );

    const result = await fetchReferenceImageBytes(URL);
    expect(result.ok).toBe(false);
  });

  it("rejects an empty body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      imageResponse(new Uint8Array([]), "image/png"),
    );

    const result = await fetchReferenceImageBytes(URL);
    expect(result.ok).toBe(false);
  });

  it("returns a failure when fetch throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));

    const result = await fetchReferenceImageBytes(URL);
    expect(result.ok).toBe(false);
  });
});
