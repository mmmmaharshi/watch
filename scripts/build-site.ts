import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { SITE_URL } from "../src/consts";
import { CSP, POSTER_HOST_NAMES } from "../src/lib/csp";
import { render } from "../ui/src/render";
import { pageHtml } from "../ui/src/shell";

// One build, no framework. The client bundle, the CSS, the static page, and the
// asset headers all land in dist/client; the Worker only answers /api/*.
const OUT = "dist/client";

await rm(OUT, { recursive: true, force: true });
await mkdir(`${OUT}/assets`, { recursive: true });

const client = await Bun.build({
  entrypoints: ["ui/src/boot.ts"],
  outdir: `${OUT}/assets`,
  target: "browser",
  minify: true,
  naming: "app.js",
});
if (!client.success) {
  for (const log of client.logs) {
    process.stderr.write(`${String(log)}\n`);
  }
  process.exit(1);
}

const css = Bun.spawnSync(
  [
    "bunx",
    "@tailwindcss/cli",
    "-i",
    "src/styles/global.css",
    "-o",
    `${OUT}/assets/app.css`,
    "--minify",
  ],
  { stdout: "inherit", stderr: "inherit" },
);
if (css.exitCode !== 0) {
  process.exit(css.exitCode);
}

// The fonts the CSS references, next to app.css as their URL paths expect.
const FONTS = [
  ["node_modules/goeist/assets/goeist-sans", "Goeist-Variable.woff2"],
  ["node_modules/goeist/assets/goeist-sans", "Goeist-Italic-Variable.woff2"],
  ["node_modules/goeist/assets/goeist-mono", "GoeistMono-Variable.woff2"],
  ["node_modules/goeist/assets/goeist-mono", "GoeistMono-Italic-Variable.woff2"],
] as const;
for (const [dir, name] of FONTS) {
  await cp(`${dir}/${name}`, `${OUT}/assets/${name}`);
}

await writeFile(`${OUT}/index.html`, pageHtml(render()));
await cp("public", OUT, { recursive: true });

// Static responses carry the page's policy. The four transport headers come
// from the zone rule; repeating them here would give two owners.
await writeFile(`${OUT}/_headers`, ["/*", `  Content-Security-Policy: ${CSP}`, ""].join("\n"));

await writeFile(
  `${OUT}/sitemap.xml`,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE_URL}/</loc></url></urlset>\n`,
);

process.stdout.write(`Built ${OUT}: ${POSTER_HOST_NAMES.join(", ")} may serve posters.\n`);
