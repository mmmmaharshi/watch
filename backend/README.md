# Backend

The Effect backend for the CAFE port. Nothing here serves traffic yet; this
package holds the shared layers that the provider, metadata, and mapping
services will use.

## Layout

`backend/` is a Bun workspace of the root package. One `bun install` at the repo
root installs it, and the Astro app stays untouched.

- `src/http.ts` — `Http` service: stub Layer and fetch-backed Layer.
- `src/cache.ts` — `Cache` service: in-memory Layer with TTL and a max entry
  count.
- `src/providers.ts` — `Providers` service: directory and refresh-file loading
  plus tiered probing with cancellation.
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

`@effect/vitest` 4.1.5 accepts `vitest >=5.0.0 <6.0.0`; 5.1.1 is the newest
release in that range. The service patterns follow rat-stack's Effect 4.1.4
notes, and 4.1.5 is the installed patch line.

`@xstate/effect` is the official XState Effect bridge. It is still a beta: it
requires `xstate >=6.0.0-beta.4` and `effect >=4.0.0`, so the machine runs on
the v6 beta line. `6.0.0-beta.5` was the newest `xstate` beta when the pins
were taken. The bridge is used as designed: machines are built with
`setupEffect`, work is declared with `createEffectLogic`, and actors are started
with `createEffectActor`.
