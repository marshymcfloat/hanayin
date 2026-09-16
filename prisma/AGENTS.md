# Prisma Instructions

These instructions extend the repository root `AGENTS.md` for `prisma/`.

## Schema and Migrations

- Treat `schema.prisma` as the model source of truth.
- Create a new, descriptively named migration for every schema change. Never
  modify or reorder a committed migration.
- Review generated SQL before applying it. Pay particular attention to data
  loss, table rewrites, locks, defaults, uniqueness, foreign keys, and indexes.
- Use `npx prisma migrate dev --name <description>` only against a disposable
  development database. Use `npx prisma migrate deploy` for CI and production.
- Put database behavior Prisma cannot express in a reviewed migration. Keep
  reusable manual SQL under `prisma/sql/` and document how it is applied.
- Preserve tenant ownership and indexes when adding tenant-scoped models or
  relations.

## Client and Seed Data

- Never hand-edit files under `prisma/generated/`; regenerate them through
  Prisma after schema changes.
- Import the shared client from `@/prisma/prisma`; do not instantiate additional
  Prisma clients in application code.
- Keep `seed.ts` deterministic and safe for development. Never add real customer
  data, credentials, tokens, or production-only assumptions.
- Do not run seed or destructive reset commands against an unknown or shared
  database.

## Verification

- Run `npx prisma validate` after schema or Prisma configuration changes.
- Run `npx prisma generate` when the schema changes and include the expected
  generated-client updates.
- Run relevant database integration tests for constraints, transactions, raw
  SQL, migrations, or tenant-isolation behavior.
- State which database was used and whether migrations were applied when
  reporting results.
