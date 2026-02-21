import { spawnSync } from "node:child_process";

const TARGET_MIGRATION = "20260216091540_add_subscription_upgrade_request";

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

function isKnownHistoricalMigrationFailure(output) {
  return (
    output.includes(TARGET_MIGRATION) &&
    (output.includes("P3009") || output.includes("P3018"))
  );
}

console.log("[PrismaDeploySafe] Running prisma migrate deploy...");
const initial = runPrisma(["migrate", "deploy"], { allowFailure: true });
if (initial.exitCode === 0) {
  process.exit(0);
}

if (!isKnownHistoricalMigrationFailure(initial.output)) {
  process.exit(initial.exitCode);
}

console.log(
  `[PrismaDeploySafe] Recovering failed historical migration: ${TARGET_MIGRATION}`,
);
runPrisma(["migrate", "resolve", "--rolled-back", TARGET_MIGRATION], {
  allowFailure: true,
});

const retryAfterRollback = runPrisma(["migrate", "deploy"], {
  allowFailure: true,
});
if (retryAfterRollback.exitCode === 0) {
  process.exit(0);
}

if (!isKnownHistoricalMigrationFailure(retryAfterRollback.output)) {
  process.exit(retryAfterRollback.exitCode);
}

console.log(
  `[PrismaDeploySafe] Marking historical migration as applied: ${TARGET_MIGRATION}`,
);
runPrisma(["migrate", "resolve", "--applied", TARGET_MIGRATION], {
  allowFailure: true,
});

const finalRetry = runPrisma(["migrate", "deploy"], { allowFailure: true });
process.exit(finalRetry.exitCode);
