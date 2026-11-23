# UI

The Foldkit program for the watch page: one Model, one Message union, one pure
`update`, and named Commands. The Astro page mounts it with
`start(deps, container)`.

## Layout

- `src/lookup.ts` — the lookup state shapes the machine owns, plus the label
  rules.
- `src/model.ts` — the page Model and its initial value.
- `src/messages.ts` — every Message, named after the fact.
- `src/commands.ts` — the named Commands and the `LookupEngine` layer that runs
  the XState machine from `backend/src/lookup-machine.ts`.
- `src/mounts.ts` — reads the field and the hash once, when the input mounts.
- `src/subscriptions.ts` — hashchange and popstate as Messages.
- `src/update.ts` — the pure transition function.
- `src/view.ts` — the page, form, candidate list, and result dialog.
- `src/entry.ts` — `start(deps, container)`, called by the host page.
- `src/render.ts` — the page's static markup, rendered at build time.
- `test/` — story tests over `update` and scene tests through the view.

## How a lookup runs

`update` never fetches and never touches the network. It sends machine events
through the `AdvanceLookup` Command, which returns the machine snapshot after
the transition. A busy snapshot returns `AwaitLookupSettle`, which waits for
the machine to come back to `idle`. Every Command carries a generation, and a
reply from an older generation is dropped, so a superseded search cannot
overwrite a newer one.

Page state that the machine does not own lives in the Model: the field text,
the auto-focus permission, hidden posters, and the copy notice. The dialog is
the `@foldkit/ui` Dialog submodel.

## Checks

- `bun run check` from the repo root runs this package's typecheck and tests.
- `bun run --cwd ui check` runs only this package.
