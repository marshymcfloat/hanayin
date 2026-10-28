import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), info: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@sentry/nextjs", () => ({ logger: { info: mocks.info } }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.connection.mockResolvedValue(undefined);
});

describe("Sentry error-demo request boundary", () => {
  it("retains the deliberate error after entering request time", async () => {
    await expect(GET()).rejects.toMatchObject({
      name: "SentryExampleAPIError",
      message: "This error is raised on the backend called by the example page.",
    });
    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.info).toHaveBeenCalledWith("Sentry example API called");
    expect(mocks.connection.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.info.mock.invocationCallOrder[0]);
  });

  it("propagates the prerender boundary without logging the example error", async () => {
    const boundary = new Error("request-time boundary fixture");
    mocks.connection.mockRejectedValue(boundary);
    await expect(GET()).rejects.toBe(boundary);
    expect(mocks.info).not.toHaveBeenCalled();
  });
});
