# UI

The Effect UI program for the watch page: one root component with its Model,
Messages, `init`, `update` and `view`, plus owned child components. Side
effects are Commands the runtime runs. `src/boot.ts` builds the page's deps
and mounts it with `start(deps, container)`.

## Layout

- `src/lookup.ts` — the lookup state shapes the machine owns, plus the label
  rules.
- `src/model.ts` — the page Model and its initial value.
- `src/messages.ts` — every Message, named after the fact.
- `src/commands.ts` — the Command Services and the `LookupEngine` layer that runs
  the XState machine from `backend/src/lookup-machine.ts`.
- `src/mounts.ts` — reads the field once when the input mounts, and tracks
  hash changes while the page lives.
- `src/watch.ts` — the root component: `init`, `update`, the page view, and
  the result dialog, a native modal the browser opens for the result.
- `src/entry.ts` — `start(deps, container)`, called by the boot script.
- `src/boot.ts` — the browser entry: `start` with the HTTP transport.
- `src/shell.ts` — the static page HTML, rendered at build time.
- `src/render.ts` — the page's server render and adopted state, built at
  build time.
- `test/` — Story tests over `update`, Scene tests through the view, and
  Play tests of the whole flow against the real engine.

## How a lookup runs

`update` never fetches and never touches the network. It sends machine events
through the `AdvanceLookup` Command, which returns the machine snapshot after
the transition. A busy snapshot returns `AwaitLookupSettle`, which waits for
the machine to come back to `idle`. Every Command carries a generation, and a
reply from an older generation is dropped, so a superseded lookup cannot
overwrite a newer one.

Page state that the machine does not own lives in the Model: the field text
and the auto-focus permission. The dialog is the platform modal, opened by
the `openId` the machine sets, and closed by its `cancel` event.

## Checks

- `bun run check` from the repo root runs this package's typecheck and tests.
- `bun run --cwd ui check` runs only this package.
