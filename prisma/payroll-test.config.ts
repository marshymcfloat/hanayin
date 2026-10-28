import { defineConfig } from "prisma/config";
import { requireTestDatabase } from "../scripts/test-database-target.mjs";

export default defineConfig({
  schema: "schema.prisma",
  migrations: { path: "migrations" },
  datasource: { url: requireTestDatabase() },
});
