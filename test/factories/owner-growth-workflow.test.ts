import { describe, expect, it } from "vitest";
import { createOwnerGrowthWorkflowFixture } from "./owner-growth-workflow";
import { loginSchema } from "@/features/auth/schemas";
import { normalizePhilippinePhone } from "@/lib/services/sms-otp";

const options = { namespace: "e2e-growth-fixture", now: new Date("2030-01-15T09:00:00.000Z") };

describe("owner growth workflow fixture", () => {
  it("is deterministic and reuses shared owner/business records", () => {
    const fixture = createOwnerGrowthWorkflowFixture(options);
    expect(fixture).toEqual(createOwnerGrowthWorkflowFixture(options));
    expect(fixture.owner).toMatchObject({ id: `${options.namespace}-owner-user`, role: "OWNER", name: "E2E Growth Owner" });
    expect(fixture.business).toMatchObject({ id: `${options.namespace}-business`, slug: `${options.namespace}-salon`, initials: "EG" });
  });

  it("uses canonical contact-number login with synthetic credentials", () => {
    const fixture = createOwnerGrowthWorkflowFixture(options);
    expect(fixture.owner.contactNumber).toMatch(/^639\d{9}$/);
    expect(normalizePhilippinePhone(fixture.owner.contactNumber)).toBe(fixture.owner.contactNumber);
    expect(loginSchema.safeParse({ contact_number: fixture.owner.contactNumber, password: fixture.password }).success).toBe(true);
    expect(fixture.owner).not.toHaveProperty("email");
  });

  it("namespaces identities and contact candidates between runs", () => {
    const first = createOwnerGrowthWorkflowFixture(options);
    const second = createOwnerGrowthWorkflowFixture({ ...options, namespace: "e2e-growth-other" });
    for (const field of ["socialConnectionId", "socialPostId", "snapshotId", "opportunityId", "socialTargetId"] as const) {
      expect(first[field]).toBe(`${options.namespace}-${field === "socialConnectionId" ? "connection" : field === "socialPostId" ? "post" : field === "socialTargetId" ? "target" : field === "snapshotId" ? "snapshot" : "opportunity"}`);
      expect(first[field]).not.toBe(second[field]);
    }
    expect(first.owner.contactNumber).not.toBe(second.owner.contactNumber);
  });

  it("keeps relative clocks independent of mutable caller dates", () => {
    const now = new Date(options.now);
    const fixture = createOwnerGrowthWorkflowFixture({ ...options, now });
    now.setUTCFullYear(2040);
    fixture.now.setUTCFullYear(2041);
    expect(fixture.oneHourLater.toISOString()).toBe("2030-01-15T10:00:00.000Z");
    expect(fixture.sixHoursLater.toISOString()).toBe("2030-01-15T15:00:00.000Z");
    expect(fixture.tomorrow.toISOString()).toBe("2030-01-16T09:00:00.000Z");
    expect(fixture.owner.createdAt.toISOString()).toBe(options.now.toISOString());
  });

  it.each(["", "UPPERCASE", "with spaces", "unsafe/path", "x".repeat(65)])("rejects unsafe namespace %s", namespace => {
    expect(() => createOwnerGrowthWorkflowFixture({ ...options, namespace })).toThrow("Invalid fixture namespace");
  });

  it("rejects invalid clocks", () => {
    expect(() => createOwnerGrowthWorkflowFixture({ ...options, now: new Date("invalid") })).toThrow("Invalid fixture clock");
  });
});
