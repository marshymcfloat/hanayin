// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfigFromFile } from "@prisma/config";

const require = createRequire(import.meta.url);
const configRequire = createRequire(require.resolve("@prisma/config"));
const prismaRequire = createRequire(require.resolve("prisma/package.json"));
type MergeModule = {
  deepmerge: (...values: unknown[]) => unknown;
};
const cjsMerge = configRequire("deepmerge-ts") as MergeModule;
const mergeRoot = packageInfo(configRequire.resolve("deepmerge-ts"), "deepmerge-ts").root;
const mergeManifest = JSON.parse(fs.readFileSync(path.join(mergeRoot, "package.json"), "utf8"));
const esmMerge = await import(pathToFileURL(path.join(mergeRoot, mergeManifest.exports.import)).href) as MergeModule;

function packageInfo(entry: string, name: string): { version: string; root: string } {
  let directory = path.dirname(entry);
  while (directory !== path.dirname(directory)) {
    const manifest = path.join(directory, "package.json");
    if (fs.existsSync(manifest)) {
      const info = JSON.parse(fs.readFileSync(manifest, "utf8"));
      if (info.name === name) return { version: info.version, root: directory };
    }
    directory = path.dirname(directory);
  }
  throw new Error(`Cannot locate ${name} package metadata`);
}

describe.each([["CommonJS", cjsMerge.deepmerge], ["ESM", esmMerge.deepmerge]] as const)("scoped Prisma dependency compatibility (%s)", (_entrypoint, deepmerge) => {
  it("resolves the aligned versions and narrowly scoped patched dependencies", () => {
    for (const name of ["prisma", "@prisma/client", "@prisma/adapter-pg", "@prisma/config"]) {
      const entry = name === "prisma" ? require.resolve("prisma/package.json") : require.resolve(name);
      expect(packageInfo(entry, name).version).toBe("7.10.0");
    }
    expect(packageInfo(configRequire.resolve("deepmerge-ts"), "deepmerge-ts").version).toBe("8.0.2");
    expect(packageInfo(configRequire.resolve("c12"), "c12").version).toBe("3.3.4");
    expect(packageInfo(prismaRequire.resolve("mysql2"), "mysql2").version).toBe("3.24.4");
    expect(prismaRequire.resolve("@prisma/config")).toBe(require.resolve("@prisma/config"));
  });

  it("retains last-defined record precedence and nonmutating array concatenation", () => {
    const first = { schema: "first", migrations: { seed: "seed-first", items: [1, 2] } };
    const second = { schema: "second", migrations: { path: "migrations", items: [3] } };
    const expected = { schema: "second", migrations: { seed: "seed-first", path: "migrations", items: [1, 2, 3] } };
    expect(deepmerge(first, second)).toEqual(expected);
    expect(deepmerge(first, second)).toEqual(expected);
    expect(first.migrations.items).toEqual([1, 2]);
    expect(second.migrations.items).toEqual([3]);
    expect(deepmerge(undefined, first, undefined)).toBe(first);
  });

  it("merges colliding Map values without mutating source containers", () => {
    const single = { untouched: true };
    const first = new Map<string, unknown>([["same", { left: 1, items: [1] }], ["single", single]]);
    const second = new Map<string, unknown>([["same", { right: 2, items: [2] }], ["other", 3]]);
    for (let attempt = 0; attempt < 2; attempt++) {
      const merged = deepmerge(first, second) as Map<string, unknown>;
      expect(merged.get("same")).toEqual({ left: 1, right: 2, items: [1, 2] });
      expect(merged.get("same")).not.toBe(first.get("same"));
      expect(merged.get("same")).not.toBe(second.get("same"));
      expect(merged.get("single")).toBe(single);
      expect(merged.get("other")).toBe(3);
    }
    expect(first.get("same")).toEqual({ left: 1, items: [1] });
    expect(second.get("same")).toEqual({ right: 2, items: [2] });
  });

  it("merges recursive records without stack exhaustion", () => {
    const first: Record<string, unknown> = { left: 1 };
    const second: Record<string, unknown> = { right: 2 };
    first.self = first;
    second.self = second;
    const merged = deepmerge(first, second) as Record<string, unknown>;
    expect(merged.left).toBe(1);
    expect(merged.right).toBe(2);
    expect(merged.self).toBe(merged);
    expect(first.self).toBe(first);
    expect(second.self).toBe(second);
  });

  it("merges recursive Maps without stack exhaustion", () => {
    const first = new Map<string, unknown>([["left", 1]]);
    const second = new Map<string, unknown>([["right", 2]]);
    first.set("self", first);
    second.set("self", second);
    const merged = deepmerge(first, second) as Map<string, unknown>;
    expect(merged.get("left")).toBe(1);
    expect(merged.get("right")).toBe(2);
    expect(merged.get("self")).toBe(merged);
  });
});

describe("Prisma config loading without secret files", () => {
  let directory: string;
  let secretAttempts: string[];
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "service-flow-prisma-config-"));
    secretAttempts = [];
    const guard = (file: Parameters<typeof fs.readFileSync>[0]) => {
      const filename = typeof file === "number" ? "" : file instanceof URL ? file.pathname : file.toString();
      if (/^\.env(?:\..*)?$/i.test(path.basename(filename))) {
        secretAttempts.push(path.basename(filename));
        throw new Error("Secret-file access forbidden in config compatibility tests");
      }
    };
    const originalRead = fs.readFileSync;
    vi.spyOn(fs, "readFileSync").mockImplementation((...args: Parameters<typeof fs.readFileSync>) => {
      guard(args[0]);
      return originalRead(...args);
    });
    const originalAsyncRead = fs.promises.readFile;
    vi.spyOn(fs.promises, "readFile").mockImplementation((async (...args: Parameters<typeof fs.promises.readFile>) => {
      if (!(args[0] instanceof Object && "readFile" in args[0])) guard(args[0] as fs.PathLike);
      return originalAsyncRead(...args);
    }) as typeof fs.promises.readFile);
    const originalStat = fs.statSync;
    vi.spyOn(fs, "statSync").mockImplementation(((...args: Parameters<typeof fs.statSync>) => {
      guard(args[0]);
      return originalStat(...args);
    }) as typeof fs.statSync);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("service-flow-prisma-config-")) {
      throw new Error("Refusing cleanup outside the owned fixture directory");
    }
    fs.rmSync(resolved, { recursive: true, force: true });
    expect(secretAttempts).toEqual([]);
  });

  function fixture(filename: string, config: unknown) {
    const target = path.join(directory, filename);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `export default ${JSON.stringify(config)};\n`);
    return target;
  }

  it("discovers legacy config and preserves datasource and migration settings", async () => {
    const target = fixture("prisma.config.mjs", { schema: "schema.prisma", datasource: { url: "postgresql://fixture:fixture@localhost:5432/fixture" }, migrations: { path: "migrations", seed: "node synthetic-seed.mjs" } });
    const result = await loadConfigFromFile({ configRoot: directory });
    expect(result.error).toBeUndefined();
    expect(result.resolvedPath).toBe(target);
    expect(result.config).toMatchObject({ schema: path.join(directory, "schema.prisma"), datasource: { url: "postgresql://fixture:fixture@localhost:5432/fixture" }, migrations: { path: path.join(directory, "migrations"), seed: "node synthetic-seed.mjs" } });
  });

  it.each(["prisma7.config.ts", ".config/prisma7.ts"])("prefers %s over legacy discovery", async preferred => {
    fixture("prisma.config.mjs", { schema: "legacy.prisma" });
    const target = fixture(preferred, { schema: "preferred.prisma" });
    const result = await loadConfigFromFile({ configRoot: directory });
    expect(result.error).toBeUndefined();
    expect(result.resolvedPath).toBe(target);
    expect(result.config?.schema).toBe(path.join(path.dirname(target), "preferred.prisma"));
  });

  it("honors explicit config over version-specific automatic discovery", async () => {
    fixture("prisma7.config.ts", { schema: "automatic.prisma" });
    const target = fixture("custom.mjs", { schema: "explicit.prisma" });
    const result = await loadConfigFromFile({ configRoot: directory, configFile: target });
    expect(result.error).toBeUndefined();
    expect(result.resolvedPath).toBe(target);
    expect(result.config?.schema).toBe(path.join(directory, "explicit.prisma"));
  });

  it("returns a safe missing-explicit-file error", async () => {
    const result = await loadConfigFromFile({ configRoot: directory, configFile: path.join(directory, "missing.mjs") });
    expect(result.error?._tag).toBe("ConfigFileNotFound");
    expect(result.config).toBeUndefined();
  });

  it("rejects invalid supported fields rather than silently changing settings", async () => {
    fixture("prisma.config.mjs", { schema: 123 });
    const result = await loadConfigFromFile({ configRoot: directory });
    expect(result.error?._tag).toBe("ConfigFileSyntaxError");
    expect(result.config).toBeUndefined();
  });

  it("does not fall back when the preferred config cannot load", async () => {
    fixture("prisma.config.mjs", { schema: "legacy.prisma" });
    const preferred = path.join(directory, "prisma7.config.ts");
    fs.writeFileSync(preferred, "throw new Error('Synthetic broken config');\nexport default {};\n");
    const result = await loadConfigFromFile({ configRoot: directory });
    expect(result.error?._tag).toBe("ConfigLoadError");
    expect(result.resolvedPath).toBe(preferred);
    expect(result.config).toBeUndefined();
  });

  it("retains the existing c12 merger argument precedence", async () => {
    fixture("custom.mjs", { schema: "main.prisma", migrations: { seed: "main-seed" } });
    const { loadConfig } = await import(pathToFileURL(configRequire.resolve("c12")).href) as {
      loadConfig: (options: Record<string, unknown>) => Promise<{ config: unknown }>;
    };
    const result = await loadConfig({ cwd: directory, name: "prisma", configFile: "custom.mjs", dotenv: false, rcFile: false, giget: false, extend: false, packageJson: false, merger: esmMerge.deepmerge, overrides: { schema: "override.prisma", migrations: { path: "override-migrations" } } });
    expect(result.config).toEqual({ schema: "main.prisma", migrations: { seed: "main-seed", path: "override-migrations" } });
  });
});

interface CompressedPacket {
  readInt24: () => number;
  readBuffer: () => Buffer;
  numPackets: number;
}

describe("patched MySQL CLI dependency security boundaries", () => {
  const mysqlRoot = packageInfo(prismaRequire.resolve("mysql2"), "mysql2").root;

  it("loads CommonJS and promise API exports without opening a connection", () => {
    const mysql = prismaRequire("mysql2");
    const promise = prismaRequire("mysql2/promise");
    expect(mysql.createConnection).toBeTypeOf("function");
    expect(mysql.createPool).toBeTypeOf("function");
    expect(promise.createConnection).toBeTypeOf("function");
    expect(promise.createPool).toBeTypeOf("function");
  }, 20_000);

  it("rejects a server clear-password switch without explicit opt-in", () => {
    const packets = require(path.join(mysqlRoot, "lib/packets/index.js"));
    const auth = require(path.join(mysqlRoot, "lib/commands/auth_switch.js")) as { authSwitchRequest: (packet: unknown, connection: unknown, command: unknown) => void };
    const packetParser = vi.spyOn(packets.AuthSwitchRequest, "fromPacket").mockReturnValue({ pluginName: "mysql_clear_password", pluginData: Buffer.alloc(0) });
    const connection = { config: { password: "synthetic-fixture-only" }, writePacket: vi.fn() };
    try {
      expect(() => auth.authSwitchRequest({}, connection, { emit: vi.fn() })).toThrow(expect.objectContaining({ code: "MYSQL_CLEAR_PASSWORD_NOT_ENABLED", fatal: true }));
      expect(connection.writePacket).not.toHaveBeenCalled();
    } finally { packetParser.mockRestore(); }
  });

  it.each([1, 16385])("bounds inflation by the advertised length %i", async advertisedLength => {
    const compression = require(path.join(mysqlRoot, "lib/compressed_protocol.js")) as { enableCompression: (connection: unknown) => void };
    const connection = { write: vi.fn(), handlePacket: vi.fn(), _bumpCompressedSequenceId: vi.fn(), _handleNetworkError: vi.fn(), _handleCompressedPacket: undefined as undefined | ((packet: CompressedPacket) => void), _inflatedPacketsParser: undefined as undefined | { execute: (data: Buffer) => void } };
    compression.enableCompression(connection);
    if (!connection._inflatedPacketsParser || !connection._handleCompressedPacket) throw new Error("Compression protocol was not initialized");
    const execute = vi.spyOn(connection._inflatedPacketsParser, "execute");
    connection._handleCompressedPacket({ readInt24: () => advertisedLength, readBuffer: () => deflateSync(Buffer.alloc(advertisedLength + 1, 1)), numPackets: 1 });
    await vi.waitFor(() => expect(connection._handleNetworkError).toHaveBeenCalledOnce());
    expect(execute).not.toHaveBeenCalled();
    expect(connection._bumpCompressedSequenceId).not.toHaveBeenCalled();
  });

  it.each([16, 16385])("delivers a valid compressed packet of length %i", async length => {
    const compression = require(path.join(mysqlRoot, "lib/compressed_protocol.js")) as { enableCompression: (connection: unknown) => void };
    const connection = { write: vi.fn(), handlePacket: vi.fn(), _bumpCompressedSequenceId: vi.fn(), _handleNetworkError: vi.fn(), _handleCompressedPacket: undefined as undefined | ((packet: CompressedPacket) => void), _inflatedPacketsParser: undefined as undefined | { execute: (data: Buffer) => void } };
    compression.enableCompression(connection);
    if (!connection._inflatedPacketsParser || !connection._handleCompressedPacket) throw new Error("Compression protocol was not initialized");
    const execute = vi.spyOn(connection._inflatedPacketsParser, "execute");
    const payload = Buffer.alloc(length, 1);
    payload.writeUIntLE(length - 4, 0, 3);
    payload[3] = 0;
    connection._handleCompressedPacket({ readInt24: () => length, readBuffer: () => deflateSync(payload), numPackets: 1 });
    await vi.waitFor(() => expect(connection.handlePacket).toHaveBeenCalledOnce());
    expect(execute).toHaveBeenCalledExactlyOnceWith(payload);
    expect(connection._bumpCompressedSequenceId).toHaveBeenCalledExactlyOnceWith(1);
    expect(connection._handleNetworkError).not.toHaveBeenCalled();
  });
});
