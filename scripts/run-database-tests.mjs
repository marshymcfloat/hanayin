import { spawn } from "node:child_process";
import path from "node:path";
import { requireTestDatabase } from "./test-database-target.mjs";

const modes = {
  integration: ["vitest/vitest.mjs", "run", "--config", "vitest.integration.config.ts"],
  db: ["@playwright/test/cli.js", "test", "test/e2e/public-booking-smoke.spec.ts"],
  payroll: ["@playwright/test/cli.js", "test", "test/e2e/payroll-lifecycle-flow.spec.ts"],
  all: ["@playwright/test/cli.js", "test", "test/e2e/platform-admin-smoke.spec.ts", "test/e2e/private-routes-smoke.spec.ts", "test/e2e/owner-growth-flow.spec.ts", "test/e2e/public-booking-smoke.spec.ts", "test/e2e/booking-manage-flow.spec.ts", "test/e2e/payroll-flow.spec.ts", "test/e2e/payroll-lifecycle-flow.spec.ts", "test/e2e/internal-booking-flow.spec.ts"],
};
const mode = modes[process.argv[2]];
if (!mode) {
  console.error("Usage: node scripts/run-database-tests.mjs integration|db|payroll|all");
  process.exit(1);
}
let connectionString;
try { connectionString = requireTestDatabase(); } catch (error) {
  console.error(error.message);
  process.exit(1);
}
const child = spawn(process.execPath, [path.resolve("node_modules", mode[0]), ...mode.slice(1), ...process.argv.slice(3)], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: connectionString,
    DIRECT_DATABASE_URL: connectionString,
    E2E_DATABASE_URL: connectionString,
    ...(["all", "payroll"].includes(process.argv[2]) ? { E2E_PAYROLL_LIFECYCLE: "1" } : {}),
    ...(process.argv[2] === "all" ? {
      E2E_OWNER_FLOW: "1",
      E2E_PAYROLL_FLOW: "1",
      E2E_BOOKING_FLOW: "1",
    } : {}),
  },
});
child.on("error", () => {
  console.error("Could not start database test runner.");
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
