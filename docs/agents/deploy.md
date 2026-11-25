# Deploys

The app runs on Cloudflare Workers. `bun run build` writes the static site to
`dist/client`; Alchemy bundles `backend/src/site-worker.ts` and deploys it with
those assets. The platform serves the page and the assets; the Worker answers
`/api/*`.

## Where it runs

| Thing   | Value                                      |
| ------- | ------------------------------------------ |
| Zone    | `maharshi.work`, on Cloudflare nameservers |
| Worker  | `watch`                                    |
| Host    | `watch.maharshi.work`                      |
| Account | `pmanoharmaharshi@gmail.com`               |

## Deploy

```sh
bun run deploy
```

That runs `bun run build` and then `bun alchemy deploy --stage prod`. The stack
in `backend/src/stack.ts` declares the site Worker, the refresh Worker, both KV
namespaces, and the host.

## Local

```sh
bun run dev
```

That builds the site and runs `wrangler dev` on port 4321 with the same Worker
entry and the same `dist/client` assets. `bun run e2e` reuses that server or
starts its own.

## Secrets

The language filter and the official-services row read `TMDB_API_KEY`, a free
key from themoviedb.org. The stack binds it as a secret from the environment, so
put it in `.env` at the repo root (ignored by git) or export it before deploying:

```sh
TMDB_API_KEY=your-key
```

A deploy without it fails at the Config step, by design. A local run without it
still serves the page and the stream link; a language choice reports that the
filter is not set up.

## Inspect

Use the `cf` CLI for the zone and the Worker:

```sh
cf workers list
cf workers get watch
```

## Security headers

Four headers do not come from the app. They come from a zone rule named
`watch response headers`, in phase `http_response_headers_transform`, matching
`http.host eq "watch.maharshi.work"`.

Check them:

```sh
curl -sSI https://watch.maharshi.work/ | grep -iE "x-frame|x-content|strict-transport|referrer"
```

Undo the rule:

```sh
cf rulesets rules delete f8cc7c20464343b7a366869bd724685e --zone maharshi.work
```

The page's Content-Security-Policy is the app's own: `src/lib/csp.ts` writes it
into `dist/client/_headers` at build time.
