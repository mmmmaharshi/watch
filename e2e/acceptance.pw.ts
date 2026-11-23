import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

// The @live tests talk to Cinemeta and the stream providers. They run nightly
// and against the deployed site, not on every pull request.
test.setTimeout(120_000);

const EMPTY = "Enter an IMDb or TMDB ID, link, or title.";
const BAD_LINK = "Use an IMDb title link or a TMDB movie or TV link.";
const NO_PROVIDERS = "No other providers available.";
const MATRIX = "tt0133093";

// A hidden console error is a bug the screenshots never show. Every test fails
// if the page logged one or threw. Third-party poster art is the exception:
// a dead poster image logs a network resource error the app already handles
// by hiding the thumb, so those do not fail the run. Policy violations
// ("Refused to load...") still do. The trusted hosts come from the CSP
// img-src line in astro.config.ts, so the allow-list lives in one place.
const consoleErrors = new WeakMap<Page, Array<string>>();
const POSTER_HOSTS: Array<string> = await readFile(
  new URL("../astro.config.ts", import.meta.url),
  "utf8",
).then(
  (text) =>
    text
      .split("\n")
      .find((line) => line.includes("img-src"))
      ?.match(/https:\/\/[*\w.-]+/g)
      ?.map((match) => match.replace("https://", "").replace(/^\*\./, "")) ?? [],
);

function isPosterHostFailure(text: string): boolean {
  return (
    text.startsWith("Failed to load resource") && POSTER_HOSTS.some((host) => text.includes(host))
  );
}

test.beforeEach(({ page }) => {
  const errors: Array<string> = [];
  consoleErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error" && !isPosterHostFailure(message.text())) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
});

test.afterEach(({ page }) => {
  expect(consoleErrors.get(page) ?? []).toEqual([]);
});

async function open(page: Page, path = "/") {
  await page.goto(path);
  // Astro drops the ssr marker once React takes over the island.
  await expect(page.locator("astro-island")).not.toHaveAttribute("ssr");
}

function field(page: Page) {
  return page.getByRole("textbox", { name: "IMDb or TMDB ID, link, or title" });
}

async function submit(page: Page, text: string) {
  await field(page).fill(text);
  await page.getByRole("button", { name: "Watch now" }).click();
}

async function searchMatrix(page: Page) {
  await submit(page, "The Matrix");
  // Row text runs the name, year and id together: "The Matrix1999tt0133093".
  const row = page
    .locator("ul button")
    .filter({ hasText: "The Matrix" })
    .filter({ hasText: "1999" });
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  return row;
}

function dialog(page: Page) {
  return page.getByRole("dialog");
}

function resultTitle(page: Page) {
  return page.locator("#result-title");
}

function streamLink(page: Page) {
  return dialog(page).getByRole("link", { name: /^https?:\/\// });
}

async function providerOf(page: Page): Promise<string> {
  const href = await streamLink(page).getAttribute("href");
  if (!href) {
    throw new Error("The dialog has no stream link.");
  }
  return new URL(href).host;
}

async function pickMatrix(page: Page) {
  await (await searchMatrix(page)).click();
  await expect(resultTitle(page)).toHaveText("The Matrix", { timeout: 60_000 });
}

test("A1 an empty submit asks for a title and holds the cursor", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Watch now" }).click();

  await expect(page.getByRole("status")).toHaveText(EMPTY);
  await expect(field(page)).toHaveAttribute("aria-invalid", "true");
  await expect(field(page)).toBeFocused();
});

test("A2 a link that is not IMDb or TMDB is rejected", async ({ page }) => {
  await open(page);
  await submit(page, "https://example.com/movie/42");

  await expect(page.getByRole("status")).toHaveText(BAD_LINK);
  await expect(page.locator("ul li")).toHaveCount(0);
});

test("A3 a title search lists titles @live", async ({ page }) => {
  await open(page);
  await searchMatrix(page);

  const rows = page.locator("ul li");
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(6);
  await expect(rows.first()).toContainText(/tt\d{7,8}/);
  // A bare \d{4} also matches inside an IMDb id; require non-digit edges so
  // only a standalone year counts.
  await expect(rows.first()).toContainText(/(?:^|\D)\d{4}(?:\D|$)/);
  await expect(page.getByRole("status")).toHaveText(
    count === 1 ? "1 match. Choose one." : `${count} matches. Choose one.`,
  );
});

test("A4 a pick opens a result with a stream link @live", async ({ page }) => {
  await open(page);
  await pickMatrix(page);

  await expect(dialog(page)).toContainText(MATRIX);
  await expect(dialog(page)).toContainText("Provider");
  await expect(streamLink(page)).toHaveAttribute("target", "_blank");
  await expect(streamLink(page)).toHaveAttribute("href", /^https:\/\//);
});

test("A5 the search survives the dialog @live", async ({ page }) => {
  await open(page);
  const row = await searchMatrix(page);
  const count = await page.locator("ul li").count();

  await row.click();
  await expect(resultTitle(page)).toHaveText("The Matrix", { timeout: 60_000 });
  await dialog(page).getByRole("button", { name: "Cancel" }).click();

  await expect(dialog(page)).toHaveCount(0);
  await expect(field(page)).toHaveValue("The Matrix");
  await expect(page.locator("ul li")).toHaveCount(count);
});

test("A6 a shared link prefills the full link without opening the dialog", async ({ page }) => {
  await open(page, `/#id=${MATRIX}`);

  await expect(field(page)).toHaveValue(`https://www.imdb.com/title/${MATRIX}/`);
  await expect(dialog(page)).toHaveCount(0);
});

test("A7 copy gives the share link @live", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  await pickMatrix(page);

  await dialog(page).getByRole("button", { name: "Copy link" }).click();

  await expect(page.getByText("Link copied.")).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(`${new URL(page.url()).origin}/#id=${MATRIX}`);
});

test("A8 another stream uses another provider @live", async ({ page }) => {
  await open(page);
  await pickMatrix(page);

  const before = await providerOf(page);
  const retry = dialog(page).getByRole("button", { name: "Get another stream link" });
  await retry.click();
  await expect(retry).toBeEnabled({ timeout: 60_000 });

  if ((await page.getByRole("status").innerText()) === NO_PROVIDERS) {
    await expect(dialog(page)).toBeVisible();
    return;
  }
  expect(await providerOf(page)).not.toBe(before);
});

test.describe("A9 on a phone", () => {
  // The app reads navigator.maxTouchPoints; hasTouch is what matters here.
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 } });

  test("A9 a phone does not focus the field", async ({ page }) => {
    await open(page);

    await expect(field(page)).not.toBeFocused();
  });
});

test("A10 a paste before hydration survives it", async ({ page }) => {
  // Hold the island JS back so the link lands in the SSR field first, like a
  // fast paste on a slow phone. Hydration must adopt the typed text, not wipe
  // it, and submit must use it.
  await page.route("**/*.js", async (route) => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 1500);
    });
    await route.continue();
  });

  await page.goto("/");
  await field(page).fill(`https://www.imdb.com/title/${MATRIX}/`);
  await expect(page.locator("astro-island")).not.toHaveAttribute("ssr", { timeout: 30_000 });
  await expect(field(page)).toHaveValue(`https://www.imdb.com/title/${MATRIX}/`);

  await page.getByRole("button", { name: "Watch now" }).click();
  await expect(page.locator("#status")).toHaveText("Finding a working stream...");
});
