import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, "dist");
const distIndexPath = path.join(distDir, "index.html");
const outDir = path.join(repoRoot, "streamlit");
const outPath = path.join(outDir, "kome_app_bundle.html");

const indexHtml = await readFile(distIndexPath, "utf8");
const scriptMatch = indexHtml.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/i);
const cssMatch = indexHtml.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/i);

if (!scriptMatch || !cssMatch) {
  throw new Error("Could not locate built script/css assets in dist/index.html. Run npm run build first.");
}

const jsPath = path.join(distDir, scriptMatch[1].replace(/^\//, ""));
const cssPath = path.join(distDir, cssMatch[1].replace(/^\//, ""));
const jsContent = await readFile(jsPath, "utf8");
const cssContent = await readFile(cssPath, "utf8");

const bundleHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>KoMe Ai</title>
    <style>
${cssContent}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.__KOME_GEMINI_API_KEY__ = window.__KOME_GEMINI_API_KEY__ || "";
    </script>
    <script type="module">
${jsContent}
    </script>
  </body>
</html>
`;

await mkdir(outDir, { recursive: true });
await writeFile(outPath, bundleHtml, "utf8");
console.log(`Wrote ${outPath}`);
