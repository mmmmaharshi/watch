import { expect, test } from "bun:test";

// Astro owns the page now: the shell prerenders to static HTML, so these
// assert on the served contract (tags and endpoints present), not exact copy.
test("the Astro page keeps title, canonical and share tags", async () => {
  const page = await Bun.file("src/pages/index.astro").text();

  expect(page).toContain("<title>");
  expect(page).toContain("</title>");
  expect(page).toContain('rel="canonical"');
  expect(page).toContain("og:image");
  expect(page).toContain("/og.png");
  expect(page).toContain("twitter:card");
  expect(page).toContain("<WatchApp");
  expect(page).toContain("client:load");
});

// The shell is static (CDN), only /api/watch runs on demand. The sitemap is
// generated, not hand-written.
test("the page prerenders and the sitemap is generated", async () => {
  const page = await Bun.file("src/pages/index.astro").text();
  expect(page).toContain("export const prerender = true");

  const pkg = await Bun.file("package.json").json();
  expect(pkg).toMatchObject({ dependencies: { "@astrojs/sitemap": expect.any(String) } });

  const robots = await Bun.file("public/robots.txt").text();
  expect(robots).toContain("Sitemap: https://watch.maharshi.work/sitemap-index.xml");
});
