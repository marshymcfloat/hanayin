async function main() {
  const fs = await import("node:fs");
  const path = await import("node:path");

  const dir = path.join(process.cwd(), "components", "landing");
  const files = fs.readdirSync(dir);

  let mods = 0;
  files.forEach((file) => {
    if (file.endsWith(".tsx")) {
      const fp = path.join(dir, file);
      let c = fs.readFileSync(fp, "utf8");
      const original = c;

      c = c.replace(
        /import\s+\{\s*WaveDivider\s*\}\s*from\s*["']@\/components\/ui\/wave-divider["'];?[\r\n]*/g,
        "",
      );
      c = c.replace(/^[ \t]*<WaveDivider[\s\S]*?\/>[\r\n]*/gm, "");

      if (c !== original) {
        fs.writeFileSync(fp, c, "utf8");
        mods++;
        console.log("Cleaned: " + file);
      }
    }
  });
  console.log("Modified " + mods + " files.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
