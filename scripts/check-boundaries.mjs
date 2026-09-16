import fs from "node:fs";
import path from "node:path";
import { findBoundaryViolations } from "./check-boundaries-core.mjs";

const root = process.cwd();
const configPath = path.join(root, "scripts", "architecture-boundaries.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const violations = findBoundaryViolations(root, config);

if (violations.length > 0) {
  console.error("Architecture boundary check failed:\n");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Architecture boundary check passed.");
