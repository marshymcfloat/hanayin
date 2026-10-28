// Explicit test configuration only. Never fall back to application credentials.
/** @param {Record<string, string | undefined>} env */
export function requireTestDatabase(env = process.env) {
  const connectionString = env.TEST_DATABASE_URL?.trim();
  if (!connectionString || env.TEST_DATABASE_DISPOSABLE !== "1") {
    throw new Error("Database tests require TEST_DATABASE_URL and TEST_DATABASE_DISPOSABLE=1 for a verified disposable database. Never use service-flow-dev.");
  }
  let url;
  try { url = new URL(connectionString); } catch {
    throw new Error("TEST_DATABASE_URL must be a valid direct PostgreSQL URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length <= 1) {
    throw new Error("TEST_DATABASE_URL must be a direct PostgreSQL URL with a database name.");
  }
  if (/(?:^|[-_])(dev|development|staging|prod|production)(?:$|[-_])/i.test(decodeURIComponent(url.pathname.slice(1)))) {
    throw new Error("Refusing a development, staging, or production database target.");
  }
  return connectionString;
}
