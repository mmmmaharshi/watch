# Layout

Four folders, one owner each. Find the owner before adding logic.

| Folder         | Owns                                                                                                                                                                                                                                                                                                   | Used by                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| `src/lib/`     | The plain contract and helpers: wire types (`types.ts`), link shapes (`parse-input.ts`), provider facts (`providers.ts`), search (`search.ts`), the TMDB client (`tmdb.ts`), the language list (`languages.ts`), HTTP and cache (`http.ts`), the year helper (`year.ts`), server copy (`messages.ts`). | The browser and the Worker |
| `backend/src/` | Effect services and the lookup machine: handler, metadata, mapping, the providers layer, cache, refresh core, Alchemy stack.                                                                                                                                                                           | The actions, the cron      |
| `ui/src/`      | Foldkit view, update, commands, model, messages, DOM mounts.                                                                                                                                                                                                                                           | The page                   |
| `scripts/`     | Bun entry points run by hand or by CI (`refresh-providers.ts`).                                                                                                                                                                                                                                        | Your terminal              |

Three rules follow from the split:

- A shape that crosses the action boundary lives in `src/lib/types.ts`. The
  machine, the UI, and the actions import it there.
- A provider fact (host, URL shape, directory parser) lives in
  `src/lib/providers.ts`. The Effect layer over it lives in
  `backend/src/providers.ts`.
- `src/lib` imports nothing from `backend/` or `ui/`, except `ui-deps.ts`, which
  is the page's adapter between the two.

Tests sit beside their owner: `src/lib/*.test.ts`, `backend/test/`, `ui/test/`,
and `e2e/`. `e2e` has an offline project (`ci`) that runs in CI and a live
project (`live`, `live-mobile`) that reaches real services by hand.
