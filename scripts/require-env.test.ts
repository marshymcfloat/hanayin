import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
const scriptPath = path.resolve(process.cwd(), "scripts/require-env.mjs");

function run(args: string[], env: Record<string, string | undefined> = {}) {
  const cwd = mkdtempSync(path.join(tmpdir(), "serviceflow-env-check-"));
  temporaryDirectories.push(cwd);
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      NODE_ENV: "test",
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      ...env,
    },
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("require-env", () => {
  it("explains how to configure a missing database variable", () => {
    const result = run([
      "--command",
      "test:integration",
      "--direct-postgres",
      "DIRECT_DATABASE_URL",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Cannot run test:integration: missing DIRECT_DATABASE_URL.",
    );
    expect(result.stderr).toContain("Start from .env.example");
    expect(result.stderr).toContain("isolated, migrated test database");
  });

  it("accepts the first configured alternative", () => {
    const result = run(
      [
        "--command",
        "test:e2e:db",
        "--any",
        "--direct-postgres",
        "E2E_DATABASE_URL",
        "DIRECT_DATABASE_URL",
      ],
      { E2E_DATABASE_URL: "postgresql://localhost/serviceflow_e2e" },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Environment check passed for test:e2e:db: E2E_DATABASE_URL",
    );
  });

  it("rejects non-direct database protocols", () => {
    const result = run(
      ["--command", "test:e2e:db", "--direct-postgres", "E2E_DATABASE_URL"],
      { E2E_DATABASE_URL: "prisma+postgres://accelerate.example/test" },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must use postgresql:// or postgres://");
  });
});
