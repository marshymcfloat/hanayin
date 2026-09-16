import fs from "node:fs";
import path from "node:path";

const SOURCE_EXTENSION = /\.(?:ts|tsx|js|jsx|mjs)$/;
const PRISMA_IMPORT = /["']@\/prisma\/prisma["']/;
const APP_IMPORT = /["']@\/app\//;

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    return SOURCE_EXTENSION.test(entry.name) ? [absolute] : [];
  });
}

const relativePath = (root, file) =>
  path.relative(root, file).replaceAll(path.sep, "/");

const isUiModule = (relative) =>
  relative.endsWith(".tsx") &&
  (relative.startsWith("app/") || relative.startsWith("components/")) &&
  !relative.includes(".test.");

const isFeatureActionModule = (relative) =>
  relative.startsWith("features/") &&
  relative.includes("/actions/") &&
  !relative.endsWith(".tsx") &&
  !relative.includes(".test.");

const isRouteHandler = (relative) =>
  /^app\/api\/(?:.*\/)?route\.(?:ts|js|mjs)$/.test(relative);

function addStaleAllowlistViolations(violations, allowed, found, label) {
  for (const legacy of allowed) {
    if (!found.has(legacy)) {
      violations.push(
        `${legacy}: stale ${label} Prisma allowlist entry; remove it from architecture-boundaries.json`,
      );
    }
  }
}

export function findBoundaryViolations(root, config) {
  const violations = [];
  const allowedUi = new Set(config.allowedUiPrismaImports ?? []);
  const allowedActions = new Set(config.allowedActionPrismaImports ?? []);
  const allowedRouteHandlers = new Set(
    config.allowedRouteHandlerPrismaImports ?? [],
  );
  const sourceFiles = [
    ...walk(path.join(root, "app")),
    ...walk(path.join(root, "components")),
    ...walk(path.join(root, "features")),
  ];
  const foundAllowedUi = new Set();
  const foundAllowedActions = new Set();
  const foundAllowedRouteHandlers = new Set();

  for (const file of sourceFiles) {
    const relative = relativePath(root, file);
    const source = fs.readFileSync(file, "utf8");

    if (relative.startsWith("components/ui/") && PRISMA_IMPORT.test(source)) {
      violations.push(`${relative}: shared UI must not import Prisma`);
    }
    if (relative.startsWith("features/") && APP_IMPORT.test(source)) {
      violations.push(`${relative}: features must not import app route modules`);
    }
    if (isUiModule(relative) && PRISMA_IMPORT.test(source)) {
      if (allowedUi.has(relative)) foundAllowedUi.add(relative);
      else violations.push(`${relative}: new direct Prisma import in UI`);
    }
    if (isFeatureActionModule(relative) && PRISMA_IMPORT.test(source)) {
      if (allowedActions.has(relative)) foundAllowedActions.add(relative);
      else {
        violations.push(
          `${relative}: new direct Prisma import in feature action`,
        );
      }
    }
    if (isRouteHandler(relative) && PRISMA_IMPORT.test(source)) {
      if (allowedRouteHandlers.has(relative)) {
        foundAllowedRouteHandlers.add(relative);
      } else {
        violations.push(
          `${relative}: new direct Prisma import in Route Handler`,
        );
      }
    }
  }

  addStaleAllowlistViolations(
    violations,
    allowedUi,
    foundAllowedUi,
    "UI",
  );
  addStaleAllowlistViolations(
    violations,
    allowedActions,
    foundAllowedActions,
    "feature action",
  );
  addStaleAllowlistViolations(
    violations,
    allowedRouteHandlers,
    foundAllowedRouteHandlers,
    "Route Handler",
  );

  return violations.sort();
}
