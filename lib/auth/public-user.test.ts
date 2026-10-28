import { describe, expect, it } from "vitest";
import { publicUserSelect, toPublicUser } from "./public-user";

describe("public user projection", () => {
  it("selects only public fields", () => {
    expect(Object.keys(publicUserSelect).sort()).toEqual(["id", "name", "contact_number", "role", "created_at", "updated_at"].sort());
  });

  it("drops credentials and unknown future fields from serialization", () => {
    const user = { id: "u", name: "Staff", contact_number: "contact", role: "EMPLOYEE" as const, created_at: new Date(), updated_at: new Date(), hashed_password: "test-only-secret", must_change_password: true, temp_password_expires_at: new Date(), future_secret: "test-only-secret" };
    const dto = toPublicUser(user);
    expect(Object.keys(dto).sort()).toEqual(Object.keys(publicUserSelect).sort());
    expect(JSON.stringify(dto)).not.toContain("test-only-secret");
  });
});
