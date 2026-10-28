import { Client, TypeOverrides } from "pg";

/** Prisma stores timestamp-without-time-zone values as UTC. */
export function createFixtureDatabaseClient(connectionString?: string) {
  const types = new TypeOverrides();
  types.setTypeParser(1114, "text", value => new Date(`${value}Z`));
  return new Client({ connectionString, connectionTimeoutMillis: 4000, types });
}
