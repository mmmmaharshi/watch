# Backend

The Effect backend. `backend/src/site-worker.ts` is the Worker entry; it hands
`/api/*` to `site.ts`, which builds one service graph through `compose.ts`. The
Alchemy stack deploys the site, its assets, and the provider-refresh cron.

## Layout

`backend/` is a Bun workspace of the root package. One `bun install` at the repo
root installs it.

- `src/site.ts` — the HTTP boundary: `/api/watch` and `/api/search`, input
  validation, the visitor's region.
- `src/site-worker.ts` — the Worker entry both Wrangler (dev) and Alchemy
  (deploy) use.
- `src/compose.ts` — the `Site` service: one graph over the services, the fetch
  transport, and the two stores. KV-backed in a Worker, in-memory elsewhere.
- `src/search.ts` — `Search` service: Cinemeta and TVMaze fallback over `Http`
  and `Cache`, with one ranking rule.
- `src/tmdb.ts` — `Tmdb` service: language search and official availability. A
  disabled layer serves when no key is bound.

- `src/http.ts` — `Http` service: stub Layer and fetch-backed Layer.
- `src/cache.ts` — `Cache` service: in-memory Layer with TTL and a max entry
  count, plus a KV-backed Layer for shared storage.
- `src/kv.ts` — the KV binding port both KV-backed Layers build on.
- `src/provider-list.ts` — `ProviderList` service: the shared provider list,
  read and written through KV.
- `src/providers.ts` — `Providers` service: shared-list, directory, and
  refresh-file loading plus tiered probing with cancellation. The provider facts
  (hosts, URL shapes, the directory parser) live in `src/lib/providers.ts`,
  because the refresh script uses them without Effect.
- `src/refresh.ts` — the provider refresh core: probe the directory, keep the
  hosts that answer, save the list. Shared by the Bun script and the cron.
- `src/resources.ts` — resource names, the cron expression, and the domain.
- `src/cloudflare.ts` — the KV namespace declarations.
- `src/refresh-worker.ts` — the cron Worker: runs the refresh core and writes
  KV on the Tuesday/Saturday schedule.
- `src/stack.ts` — the Alchemy stack: site Worker, cron Worker, KV, domain by
  stage.
- `src/metadata.ts` — `Metadata` service: Cinemeta lookup with a TVMaze
  fallback and a negative cache.
- `src/mapping.ts` — `Mapping` service: a TMDB id resolves to an IMDb id
  through Wikidata.
- `src/lookup-machine.ts` — the lookup lifecycle machine: `idle`, `searching`,
  `looking`, `retrying`, with dialog-open state in context. Effect work runs
  only in declared actors, and leaving a busy state interrupts its actor.
- `test/` — behavior tests through the service interfaces, plus property tests
  for the cache and provider rules and model tests over the machine's event
  sequences.

## Commands

- `bun run --cwd backend check` — typecheck, lint, test.
- `bun run --cwd backend format` — format with oxfmt.
- `bun run check` from the repo root — the full gate, backend included.
- `bun run dev` from the repo root — build the site and run the Worker locally.
- `bun alchemy plan --stage prod` — show what the stack would create; the
  deploy path is `bun run deploy` (see `docs/agents/deploy.md`).

## Pinned versions

Versions are exact, with no `^`, so the compiler and test diagnostics cannot
move under us.

| Package          | Version      |
| ---------------- | ------------ |
| `effect`         | 4.1.5        |
| `xstate`         | 6.0.0-beta.5 |
| `@xstate/effect` | 1.0.0-beta.3 |
| `@effect/vitest` | 4.1.5        |
| `vitest`         | 5.1.1        |
| `typescript`     | 7.0.2        |
| `oxlint`         | 1.94.0       |
| `oxfmt`          | 0.79.0       |
| `@types/node`    | 26.6.6       |

The stack also pins, at the repo root:

| Package                            | Version       |
| ---------------------------------- | ------------- |
| `alchemy`                          | 2.0.0-beta.87 |
| `@alchemy.run/cloudflare`          | 2.0.0-beta.87 |
| `@alchemy.run/frontend-frameworks` | 2.0.0-beta.87 |

`effect` is also a root devDependency at 4.1.5: the root `src/lib` tests run
under the root workspace. Both pins must match.

`@effect/vitest` 4.1.5 accepts `vitest >=5.0.0 <6.0.0`; 5.1.1 is the newest
release in that range. The service patterns follow rat-stack's Effect 4.1.4
notes, and 4.1.5 is the installed patch line.

`@xstate/effect` is the official XState Effect bridge. It is still a beta: it
requires `xstate >=6.0.0-beta.4` and `effect >=4.0.0`, so the machine runs on
the v6 beta line. `6.0.0-beta.5` was the newest `xstate` beta when the pins
were taken. The bridge is used as designed: machines are built with
`setupEffect`, work is declared with `createEffectLogic`, and actors are started
with `createEffectActor`.
