import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readdir, readFile } from "node:fs/promises";

const root = fileURLToPath(new URL("../../", import.meta.url));
const server = await createServer({
  configFile: false,
  envFile: false,
  root: path.join(root, "scripts/brand-dashboard"),
  publicDir: path.join(root, "public"),
  resolve: { alias: { "@": root, "next/link": path.join(root, "scripts/brand-dashboard/next-link.tsx") } },
  esbuild: { jsx: "automatic" },
  plugins: [{ name: "local-capture-fonts", configureServer(vite) {
    vite.middlewares.use("/capture-fonts.css", async (_request, response, next) => {
      try {
        const chunks = path.join(root, ".next/dev/static/chunks");
        const files = (await readdir(chunks, { recursive: true })).filter(file => file.endsWith(".css"));
        const styles = await Promise.all(files.map(file => readFile(path.join(chunks, file), "utf8")));
        const fonts = [...new Set(styles.flatMap(css => css.match(/@font-face\s*\{[^}]+\}/g) ?? []).filter(rule => rule.includes("Poppins")))];
        response.setHeader("Content-Type", "text/css");
        response.end(fonts.join("\n").replaceAll("../media/", "/_next/static/media/"));
      } catch (error) { next(error); }
    });
  } }],
  css: { postcss: root },
  server: { host: "127.0.0.1", port: 4138, strictPort: true, fs: { allow: [root] }, proxy: { "/_next/static/media": "http://localhost:3000" } },
});
await server.listen();
server.printUrls();
