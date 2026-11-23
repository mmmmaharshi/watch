# Cutover to Cloudflare

This page lists the steps to move the app from Vercel to the Alchemy stack.
The stack is declared and tested. It is not deployed. Only the owner runs
these steps.

The declaration lives in `backend/src/stack.ts`. `alchemy.run.ts` at the repo
root points at it. The stack declares:

- the `website` Worker, built from the Astro project;
- the `provider-refresh` Worker, with the `0 5 * * 2,6` cron (Tuesday and
  Saturday, 05:00 UTC);
- the `provider-list` KV namespace, which holds the provider list under the
  key `providers`;
- the `cache` KV namespace, used by the `Cache` layer.

`providers.json` and `.github/workflows/refresh-providers.yml` stay in the
repo until step 6. This ticket does not remove them. The site still reads the
file today: only the backend `Providers` service reads KV. So the file stays
the readers' source until the app runs on that service.

## 1. Set up credentials

Alchemy reads credentials from a profile. It never needs a `.env` file in the
repo, and no token goes into a commit.

```sh
bun install
bun alchemy profile create watch
bun alchemy profile edit --profile watch
```

In the editor, add Cloudflare and finish the login. The profile lives under
`~/.alchemy/`, outside the repo.

The app has no runtime secrets today. If it gains one, read it with
`Config.Redacted("NAME")` in the stack and put the value in the profile. Do
not add it to an env file.

## 2. Remove the Vercel adapter

Alchemy injects its own Cloudflare adapter. Astro fails the build when a
config also declares one.

In `astro.config.ts`, delete these two lines:

```ts
import vercel from "@astrojs/vercel";
  adapter: vercel(),
```

Keep `vercel.json` for now. It is ignored by the Cloudflare build.

## 3. Deploy a preview stage

A stage is an isolated copy. `preview` has no custom domain, so live traffic
stays on Vercel.

```sh
bun alchemy deploy --stage preview --profile watch
```

Copy the printed `url`. The plan runs first and lists every resource it will
create. Read it before you confirm.

## 4. Verify the preview

Run these against the preview URL:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' https://<preview-url>/
curl -sSI https://<preview-url>/ | grep -i x-frame-options
LIVE_URL=https://<preview-url> bun run e2e:live
```

The page returns 200, the security headers are present, and the live suite
passes as desktop and phone.

Check the cron once:

1. Open the Cloudflare dashboard and select Workers & Pages.
2. Open `provider-refresh`. The Triggers tab must list `0 5 * * 2,6`.
3. Wait for a scheduled fire, or open Logs and read the first fire after
   05:00 UTC on Tuesday or Saturday.
4. Open Workers KV, then `provider-list`. The key `providers` must hold JSON
   with an `updatedAt` and a non-empty `providers` array.

A fire logs `Stored N providers.` A failed run logs `provider refresh failed`
with a reason. A directory outage with a fresh list logs
`Directory unreachable; kept N providers.`

## 5. Move the domain

The `prod` stage claims `watch.maharshi.work`. Other stages never do.

```sh
bun alchemy deploy --stage prod --profile watch
LIVE_URL=https://watch.maharshi.work bun run e2e:live
```

Cloudflare attaches the hostname to the `website` Worker. Wait for the
certificate, then rerun the suite. The stack adopts the existing zone; it does
not create one.

`vercel.json` header rules do not carry over. Before this step, add the same
four headers to the Worker: `X-Content-Type-Options`, `X-Frame-Options`,
`Strict-Transport-Security`, and `Referrer-Policy`. A Cloudflare Transform
Rule covers every response, including static assets. The exact home for each
rule was left open in `research/alchemy-infra`; pick one before you move the
domain.

## 6. Retire the old path

Do this only after two things are true:

1. The live suite is green for a few days on the Cloudflare URL.
2. The app's lookup runs on the backend `Providers` layer, so it reads the KV
   list. Until then `providers.json` is still what the site reads, and the
   GitHub workflow must keep refreshing it.

```sh
git rm public/providers.json .github/workflows/refresh-providers.yml vercel.json
git commit -m "chore: retire the Vercel provider refresh"
git push
```

The cron in `provider-refresh` now owns the list. The backend `Providers`
service reads the KV list first and falls back to the file and the live
directory only when the list is missing or stale, so removing the file is safe
once the app uses that service.

Pause the Vercel project. Do not delete it until you are sure of the rollback
below.

## 7. Roll back

The last Vercel deployment keeps serving traffic until the domain moves. After
the move, roll back in this order:

```sh
# 1. Detach the domain: redeploy prod from a commit with `domain` removed,
#    or delete the custom domain in the Cloudflare dashboard.
git revert <cutover-commit>
git push

# 2. Remove the preview stage.
bun alchemy destroy --stage preview --profile watch
```

The revert brings back `adapter: vercel()`, so Vercel builds again. Re-point
DNS to Vercel if Cloudflare still answers.

If you want the stack gone, run:

```sh
bun alchemy destroy --stage prod --profile watch
```

That deletes the Workers, both KV namespaces, and their contents. The next
deploy starts over.

## What this ticket did not do

- No deploy, no domain move, no Cloudflare or Vercel changes.
- No nightly live workflow. The ticket's done-when asks for one; the
  deliverable list for this change did not, so use `bun run e2e:live` by hand
  until that workflow exists.
