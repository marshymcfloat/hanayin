import { describe, expect, it, vi } from "vitest";
vi.mock("@/prisma/prisma", () => ({ prisma: {} }));
vi.mock("@/features/catalog/catalog-access", () => ({ hasCurrentCatalogWriteAccess: vi.fn() }));
import { serviceAdministrationError } from "./service-administration";

describe("service administration failure mapping", () => {
  it.each([null, undefined, "internal detail", new Error("private detail"), { code: "P2002" }])("contains unknown failures %#", (error) => {
    expect(serviceAdministrationError(error, "Safe fallback")).toBe("Safe fallback");
  });
  it("contains missing target failures", () => {
    expect(serviceAdministrationError({ code: "P2025", message: "private detail" }, "fallback")).toBe("Service not found or unauthorized");
  });
  it("contains serialization conflicts", () => {
    expect(serviceAdministrationError({ code: "P2034", message: "private detail" }, "fallback")).toBe("Service catalog changed. Refresh and try again.");
  });
});
