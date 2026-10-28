import { defineConfig } from "prisma/config";

// Offline schema commands must not load application secret files.
export default defineConfig({
  schema: "schema.prisma",
  migrations: { path: "migrations" },
  datasource: { url: "postgresql://offline:offline@127.0.0.1:1/offline_schema" },
});
