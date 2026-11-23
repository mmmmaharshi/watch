# Parity record

This page records the evidence that the Foldkit port behaves like the old React
app. It was measured on 2026-11-23 by running one suite against both apps.

## Method

Both apps ran locally on `http://localhost:4321`, one at a time. Before each run
the server output was checked to confirm which app was serving. The same
`e2e/parity.pw.ts` file ran against each app. Every assertion in it is role,
label, or text based, so it does not depend on either app's markup.

Commands:

- Old app: `git -C ../watch checkout master` then `bunx astro dev --port 4321`.
- Port: `bunx astro dev --port 4321` in this worktree.
- Suite: `PARITY_MODE=live bunx playwright test e2e/parity.pw.ts --project=ci --workers=1`.

## Result

| Check                                 | Old app | Port  |
| ------------------------------------- | ------- | ----- |
| A1 empty submit                       | pass    | pass  |
| A2 bad link rejected                  | pass    | pass  |
| A6 shared link prefills, no dialog    | pass    | pass  |
| A6b shared TMDB id prefills           | pass    | pass  |
| A9 phone does not autofocus           | pass    | pass  |
| A10 paste survives the app start      | pass    | pass  |
| A3 title list (live)                  | pass    | pass  |
| A4 pick opens result (live)           | pass    | pass  |
| A5 search survives dialog (live)      | pass    | pass  |
| A7 copy share link (live)             | pass    | pass  |
| A8 retry uses another provider (live) | pass    | pass  |
| Total                                 | 11/11   | 11/11 |

## Other measurements

- Rendered page text, title, and every meta tag are byte identical.
- The result dialog carries the same text, the same two links with
  `target="_blank"` and `rel="noopener"`, and the same four actions: Cancel,
  Get another stream link, Copy link, Watch.
- Candidate rows carry a lazy image at 40 by 60, a year, and an IMDb id.
- A TMDB TV link opens the same show on both: Breaking Bad, 2008, IMDb 9.5.
- A successful lookup writes `#id=<imdb id>` on both.
- `src/middleware.ts` is identical, so the rate limit is unchanged.
- `vercel.json` was identical at the time of measurement; that file no longer exists.
- `public/og.png` and `public/providers.json` are byte identical.
- `public/robots.txt` differs only in line endings; the text is identical.
- Failure copy is identical: invalid input, ambiguous TMDB id, TMDB id not
  found, metadata missing, no working providers.
- For the same input both handlers answer the same: `1917` resolves to
  `tt0326036`, and the TMDB TV link for 1396 resolves to `tt0903747`.

## Known differences

- The port ignores a click that lands before the app starts, where the old app
  reloads the page. The window is about 1.5 seconds on a dev build.
- The port uses a native dialog element. Its role is implicit, so attribute
  selectors like `[role=dialog]` find nothing; query by role instead.
- The port keeps the model in one place. A build that ships the Foldkit vite
  plugin would preserve the model across reloads; it is not installed.
