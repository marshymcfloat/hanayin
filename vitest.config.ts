import { configDefaults, defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    exclude: [...configDefaults.exclude, "test/e2e/**", "tests/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "app/api/cron/expire-holds/route.ts",
        "app/api/cron/process-outbox/route.ts",
        "app/api/health/route.ts",
        "app/api/upload/route.ts",
        "lib/date-utils.ts",
        "lib/rate-limit.ts",
        "lib/security/booking-success-token.ts",
        "lib/security/onboarding-status-token.ts",
        "lib/server actions/booking.ts",
        "lib/server actions/dashboard/employee.ts",
        "lib/server actions/subscription-owner.ts",
        "lib/services/booking-pricing.ts",
        "lib/services/outbox.ts",
        "lib/utils/employee-specialties.ts",
        "lib/utils/pricing.ts",
      ],
      exclude: [
        "**/*.d.ts",
        "**/*.test.*",
        "test/**",
        "node_modules/**",
        ".next/**",
      ],
      thresholds: {
        statements: 60,
        branches: 55,
        functions: 70,
        lines: 60,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
