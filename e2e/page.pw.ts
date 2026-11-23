import { expect, test } from "@playwright/test";

// The page contract that search engines and share cards read. This checks the
// served document, so it fails if a build drops a tag rather than if the
// source file is rearranged.
test("the served page carries its title, canonical and sharing tags", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/^watch/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://watch.maharshi.work/",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://watch.maharshi.work/og.png",
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
  await expect(page.locator('meta[name="description"]')).not.toHaveAttribute("content", "");
});
