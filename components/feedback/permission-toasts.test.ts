import { vi } from "vitest";

const errorMock = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => errorMock(...args),
  },
}));

import {
  showActionErrorToast,
  showForbiddenToast,
  showGenericErrorToast,
} from "./permission-toasts";

beforeEach(() => {
  errorMock.mockReset();
});

describe("showForbiddenToast", () => {
  it("uses the default copy when no action is provided", () => {
    showForbiddenToast();
    expect(errorMock).toHaveBeenCalledWith(
      "Permission needed",
      expect.objectContaining({
        description: expect.stringContaining("You don't have permission"),
      }),
    );
  });

  it("includes the action name when provided", () => {
    showForbiddenToast({ action: "modify this booking" });
    expect(errorMock).toHaveBeenCalledWith(
      "Permission needed",
      expect.objectContaining({
        description: expect.stringContaining("modify this booking"),
      }),
    );
  });

  it("respects an explicit description override", () => {
    showForbiddenToast({ description: "Locked by policy." });
    expect(errorMock).toHaveBeenCalledWith(
      "Permission needed",
      expect.objectContaining({ description: "Locked by policy." }),
    );
  });
});

describe("showGenericErrorToast", () => {
  it("uses a default body when no error is provided", () => {
    showGenericErrorToast();
    expect(errorMock).toHaveBeenCalledWith(
      "Couldn't complete that",
      expect.objectContaining({
        description: "Something went wrong. Please try again.",
      }),
    );
  });

  it("truncates long messages", () => {
    const long = "x".repeat(500);
    showGenericErrorToast(long);
    const description = errorMock.mock.calls[0][1].description as string;
    expect(description.length).toBeLessThanOrEqual(200);
    expect(description.endsWith("…")).toBe(true);
  });
});

describe("showActionErrorToast", () => {
  it("routes Forbidden to the permission toast", () => {
    showActionErrorToast("Forbidden", { action: "delete" });
    expect(errorMock).toHaveBeenCalledWith(
      "Permission needed",
      expect.objectContaining({
        description: expect.stringContaining("delete"),
      }),
    );
  });

  it("routes Unauthorized to a sign-in toast", () => {
    showActionErrorToast("Unauthorized");
    expect(errorMock).toHaveBeenCalledWith(
      "Please sign in",
      expect.objectContaining({ description: expect.any(String) }),
    );
  });

  it("falls through to the generic toast for unknown errors", () => {
    showActionErrorToast("Database is on fire");
    expect(errorMock).toHaveBeenCalledWith(
      "Couldn't complete that",
      expect.objectContaining({ description: "Database is on fire" }),
    );
  });
});
