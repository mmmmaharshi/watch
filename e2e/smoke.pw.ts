import { expect, test } from "@playwright/test";

// If the island never hydrates, the submit button reloads the page and the
// status stays empty. This catches CSP or bundle regressions that unit tests
// cannot see.
test("the page hydrates and reports an empty submit", async ({ page }) => {
  await page.goto("/");

  const input = page.getByRole("textbox", { name: /imdb or tmdb/i });
  await expect(input).toBeVisible();

  // A click before hydration submits the form and reloads the page, so retry
  // until the island answers.
  await expect(async () => {
    await page.getByRole("button", { name: "Watch now" }).click();
    await expect(page.getByRole("status")).toHaveText("Enter an IMDb or TMDB ID, link, or title.", {
      timeout: 1000,
    });
  }).toPass({ timeout: 30_000 });

  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toBeFocused();
});
