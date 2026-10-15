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

The title ID also rides in the page URL after a `#`, so a shared link does not
create a second URL for search engines to index. `GET /robots.txt`,
`GET /sitemap.xml` and `GET /og.png` are served from the bundle rather than
from static files, since the deploy has no static file layer.

## Layout

- `server.ts` — the entrypoint: calls `Bun.serve`.
- `src/handler.ts` — HTTP handler, caches, rate limiter, provider selection.
- `src/handler.test.ts` — tests against the handler with a fake network.
- `src/recent.test.ts` — tests for the recent-lookups list.
- `src/page.ts` — the page and its browser module, inlined as strings because
  the deploy bundler cannot load a `.html` file.
- `src/og.ts` — the 1200x630 share card, base64-encoded for the same reason.
- `tools/og-card.html` — the source of that card: screenshot it to regenerate.
