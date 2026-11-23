import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Parity check. Every assertion here is role, label, or text based, so the same
// file runs against the old React app and the Foldkit port. Point PARITY_MODE at
// "live" to include the tests that reach real services.
test.setTimeout(150_000);

const MATRIX = "tt0133093";
const EMPTY = "Enter an IMDb or TMDB ID, link, or title.";
const BAD_LINK = "Use an IMDb title link or a TMDB movie or TV link.";

const live = process.env.PARITY_MODE === "live";

const errors = new WeakMap<Page, Array<string>>();
const POSTER_HOSTS = ["metahub.space", "static.tvmaze.com"];

// A dead poster is benign: the app hides the thumb on error. Network errors
// carry the URL in the location, not the text, so match on the location.
function isPosterNetworkNoise(text: string, url: string): boolean {
  const host = POSTER_HOSTS.some((h) => url.includes(h));
  return host && text.startsWith("Failed to load resource");
}

test.beforeEach(async ({ page }) => {
  const list: Array<string> = [];
  errors.set(page, list);
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !isPosterNetworkNoise(message.text(), message.location().url)
    ) {
      list.push(message.text());
    }
  });
  page.on("pageerror", (error) => list.push(error.message));
});

test.afterEach(({ page }) => {
  expect(errors.get(page) ?? []).toEqual([]);
});

function field(page: Page) {
  return page.getByRole("textbox", { name: "IMDb or TMDB ID, link, or title" });
}

function dialog(page: Page) {
  return page.getByRole("dialog");
}

// Mark the served field once, so a swapped node shows the app has taken over.
type MarkedField = Element & { serverRendered?: boolean };

const tagServerField = () => {
  const mark = (node: MarkedField) => {
    node.serverRendered = true;
  };
  const observer = new MutationObserver(() => {
    const node = document.querySelector<MarkedField>("#search-field");
    if (node !== null && node.serverRendered !== true) {
      observer.disconnect();
      mark(node);
    }
  });
  observer.observe(document, { childList: true, subtree: true });
  const served = document.querySelector<MarkedField>("#search-field");
  if (served !== null) {
    mark(served);
  }
};

// Wait until the app answers input. The old app drops the ssr marker on its
// island; the port swaps the served field for a live one.
async function ready(page: Page) {
  await page.waitForFunction(
    () => {
      const island = document.querySelector("astro-island");
      if (island !== null) {
        return !island.hasAttribute("ssr");
      }
      const node = document.querySelector<MarkedField>("#search-field");
      return node !== null && node.serverRendered !== true;
    },
    undefined,
    { timeout: 30_000 },
  );
}

async function open(page: Page, path = "/") {
  await page.addInitScript(tagServerField);
  await page.goto(path);
  await ready(page);
}

async function submit(page: Page, text: string) {
  await field(page).fill(text);
  await page.getByRole("button", { name: "Watch now" }).click();
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

test("A6 a shared link prefills the full link without opening the dialog", async ({ page }) => {
  await open(page, `/#id=${MATRIX}`);

  await expect(field(page)).toHaveValue(`https://www.imdb.com/title/${MATRIX}/`);
  await expect(dialog(page)).toHaveCount(0);
});

test("A6b a TMDB shared id prefills the TMDB link", async ({ page }) => {
  await open(page, "/#id=27205");

  await expect(field(page)).toHaveValue("https://www.themoviedb.org/movie/27205");
  await expect(dialog(page)).toHaveCount(0);
});

test("A10 a paste before the app starts survives it", async ({ page }) => {
  // Hold the app JS back, paste into the served field, then let the app start.
  // The value must survive and submit must use it.
  await page.route("**/*.js", async (route) => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 1500);
    });
    await route.continue();
  });

  await page.addInitScript(tagServerField);
  await page.goto("/", { waitUntil: "commit" });
  await field(page).fill(`https://www.imdb.com/title/${MATRIX}/`);
  await ready(page);

  await expect(field(page)).toHaveValue(`https://www.imdb.com/title/${MATRIX}/`);
  await page.getByRole("button", { name: "Watch now" }).click();
  await expect(page.locator("#status")).not.toHaveText("");
});

test.describe("A9 on a phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 } });

  test("A9 a phone does not focus the field", async ({ page }) => {
    await open(page);
    await expect(field(page)).not.toBeFocused();
  });
});

test.describe("live services", () => {
  test.skip(!live, "set PARITY_MODE=live to reach real services");

  test("A3 a title search lists titles with year and id", async ({ page }) => {
    await open(page);
    await submit(page, "The Matrix");

    const rows = page.locator("ul li");
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(6);
    await expect(rows.first()).toContainText(/tt\d{7,8}/);
    await expect(rows.first()).toContainText(/(?:^|\D)\d{4}(?:\D|$)/);
    await expect(page.getByRole("status")).toHaveText(
      count === 1 ? "1 match. Choose one." : `${count} matches. Choose one.`,
    );
  });

  test("A4 a pick opens a result with a stream link", async ({ page }) => {
    await open(page);
    await submit(page, "The Matrix");
    const row = page.locator("ul li button").filter({ hasText: "1999" }).first();
    await row.click();

    await expect(dialog(page)).toBeVisible({ timeout: 90_000 });
    await expect(dialog(page)).toContainText(MATRIX);
    await expect(dialog(page)).toContainText("Provider");
    await expect(dialog(page)).toContainText("Stream URL");
    const stream = dialog(page).getByRole("link", { name: /^https?:\/\// });
    await expect(stream).toHaveAttribute("target", "_blank");
    await expect(stream).toHaveAttribute("href", /^https:\/\//);
  });

  test("A5 the search survives the dialog", async ({ page }) => {
    await open(page);
    await submit(page, "The Matrix");
    const rows = page.locator("ul li");
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });
    const before = await rows.count();

    await page.locator("ul li button").filter({ hasText: "1999" }).first().click();
    await expect(dialog(page)).toBeVisible({ timeout: 90_000 });
    await dialog(page).getByRole("button", { name: "Cancel" }).click();

    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator("ul li")).toHaveCount(before);
  });

  test("A7 copy gives the share link", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page);
    await submit(page, "The Matrix");
    await page.locator("ul li button").filter({ hasText: "1999" }).first().click();
    await expect(dialog(page)).toBeVisible({ timeout: 90_000 });

    await dialog(page).getByRole("button", { name: "Copy link" }).click();

    await expect(page.getByText("Link copied.")).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(`${new URL(page.url()).origin}/#id=${MATRIX}`);
  });

  test("A8 another stream uses another provider", async ({ page }) => {
    await open(page);
    await submit(page, "The Matrix");
    await page.locator("ul li button").filter({ hasText: "1999" }).first().click();
    await expect(dialog(page)).toBeVisible({ timeout: 90_000 });

    const streamOf = async () => {
      const href = await dialog(page)
        .getByRole("link", { name: /^https?:\/\// })
        .getAttribute("href");
      return href === null ? "" : new URL(href).host;
    };
    const before = await streamOf();

    await dialog(page).getByRole("button", { name: "Get another stream link" }).click();

    await expect
      .poll(
        async () => {
          const status = await page.locator("#status").innerText();
          return status === "No other providers available." ? status : streamOf();
        },
        { timeout: 90_000 },
      )
      .not.toBe(before);
    await expect(dialog(page)).toBeVisible();
  });
});
