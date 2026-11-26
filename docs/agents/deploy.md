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

The Alchemy CLI needs Cloudflare credentials once. Either run the profile
editor:

```sh
bun alchemy profile edit --profile default --add Cloudflare
```

or export a token and the account id (`4f801ddf4e6b98e65b16dd31cfe0551f`):

```sh
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... bun run deploy
```

`bun run deploy` runs `bun run build` and then `bun alchemy deploy --stage prod`.
The stack in `backend/src/stack.ts` declares the site Worker, the refresh
Worker, both KV namespaces, and the host.

## Local

```sh
bun run dev
```

That builds the site and runs `wrangler dev` on port 4321 with the same Worker
entry and the same `dist/client` assets. `bun run e2e` reuses that server or
starts its own.

## Secrets

None. The app reads title metadata from keyless sources: Cinemeta and TVMaze
for IMDb IDs, and Wikidata for the TMDB-to-IMDb mapping.

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
