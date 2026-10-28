import path from "path";
import { defineConfig } from "vitest/config";
import { requireTestDatabase } from "./scripts/test-database-target.mjs";

const testDatabase = requireTestDatabase();
process.env.DATABASE_URL = testDatabase;
process.env.DIRECT_DATABASE_URL = testDatabase;

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/integration/**/*.integration.test.ts"],
    passWithNoTests: false,
    // Separate suites share tables; keep unrelated writes out of forced races.
    maxWorkers: 1,
    // Cloud fixture workflows can outlast the application's bounded transactions.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
