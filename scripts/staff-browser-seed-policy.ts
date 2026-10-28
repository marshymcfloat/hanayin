export type StaffSeedTarget = {
  databaseName: string;
  providerProjectFingerprint: string;
};

export type StaffSeedApproval = {
  databaseName: string;
  providerProjectFingerprint: string;
  environment: string;
};

export function classifyStaffSeedTarget(target: StaffSeedTarget, approval?: StaffSeedApproval) {
  if (!approval) return { allowed: false as const, classification: "unverified" };
  if (approval.environment !== "development" && approval.environment !== "test") {
    return { allowed: false as const, classification: "invalid-environment" };
  }
  if (!target.databaseName.trim() || !approval.databaseName.trim()) {
    return { allowed: false as const, classification: "missing-database" };
  }
  if (/(?:^|[-_])(prod|production|staging)(?:$|[-_])/i.test(target.databaseName)) {
    return { allowed: false as const, classification: "protected-name" };
  }
  if (!/^[a-f0-9]{64}$/.test(target.providerProjectFingerprint) ||
      !/^[a-f0-9]{64}$/.test(approval.providerProjectFingerprint)) {
    return { allowed: false as const, classification: "invalid-fingerprint" };
  }
  if (target.databaseName !== approval.databaseName || target.providerProjectFingerprint !== approval.providerProjectFingerprint) {
    return { allowed: false as const, classification: "identity-mismatch" };
  }
  return { allowed: true as const, classification: approval.environment };
}
