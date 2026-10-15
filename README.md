# watch

Live at <https://watch.maharshi.work>

Paste an IMDB ID, get a working stream link.

## Run

```sh
bun install        # no packages to install, kept for habit
bun run dev        # watch mode, http://localhost:3000
bun start          # run once
bun test           # unit tests for the route handler
```

`dev` and `start` are the same server; `dev` restarts on file change.

## API

`GET /api/watch?id=tt0133093[&exclude=vidsrc.sh]`

- `id` — an IMDB ID (`tt` plus 7 or 8 digits) or a full IMDb link, which is
  normalized to its ID.
- `exclude` — provider name to skip (used by the "try another" button).

Returns `{ id, url, provider, type, name, year, rating, description }`, or an error
status: `400` invalid ID, `429` rate limited (100 requests / 15 min per client),
`502` title not found, `503` no provider responded.

## Layout

- `server.ts` — the entrypoint: calls `Bun.serve`.
- `src/handler.ts` — HTTP handler, caches, rate limiter, provider selection.
- `src/handler.test.ts` — tests against the handler with a fake network.
- `src/recent.test.ts` — tests for the recent-lookups list.
- `public/index.html` — the whole UI (HTML, CSS, JS in one file).
- `public/recent.js` — the recent-lookups list, DOM-free so the tests can load it.
