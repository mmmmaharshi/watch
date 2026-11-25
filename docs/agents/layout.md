# Layout

Four folders, one owner each. Find the owner before adding logic.

| Folder         | Owns                                                                                                                                                                                                                                                                                                                                                                  | Used by                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `src/lib/`     | The plain contract and helpers: wire types (`types.ts`), link shapes (`parse-input.ts`), provider facts (`providers.ts`), the pure search parsers and sort (`search.ts`), the language list (`languages.ts`), the loose-JSON guard (`http.ts`), the year helper (`year.ts`), server copy (`messages.ts`), the CSP (`csp.ts`), the browser transport (`transport.ts`). | The browser and the Worker |
| `backend/src/` | Effect services and the lookup machine: `site.ts` (the `/api/*` routes), `site-worker.ts` (the Worker entry), search and TMDB services, handler, metadata, mapping, providers layer, cache, refresh core, Alchemy stack.                                                                                                                                              | The Worker, the cron       |
| `ui/src/`      | Foldkit view, update, commands, model, messages, DOM mounts, `shell.ts` (the static page), `boot.ts` (the browser entry).                                                                                                                                                                                                                                             | The build, the browser     |
| `scripts/`     | Bun entry points run by hand or by CI: `build-site.ts`, `refresh-providers.ts`.                                                                                                                                                                                                                                                                                       | Your terminal              |

Three rules follow from the split:

- A shape that crosses the API boundary lives in `src/lib/types.ts`. The
  machine, the UI, and the Worker import it there.
- A provider fact (host, URL shape, directory parser) lives in
  `src/lib/providers.ts`. The Effect layer over it lives in
  `backend/src/providers.ts`.
- `src/lib` imports nothing from `backend/` or `ui/`, except `ui-deps.ts`, which
  is the page's adapter between the transport and the machine.

Tests sit beside their owner: `src/lib/*.test.ts`, `backend/test/`, `ui/test/`,
and `e2e/`. `e2e` has an offline project (`ci`) that runs in CI and a live
project (`live`, `live-mobile`) that reaches real services by hand.
