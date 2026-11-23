# Deploys

The site runs on Cloudflare, not Vercel.

## Where it runs

| Thing | Value |
| --- | --- |
| Zone | `maharshi.work`, on Cloudflare nameservers |
| Worker | `watch` |
| Host | `watch.maharshi.work` |
| Account | `pmanoharmaharshi@gmail.com` |

Check it with the `cf` CLI:

```sh
cf workers list
cf workers get watch
```

## Security headers

The four headers that used to come from `vercel.json` live in a zone rule now.
The rule is `watch response headers` in phase `http_response_headers_transform`,
and it matches `http.host eq "watch.maharshi.work"`.

To see them:

```sh
curl -sSI https://watch.maharshi.work/ | grep -iE "x-frame|x-content|strict-transport|referrer"
```

To undo the rule:

```sh
cf rulesets rules delete f8cc7c20464343b7a366869bd724685e --zone maharshi.work
```

## What is not true yet

The repository still builds with the Astro Vercel adapter, and `vercel.json` and
`.vercel` are still here. The deploy path that put the Worker on Cloudflare is
not in the repository. So a fresh clone cannot reproduce the live deploy.

Do not write a deploy guide from hope. Record the real steps here once they live
in the repo.
