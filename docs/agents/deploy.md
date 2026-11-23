# Deploys

The app runs on Cloudflare Workers. Astro builds the Worker with the
`@astrojs/cloudflare` adapter, and Wrangler uploads it.

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

That runs `astro build` and then `wrangler deploy`. Astro writes the Worker to
`dist/server` and the assets to `dist/client`, and Wrangler reads the generated
config through `.wrangler/deploy/config.json`.

Check the output before uploading:

```sh
bunx wrangler deploy --dry-run
```

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

## Other path

The Alchemy stack in `backend/src/stack.ts` declares the same app. It has never
been deployed. Keep the Wrangler path above as the one that runs.
