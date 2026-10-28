import { describe, expect, it } from "vitest";

import { getPreviewDestination } from "./OwnerDashboardPreview";

describe("owner preview navigation", () => {
  it("keeps social posts inside the preview route tree", () => {
    expect(getPreviewDestination("/social-posts")).toBe("social-posts");
    expect(getPreviewDestination("/reports")).toBe("reports");
    expect(getPreviewDestination("/inbox")).toBe("inbox");
    expect(getPreviewDestination("/unknown")).toBeNull();
  });
});
