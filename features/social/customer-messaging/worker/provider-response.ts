import "server-only";

export async function readBoundedProviderJson(response: Response, limit = 16_384): Promise<unknown> {
  if (!response.body) throw new Error("Missing provider response.");
  const size = Number(response.headers.get("content-length"));
  if (Number.isFinite(size) && size > limit) throw new Error("Oversized provider response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) throw new Error("Oversized provider response.");
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const value = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { value.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(value));
}
