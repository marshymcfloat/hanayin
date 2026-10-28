type RuntimeDatabaseEnvironment = {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  DIRECT_DATABASE_URL?: string;
};

export function getRuntimeDatabaseUrl(env: RuntimeDatabaseEnvironment) {
  if (env.NODE_ENV === "development") {
    if (!env.DIRECT_DATABASE_URL) {
      throw new Error(
        "DIRECT_DATABASE_URL is required for local development.",
      );
    }

    return env.DIRECT_DATABASE_URL;
  }

  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }

  return env.DATABASE_URL;
}
