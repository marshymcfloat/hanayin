type PrismaCliEnvironment = {
  [key: string]: string | undefined;
  DIRECT_DATABASE_URL?: string;
};

export function getPrismaCliDatabaseUrl(env: PrismaCliEnvironment) {
  const directDatabaseUrl = env.DIRECT_DATABASE_URL?.trim();

  if (!directDatabaseUrl) {
    throw new Error(
      "DIRECT_DATABASE_URL is required for Prisma CLI commands. Refusing to fall back to DATABASE_URL.",
    );
  }

  return directDatabaseUrl;
}
