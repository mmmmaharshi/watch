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

- `id` — IMDB ID, `tt` followed by 7 or 8 digits.
- `exclude` — provider name to skip (used by the "try another" button).

Returns `{ url, provider, type, name, year, rating, description }`, or an error
status: `400` invalid ID, `429` rate limited (100 requests / 15 min per client),
`502` title not found, `503` no provider responded.

## Layout

- `src/server.ts` — HTTP handler, caches, rate limiter, provider selection.
- `src/server.test.ts` — tests against the handler with a fake network.
- `public/index.html` — the whole UI (HTML, CSS, JS in one file).
