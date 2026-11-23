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
- `test/` — behavior tests through the service interfaces, plus property tests
  for the cache and provider rules.

## Commands

- `bun run --cwd backend check` — typecheck, lint, test.
- `bun run --cwd backend format` — format with oxfmt.
- `bun run check` from the repo root — the full gate, backend included.

## Pinned versions

Versions are exact, with no `^`, so the compiler and test diagnostics cannot
move under us.

| Package          | Version |
| ---------------- | ------- |
| `effect`         | 4.1.5   |
| `@effect/vitest` | 4.1.5   |
| `vitest`         | 5.1.1   |
| `typescript`     | 7.0.2   |
| `oxlint`         | 1.94.0  |
| `oxfmt`          | 0.79.0  |
| `@types/node`    | 26.6.6  |

`@effect/vitest` 4.1.5 accepts `vitest >=5.0.0 <6.0.0`; 5.1.1 is the newest
release in that range. The service patterns follow rat-stack's Effect 4.1.4
notes, and 4.1.5 is the installed patch line.
