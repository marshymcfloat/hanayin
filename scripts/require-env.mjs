import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
let commandName = "this command";
let anyOf = false;
let directPostgres = false;
const requiredKeys = [];

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--command") {
    commandName = args[index + 1] || commandName;
    index += 1;
  } else if (argument === "--any") {
    anyOf = true;
  } else if (argument === "--direct-postgres") {
    directPostgres = true;
  } else {
    requiredKeys.push(argument);
  }
}

if (requiredKeys.length === 0) {
  console.error(
    "Usage: node scripts/require-env.mjs [--command NAME] [--any] [--direct-postgres] <ENV_KEY> [ENV_KEY...]",
  );
  process.exit(1);
}

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!key || process.env[key]) continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnvFile(path.resolve(process.cwd(), ".env.local"));
loadDotEnvFile(path.resolve(process.cwd(), ".env"));

const valueFor = (key) => String(process.env[key] || "").trim();
const configuredKeys = requiredKeys.filter((key) => valueFor(key));
const missing = anyOf
  ? configuredKeys.length === 0
    ? requiredKeys
    : []
  : requiredKeys.filter((key) => !valueFor(key));

if (missing.length > 0) {
  const requirement = anyOf
    ? `one of ${requiredKeys.join(", ")}`
    : missing.join(", ");
  console.error(`Cannot run ${commandName}: missing ${requirement}.`);
  console.error(
    "Add the value to .env.local (preferred) or .env. Start from .env.example; never commit credentials.",
  );
  if (directPostgres) {
    console.error(
      "Use an isolated, migrated test database URL beginning with postgresql:// or postgres://.",
    );
  }
  process.exit(1);
}

if (directPostgres) {
  const keysToValidate = anyOf ? configuredKeys.slice(0, 1) : configuredKeys;
  const invalidKeys = keysToValidate.filter((key) => {
    const value = valueFor(key);
    return !value.startsWith("postgresql://") && !value.startsWith("postgres://");
  });
  if (invalidKeys.length > 0) {
    console.error(
      `Cannot run ${commandName}: ${invalidKeys.join(", ")} must use postgresql:// or postgres:// (Prisma Accelerate URLs are not direct database connections).`,
    );
    console.error(
      "Point the variable at an isolated, migrated PostgreSQL test database.",
    );
    process.exit(1);
  }
}

console.log(
  `Environment check passed for ${commandName}: ${configuredKeys.join(", ")}`,
);
