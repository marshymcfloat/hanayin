const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "components", "landing");
const files = fs.readdirSync(dir);

files.forEach((file) => {
  if (file.endsWith(".tsx")) {
    const fp = path.join(dir, file);
    let c = fs.readFileSync(fp, "utf8");
    c = c.replace(
      /import\s+\{\s*WaveDivider\s*\}\s*from\s*"@\/components\/ui\/wave-divider";?[\r\n]*/g,
      "",
    );
    c = c.replace(/[ \t]*<WaveDivider[^>]*\/>[\r\n]*/g, "");
    fs.writeFileSync(fp, c, "utf8");
  }
});
console.log("Done removing WaveDivider from all sections.");
