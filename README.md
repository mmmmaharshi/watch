# watch

Paste an IMDB ID, get a working stream link. A single Bun server serves one page
and finds a third-party embed provider that responds for the given title.

- No dependencies. Runs on the Bun runtime only.
- Titles come from [Cinemeta](https://v3-cinemeta.strem.io) (no API key).
- Providers are probed in parallel; the first one that answers is returned.

## Run

```sh
bun install        # no packages to install, kept for habit
bun run dev        # watch mode, http://localhost:3000
bun start          # run once
bun test           # unit tests for the route handler
```

`dev` and `start` are the same server; `dev` restarts on file change.

## API

`GET /api/watch?id=tt0133093[&exclude=vidsrc.pm]`

- `id` — IMDB ID, `tt` followed by 7 or 8 digits.
- `exclude` — provider name to skip (used by the "try another" button).

Returns `{ url, provider, type, name, year, rating, description }`, or an error
status: `400` invalid ID, `429` rate limited (100 requests / 15 min per client),
`502` title not found, `503` no provider responded.

## Deploy

Set up for Vercel (`vercel.json`, `bunVersion`). The page is static; the API is
the only server code.

## Layout

- `src/server.ts` — HTTP handler, caches, rate limiter, provider selection.
- `src/server.test.ts` — tests against the handler with a fake network.
- `public/index.html` — the whole UI (HTML, CSS, JS in one file).
