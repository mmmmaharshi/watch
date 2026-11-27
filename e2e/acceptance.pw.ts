import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// The @live tests talk to Wikidata and the stream providers. They run nightly
// and against the deployed site, not on every pull request.
test.setTimeout(120_000);

const EMPTY = "Enter an IMDb or TMDB ID or link.";
const BAD_LINK = "Use an IMDb title link or a TMDB movie or TV link.";
const NO_PROVIDERS = "No other providers available.";
const MATRIX = "tt0133093";

// A hidden console error is a bug the screenshots never show. Every test fails
// if the page logged one or threw.
const consoleErrors = new WeakMap<Page, Array<string>>();

test.beforeEach(({ page }) => {
  const errors: Array<string> = [];
  consoleErrors.set(page, errors);
  page.on("console", (message) => {
    const url = message.location().url;
    if (message.type() === "error") {
      errors.push(url === "" ? message.text() : `${message.text()} (${url})`);
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
});

test.afterEach(({ page }) => {
  expect(consoleErrors.get(page) ?? []).toEqual([]);
});

// The client marks #app once it adopted the server's nodes (or mounted
// fresh). Hydration keeps the server's nodes, so the field is never replaced.
async function mounted(page: Page) {
  await page.waitForSelector("#app[data-booted]", { timeout: 30_000 });
}

async function open(page: Page, path = "/") {
  await page.goto(path);
  await mounted(page);
}

function field(page: Page) {
  return page.getByRole("textbox", { name: "IMDb or TMDB ID or link" });
}

async function submit(page: Page, text: string) {
  await field(page).fill(text);
  await page.getByRole("button", { name: "Find a stream" }).click();
}

function dialog(page: Page) {
  return page.getByRole("dialog");
}

function resultTitle(page: Page) {
  return dialog(page).getByRole("heading", { level: 2 });
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

async function openMatrix(page: Page) {
  await open(page);
  await submit(page, MATRIX);
  await expect(resultTitle(page)).toHaveText("The Matrix", { timeout: 60_000 });
}

test("A1 an empty submit asks for an id and holds the cursor", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Find a stream" }).click();

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

test("A4 an id opens a result with a stream link @live", async ({ page }) => {
  await open(page);
  await openMatrix(page);

  await expect(dialog(page)).toContainText(MATRIX);
  await expect(dialog(page)).toContainText("Provider");
  await expect(streamLink(page)).toHaveAttribute("target", "_blank");
  await expect(streamLink(page)).toHaveAttribute("href", /^https:\/\//);
});

test("A5 the id survives the dialog @live", async ({ page }) => {
  await open(page);
  await openMatrix(page);

  await dialog(page).getByRole("button", { name: "Cancel" }).click();

  await expect(dialog(page)).toHaveCount(0);
  await expect(field(page)).toHaveValue(MATRIX);
});

test("A6 a shared link prefills the full link without opening the dialog", async ({ page }) => {
  await open(page, `/#id=${MATRIX}`);

  await expect(field(page)).toHaveValue(`https://www.imdb.com/title/${MATRIX}/`);
  await expect(dialog(page)).toHaveCount(0);
});

test("A6b a shared TMDB id prefills the TMDB link", async ({ page }) => {
  await open(page, "/#id=27205");

  await expect(field(page)).toHaveValue("https://www.themoviedb.org/movie/27205");
  await expect(dialog(page)).toHaveCount(0);
});

test("A7 copy gives the share link @live", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  await openMatrix(page);

  await dialog(page).getByRole("button", { name: "Copy link" }).click();

  await expect(page.getByText("Link copied.")).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(`${new URL(page.url()).origin}/#id=${MATRIX}`);
});

test("A8 another stream uses another provider @live", async ({ page }) => {
  await open(page);
  await openMatrix(page);

  const before = await providerOf(page);
  const retry = dialog(page).getByRole("button", { name: "Get another stream link" });
  await retry.click();

  // The open dialog inerts the page, so its status live region is outside the
  // accessibility tree. Read it anyway; the message is still what it holds.
  const status = page.locator("#status");
  // Retry replies asynchronously, so poll for the settled outcome: either a
  // different provider or the exhausted message. A single read can race it.
  await expect
    .poll(
      async () => {
        const text = await status.innerText();
        return text === NO_PROVIDERS ? NO_PROVIDERS : providerOf(page);
      },
      { timeout: 60_000 },
    )
    .not.toBe(before);
  await expect(dialog(page)).toBeVisible();
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
  // Hold the app JS back so the link lands in the server-rendered field first,
  // like a fast paste on a slow phone. Mount must adopt the typed text, not
  // wipe it, and submit must use it.
  await page.route("**/*.js", async (route) => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 1500);
    });
    await route.continue();
  });

  // commit, not load: deferred module scripts run before load, and the paste
  // must beat them.
  await page.goto("/", { waitUntil: "commit" });
  await field(page).fill(`https://www.imdb.com/title/${MATRIX}/`);
  await mounted(page);
  await expect(field(page)).toHaveValue(`https://www.imdb.com/title/${MATRIX}/`);

  await page.getByRole("button", { name: "Find a stream" }).click();
  await expect(page.locator("#status")).toHaveText("Finding a working stream...");
});
