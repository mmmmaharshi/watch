import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { SITE_URL } from "../src/consts";
import { CSP } from "../src/lib/csp";
import { render } from "../ui/src/render";
import { pageHtml } from "../ui/src/shell";

// One build, no framework. The client bundle, the CSS, the static page, and the
// asset headers all land in dist/client; the Worker only answers /api/*.
const OUT = "dist/client";

// The browser bundle is the thing people download, so resolve the production
// entry points of its dependencies instead of the development ones.
const PRODUCTION = {
  conditions: ["production"],
  define: { "process.env.NODE_ENV": '"production"' },
};

const hash = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex").slice(0, 10);

// Assets are cached for a year, so their names must change with their bytes.
const fingerprint = async (path: string, ext: string): Promise<string> => {
  const bytes = await readFile(path);
  const name = `${path.split("/").pop()?.replace(ext, "")}-${hash(bytes)}${ext}`;
  await rename(path, path.replace(/[^/]+$/, name));
  return name;
};

await rm(OUT, { recursive: true, force: true });
await mkdir(`${OUT}/assets`, { recursive: true });

const client = await Bun.build({
  entrypoints: ["ui/src/boot.ts"],
  outdir: `${OUT}/assets`,
  target: "browser",
  minify: true,
  naming: "app.js",
  ...PRODUCTION,
});
if (!client.success) {
  for (const log of client.logs) {
    process.stderr.write(`${String(log)}\n`);
  }
  process.exit(1);
}
const jsName = await fingerprint(`${OUT}/assets/app.js`, ".js");

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
const cssName = await fingerprint(`${OUT}/assets/app.css`, ".css");

// The fonts the CSS references, in the asset folder their URL paths expect.
const FONTS = [
  ["node_modules/goeist/assets/goeist-sans", "Goeist-Variable.woff2"],
  ["node_modules/goeist/assets/goeist-sans", "Goeist-Italic-Variable.woff2"],
  ["node_modules/goeist/assets/goeist-mono", "GoeistMono-Variable.woff2"],
  ["node_modules/goeist/assets/goeist-mono", "GoeistMono-Italic-Variable.woff2"],
] as const;
for (const [dir, name] of FONTS) {
  await cp(`${dir}/${name}`, `${OUT}/assets/${name}`);
}

await writeFile(
  `${OUT}/index.html`,
  pageHtml(await render(), { css: `/assets/${cssName}`, js: `/assets/${jsName}` }),
);
await cp("public", OUT, { recursive: true });

// Static responses carry the page's policy. The four transport headers come
// from the zone rule; repeating them here would give two owners. Only the
// fingerprinted files get the year: the fonts keep their names, so they must
// keep revalidating.
await writeFile(
  `${OUT}/_headers`,
  [
    "/assets/app-*.js",
    "  Cache-Control: public, max-age=31536000, immutable",
    "/assets/app-*.css",
    "  Cache-Control: public, max-age=31536000, immutable",
    "/*",
    `  Content-Security-Policy: ${CSP}`,
    "",
  ].join("\n"),
);

// The last commit is when the page's content last changed; a build alone is not
// a content change.
const lastModified = Bun.spawnSync(["git", "log", "-1", "--format=%cI"]).stdout.toString().trim();
await writeFile(
  `${OUT}/sitemap.xml`,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE_URL}/</loc>${lastModified === "" ? "" : `<lastmod>${lastModified}</lastmod>`}</url></urlset>\n`,
);

process.stdout.write(`Built ${OUT}.\n`);
