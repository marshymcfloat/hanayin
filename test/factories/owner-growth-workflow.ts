import { createHash } from "node:crypto";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";

export function createOwnerGrowthWorkflowFixture(options: { namespace: string; now: Date }) {
  if (!/^[a-z0-9-]{1,64}$/.test(options.namespace)) throw new Error("Invalid fixture namespace");
  if (!Number.isFinite(options.now.getTime())) throw new Error("Invalid fixture clock");
  const factory = createSharedWorkflowFactory(options);
  const suffix = String(createHash("sha256").update(options.namespace).digest().readUInt32BE(0) % 10_000_000).padStart(7, "0");
  const business = factory.business({ name: "E2E Growth Business", initials: "EG", description: "E2E growth flow business" });
  const owner = factory.user({ name: "E2E Growth Owner", contactNumber: `63999${suffix}` });
  const later = (hours: number) => new Date(options.now.getTime() + hours * 60 * 60 * 1000);
  return {
    business, owner, password: "E2EOwner123!",
    socialConnectionId: `${options.namespace}-connection`,
    socialPostId: `${options.namespace}-post`,
    snapshotId: `${options.namespace}-snapshot`,
    opportunityId: `${options.namespace}-opportunity`,
    socialTargetId: `${options.namespace}-target`,
    now: new Date(options.now), oneHourLater: later(1), sixHoursLater: later(6), tomorrow: later(24),
  };
}
