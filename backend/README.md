# Backend

The Effect backend for the CAFE port. `backend/src/compose.ts` builds the
handler the Astro actions call; the Alchemy stack deploys the site and the
provider-refresh cron.

## Layout

`backend/` is a Bun workspace of the root package. One `bun install` at the repo
root installs it, and the Astro app stays untouched.

- `src/compose.ts` — `handlerFor`: one handler over the services, over the
  fetch transport and the two stores. KV-backed in a Worker, in-memory
  elsewhere.

- `src/http.ts` — `Http` service: stub Layer and fetch-backed Layer.
- `src/cache.ts` — `Cache` service: in-memory Layer with TTL and a max entry
  count, plus a KV-backed Layer for shared storage.
- `src/kv.ts` — the KV binding port both KV-backed Layers build on.
- `src/provider-list.ts` — `ProviderList` service: the shared provider list,
  read and written through KV.
- `src/providers.ts` — `Providers` service: shared-list, directory, and
  refresh-file loading plus tiered probing with cancellation.
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
- `bun alchemy plan --stage preview` — show what the stack would create. See
  `docs/agents/cutover.md` before any deploy.

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

`effect` is also a root devDependency at 4.1.5: `scripts/refresh-providers.ts`
runs the shared refresh core, which lives in this package. Both pins must
match.

`@effect/vitest` 4.1.5 accepts `vitest >=5.0.0 <6.0.0`; 5.1.1 is the newest
release in that range. The service patterns follow rat-stack's Effect 4.1.4
notes, and 4.1.5 is the installed patch line.

`@xstate/effect` is the official XState Effect bridge. It is still a beta: it
requires `xstate >=6.0.0-beta.4` and `effect >=4.0.0`, so the machine runs on
the v6 beta line. `6.0.0-beta.5` was the newest `xstate` beta when the pins
were taken. The bridge is used as designed: machines are built with
`setupEffect`, work is declared with `createEffectLogic`, and actors are started
with `createEffectActor`.
