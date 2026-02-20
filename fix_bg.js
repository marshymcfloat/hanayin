const fs = require("fs");
const path = require("path");
function getFiles(dir) {
  const dirents = fs.readdirSync(dir, { withFileTypes: true });
  const files = dirents.map((dirent) => {
    const res = path.resolve(dir, dirent.name);
    return dirent.isDirectory() ? getFiles(res) : res;
  });
  return Array.prototype.concat(...files);
}
const files = getFiles("components/landing");
files
  .filter((f) => f.endsWith(".tsx"))
  .forEach((file) => {
    let content = fs.readFileSync(file, "utf8");
    // Replace alternating background colors to use the global background
    content = content.replace(/bg-stone-50(?:\/\d+)?\s*/g, "bg-background ");
    fs.writeFileSync(file, content);
  });
console.log("Backgrounds updated");
