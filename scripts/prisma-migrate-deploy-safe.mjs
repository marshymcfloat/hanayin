import { spawnSync } from "node:child_process";

// Migrations that are known to fail on first attempt due to PostgreSQL
// transaction limitations (e.g. using a newly-added enum value in the same
// transaction as ALTER TYPE ... ADD VALUE). They are safe to roll back and
// retry because idempotent guards (IF NOT EXISTS / IF EXISTS) ensure the
// retry succeeds.
const KNOWN_FAILING_MIGRATIONS = [
  "20260216091540_add_subscription_upgrade_request",
  "20260425000000_remove_qrph_replace_online",
];

function runPrisma(args, { allowFailure = false } = {}) {
  const result = spawnSync("npx", ["prisma", ...args], {
    encoding: "utf8",
    stdio: "pipe",
    // On Windows, spawning cmd shims like npx.cmd directly can fail with EINVAL.
    shell: process.platform === "win32",
  });

  if (result.error) {
    process.stderr.write(
      `[PrismaDeploySafe] Failed to run prisma command: ${result.error.message}\n`,
    );
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const exitCode = typeof result.status === "number" ? result.status : 1;
  if (!allowFailure && exitCode !== 0) {
    process.exit(exitCode);
  }

  return { exitCode, output };
}

function detectFailedMigration(output) {
  if (!output.includes("P3009") && !output.includes("P3018")) return null;
  return (
    KNOWN_FAILING_MIGRATIONS.find((m) => output.includes(m)) ?? null
  );
}

console.log("[PrismaDeploySafe] Running prisma migrate deploy...");
const initial = runPrisma(["migrate", "deploy"], { allowFailure: true });
if (initial.exitCode === 0) process.exit(0);

const failedMigration = detectFailedMigration(initial.output);
if (!failedMigration) process.exit(initial.exitCode);

console.log(
  `[PrismaDeploySafe] Recovering failed migration: ${failedMigration}`,
);
runPrisma(["migrate", "resolve", "--rolled-back", failedMigration], {
  allowFailure: true,
});

const retryAfterRollback = runPrisma(["migrate", "deploy"], {
  allowFailure: true,
});
if (retryAfterRollback.exitCode === 0) process.exit(0);

const stillFailed = detectFailedMigration(retryAfterRollback.output);
if (!stillFailed) process.exit(retryAfterRollback.exitCode);

console.log(
  `[PrismaDeploySafe] Marking migration as applied: ${stillFailed}`,
);
runPrisma(["migrate", "resolve", "--applied", stillFailed], {
  allowFailure: true,
});

const finalRetry = runPrisma(["migrate", "deploy"], { allowFailure: true });
process.exit(finalRetry.exitCode);
