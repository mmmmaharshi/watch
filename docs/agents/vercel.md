# Deploys

Vercel builds the site on every push to `master`. The GitHub workflow does not
deploy.

## Project settings

| Setting          | Value           |
| ---------------- | --------------- |
| Framework Preset | `Astro`         |
| Build Command    | `bun run build` |
| Install Command  | `bun install`   |

The preset was `Node` for weeks. Every deploy failed after a green build, so
nothing reached the domain. The preset must stay `Astro` for the
`@astrojs/vercel` adapter output to be found.

## Checks

`bun scripts/deploy-check.ts` waits for the deployment of the current commit
through the GitHub Deployments API, then loads the live page and asserts the
island markup. The CI `live` job runs it on `master` only. Run it by hand after
a manual deploy:

```sh
GITHUB_REPOSITORY=mmmmaharshi/watch GITHUB_SHA=$(git rev-parse HEAD) \
  GITHUB_TOKEN=$(gh auth token) bun scripts/deploy-check.ts
```

The token needs `deployments: read` on the repository. The workflow uses the
default `GITHUB_TOKEN` with that one permission. No Vercel token is needed.

## Leaving Vercel

The Alchemy stack is declared but not deployed. The step-by-step move, and how
to roll back to Vercel, is in `docs/agents/cutover.md`.
