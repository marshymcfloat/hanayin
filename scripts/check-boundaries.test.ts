import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findBoundaryViolations } from "./check-boundaries-core.mjs";

const roots: string[] = [];

function fixture(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "serviceflow-boundaries-"));
  roots.push(root);
  for (const [relative, source] of Object.entries(files)) {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, source);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("architecture boundary checks", () => {
  it("rejects new UI-to-Prisma and feature-to-app dependencies", () => {
    const root = fixture({
      "app/dashboard/page.tsx": 'import { prisma } from "@/prisma/prisma";',
      "features/orders/service.ts": 'import Page from "@/app/dashboard/page";',
    });

    expect(findBoundaryViolations(root, { allowedUiPrismaImports: [] })).toEqual([
      "app/dashboard/page.tsx: new direct Prisma import in UI",
      "features/orders/service.ts: features must not import app route modules",
    ]);
  });

  it("allows existing debt but requires stale entries to be removed", () => {
    const root = fixture({
      "app/dashboard/page.tsx": 'import { prisma } from "@/prisma/prisma";',
    });

    expect(
      findBoundaryViolations(root, {
        allowedUiPrismaImports: [
          "app/dashboard/page.tsx",
          "app/removed/page.tsx",
        ],
      }),
    ).toEqual([
      "app/removed/page.tsx: stale UI Prisma allowlist entry; remove it from architecture-boundaries.json",
    ]);
  });

  it("rejects new direct Prisma imports in feature actions and Route Handlers", () => {
    const root = fixture({
      "app/api/orders/route.ts": 'import { prisma } from "@/prisma/prisma";',
      "features/orders/actions/create-order.ts":
        'import { prisma } from "@/prisma/prisma";',
    });

    expect(findBoundaryViolations(root, {})).toEqual([
      "app/api/orders/route.ts: new direct Prisma import in Route Handler",
      "features/orders/actions/create-order.ts: new direct Prisma import in feature action",
    ]);
  });

  it("allows reviewed action and Route Handler debt", () => {
    const root = fixture({
      "app/api/orders/route.ts": 'import { prisma } from "@/prisma/prisma";',
      "features/orders/actions/create-order.ts":
        'import { prisma } from "@/prisma/prisma";',
    });

    expect(
      findBoundaryViolations(root, {
        allowedActionPrismaImports: [
          "features/orders/actions/create-order.ts",
        ],
        allowedRouteHandlerPrismaImports: ["app/api/orders/route.ts"],
      }),
    ).toEqual([]);
  });

  it("requires stale action and Route Handler entries to be removed", () => {
    const root = fixture({});

    expect(
      findBoundaryViolations(root, {
        allowedActionPrismaImports: [
          "features/orders/actions/removed-order.ts",
        ],
        allowedRouteHandlerPrismaImports: ["app/api/removed/route.ts"],
      }),
    ).toEqual([
      "app/api/removed/route.ts: stale Route Handler Prisma allowlist entry; remove it from architecture-boundaries.json",
      "features/orders/actions/removed-order.ts: stale feature action Prisma allowlist entry; remove it from architecture-boundaries.json",
    ]);
  });

  it("does not treat generated Prisma type imports as persistence access", () => {
    const root = fixture({
      "app/api/orders/route.ts":
        'import type { Order } from "@/prisma/generated/prisma/client";',
      "features/orders/actions/create-order.ts":
        'import { OrderStatus } from "@/prisma/generated/prisma/enums";',
    });

    expect(findBoundaryViolations(root, {})).toEqual([]);
  });
});
