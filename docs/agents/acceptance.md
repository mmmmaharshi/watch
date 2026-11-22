# Acceptance criteria

These are the promises the app makes to a person. The verifier grades against
this file and nothing else. Do not edit it to make a test pass.

Each criterion has one test in `e2e/acceptance.pw.ts` with the same ID.
`e2e/acceptance.test.ts` fails when the two lists drift apart.

## A1 — An empty submit asks for a title

1. Open the site.
2. Leave the field empty.
3. Press **Watch now**.

The page shows "Enter an IMDb or TMDB ID, link, or title." The field is marked
invalid and holds the cursor.

## A2 — A link that is not IMDb or TMDB is rejected

1. Type `https://example.com/movie/42`.
2. Press **Watch now**.

The page shows "Use an IMDb title link or a TMDB movie or TV link." No lookup
runs.

## A3 — A title search lists titles

1. Type `The Matrix`.
2. Press **Watch now**.

The page lists at most 6 titles. Each row shows the name and the kind (Film or
TV show). The year shows when it is known. The 1999 film is in the list.

## A4 — A pick opens a result

1. Search `The Matrix`.
2. Pick the 1999 film.

A dialog opens with the title. It shows the IMDb ID, the provider name, and a
stream URL. The stream URL is a link that opens in a new tab.

## A5 — The search survives the dialog

1. Open the result for The Matrix.
2. Press **Cancel**.

The dialog closes. The field still holds `The Matrix`. The list still shows the
same titles.

## A6 — A shared link opens the result

Open `/#id=tt0133093` directly.

The result for The Matrix opens without a click. The field shows `tt0133093`.

## A7 — Copy gives the share link

1. Open a result.
2. Press **Copy link**.

The page shows "Link copied." The clipboard holds
`<site>/#id=<imdb id>`.

## A8 — Another stream uses another provider

1. Open a result.
2. Press the refresh button, **Get another stream link**.

The stream URL changes to a provider that is not the current one. When no other
provider works, the page shows "No other providers available." The dialog stays
open in both cases.

## A9 — A phone does not open the keyboard

1. Open the site on a touch device.

The field does not take focus on load. The keyboard stays closed until the
person taps the field.
