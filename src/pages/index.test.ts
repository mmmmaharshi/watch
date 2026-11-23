import { expect, test } from "bun:test";

// Astro owns the page now: the shell prerenders to static HTML, so these
// assert on the served contract (tags and mount) not exact copy.
test("the Astro page keeps title, canonical and share tags", async () => {
  const page = await Bun.file("src/pages/index.astro").text();

  expect(page).toContain("<title>");
  expect(page).toContain("</title>");
  expect(page).toContain('rel="canonical"');
  expect(page).toContain("og:image");
  expect(page).toContain("/og.png");
  expect(page).toContain("twitter:card");
  expect(page).toContain('id="app"');
  expect(page).toContain("start(");
  expect(page).toContain("makeLookupDeps");
  expect(page).not.toContain("astro-island");
});

// The shell is static (CDN), only the actions run on demand. The sitemap is
// generated, not hand-written.
test("the page prerenders and the sitemap is generated", async () => {
  const page = await Bun.file("src/pages/index.astro").text();
  expect(page).toContain("export const prerender = true");
  expect(page).toContain("render()");

  const pkg = await Bun.file("package.json").json();
  expect(pkg).toMatchObject({ dependencies: { "@astrojs/sitemap": expect.any(String) } });

  const robots = await Bun.file("public/robots.txt").text();
  expect(robots).toContain("Sitemap: https://watch.maharshi.work/sitemap-index.xml");
});
