import { describe, expect, it } from "vitest";

import { getPrioritySocialPostId, getSocialSummaryLabel } from "./SaleEventList";

describe("SaleEventList social summary helpers", () => {
  it("prioritizes failed status label", () => {
    const label = getSocialSummaryLabel([
      { status: "PUBLISHED" },
      { status: "FAILED" },
      { status: "READY" },
    ]);

    expect(label).toBe("Needs attention");
  });

  it("returns ready-to-publish before draft", () => {
    const label = getSocialSummaryLabel([{ status: "DRAFT" }, { status: "READY" }]);

    expect(label).toBe("Ready to publish");
  });

  it("returns a post id using priority order", () => {
    const postId = getPrioritySocialPostId([
      { id: "published", status: "PUBLISHED" },
      { id: "ready", status: "READY" },
      { id: "draft", status: "DRAFT" },
    ]);

    expect(postId).toBe("ready");
  });
});
