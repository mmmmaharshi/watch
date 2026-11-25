---
name: watch
description: Search a title or paste an IMDb/TMDB ID or link; get a working stream link in one quiet, left-aligned record.
colors:
  canvas: "#FFFFFF"
  ink: "#000000"
  secondary-ink: "rgb(0 0 0 / 64%)"
  tertiary-ink: "rgb(0 0 0 / 44%)"
  border: "rgb(0 0 0 / 10%)"
  strong-border: "rgb(0 0 0 / 15%)"
  hover-fill: "rgb(0 0 0 / 5%)"
  pressed-fill: "rgb(0 0 0 / 9%)"
  scrim: "rgb(0 0 0 / 50%)"
  danger: "oklch(0.6532 0.2328 25.74)"
typography:
  wordmark:
    fontFamily: "'Goeist', ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  intro:
    fontFamily: "'Goeist', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "'Goeist', ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  meta:
    fontFamily: "'Goeist', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "'Goeist', ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.625
  row-key:
    fontFamily: "'Goeist', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.5
  value:
    fontFamily: "'Goeist', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  identifier:
    fontFamily: "'Goeist Mono', ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  action:
    fontFamily: "'Goeist', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.5
  field:
    fontFamily: "'Goeist', ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  status:
    fontFamily: "'Goeist', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  footer:
    fontFamily: "'Goeist', ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.625
rounded:
  control: "8px"
  record: "12px"
  separator: "4px"
  spinner: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
  xxxl: "56px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "rgb(0 0 0 / 80%)"
    textColor: "{colors.canvas}"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    border: "1px solid {colors.border}"
    width: "40px"
    height: "40px"
  button-tertiary:
    backgroundColor: "{colors.hover-fill}"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.field}"
    rounded: "{rounded.control}"
    border: "1px solid {colors.strong-border}"
    height: "48px"
    padding: "0 12px"
  dialog:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.record}"
    border: "1px solid {colors.border}"
    padding: "24px"
  card:
    backgroundColor: "transparent"
    rounded: "{rounded.control}"
    padding: "0"
  spinner:
    textColor: "currentColor"
    rounded: "{rounded.spinner}"
    width: "16px"
    height: "16px"
---

# Design System: watch

## Overview

**Creative North Direction: "Quiet Utility"**

watch is one plain screen with three parts: a short wordmark and intro, one input with one primary action, and a dialog that shows the found stream link. The page is white, the ink is black, and the only colour is a functional focus state. There is no accent filling the primary action; the action is ink on paper.

The visitor pastes an IMDb or TMDB ID, a link, or a title and presses Watch now. A title is searched on Cinemeta, with TVMaze as a fallback for shows, and shown as a short list of films and shows; picking one runs the normal lookup. The result opens in a dialog. The dialog shows the title, the year and IMDb rating, the type, the IMDb ID, the provider, and the full stream URL before the visitor leaves for the provider. A quiet line at the foot of the page states that the app hosts nothing. A second note inside the dialog repeats the warning at the moment of leaving.

**Key Characteristics:**

- One input, one primary action, one result dialog.
- A title search shows a short candidate list before the lookup.
- White canvas, black ink, and alpha-black neutrals. No blue accent.
- Left-aligned text in one column capped by `max-w-[42rem]`.
- Goeist Sans for the interface; Goeist Mono for identifiers.
- Restrained radii: 8px controls and a 12px dialog.
- The exact provider, IMDb ID, and stream URL show before the user leaves; both safety notes stay quiet.

## Colors

The palette is neutral. The page is white and the ink is black. Intermediate tones come from alpha black over white, not from tinted grey tokens. `src/styles/global.css` defines the only theme tokens the view reads, `--foreground`, `--overlay-shadow`, `--focus`, and `--link`, and it sets focus and link to the foreground ink, so those states stay on the same ladder. The page sets no `dark` class and offers no theme switch.

### Primary

- **Ink** (`colors.ink`) — body text, the primary action fill, row values, and links. It is the only emphasis.
- **Canvas** (`colors.canvas`) — the page field and the dialog surface.

### Neutral

- **Secondary Ink** (`colors.secondary-ink`) — the intro line, the meta line, the type line, row keys, the status, and both safety notes.
- **Tertiary Ink** (`colors.tertiary-ink`) — nonessential glyphs only. It does not reach 4.5:1 on white.
- **Border** (`colors.border`) — the header and footer rules, the dialog outline, and row dividers.
- **Strong Border** (`colors.strong-border`) — the input outline.
- **Hover Fill** (`colors.hover-fill`) — the Cancel button at rest and hovered rows.
- **Pressed Fill** (`colors.pressed-fill`) — pressed neutral controls.
- **Scrim** (`colors.scrim`) — the wash behind the result dialog.

### Semantic

- **Danger** (`colors.danger`) — the invalid input state. The theme keeps it for the field outline only.

### Named Rules

**The Ink-Only Rule.** Black is the only emphasis. The primary action is ink, not an accent colour. Focus and link states use the same ink.

## Typography

**Faces:** Two faces from one family, each with one job.

- **Goeist Sans** (`--font-sans`, family name `Goeist`) carries the interface: the wordmark, intro, card title, description, row keys, provider, buttons, status, and notes. It is loaded from `goeist/sans.css`.
- **Goeist Mono** (`--font-mono`) carries identifiers: the IMDb ID and the stream URL. It is loaded from `goeist/mono.css`.

Both are variable fonts from 100 to 900. There is no serif. There is no styled casing: the wordmark is "watch", the buttons read "Watch now" and "Watch", and the row keys read "IMDb", "Provider", and "Stream URL" as written.

### Hierarchy

- **Wordmark** (`typography.wordmark`): `text-2xl font-semibold tracking-tight` on the page `h1`. Sentence case, left aligned.
- **Intro** (`typography.intro`): `text-sm text-black/64` under the wordmark. It states the one task.
- **Card Title** (`typography.title`): `text-2xl font-semibold tracking-tight text-balance`. It holds the movie name, or the IMDb ID in caps when there is no name.
- **Card Meta** (`typography.meta`): `text-sm text-black/64 tabular-nums`. It holds the year and the IMDb rating, joined by a middle dot.
- **Body** (`typography.body`): `text-base leading-relaxed text-black/64 text-pretty` for the plot description.
- **Row Key** (`typography.row-key`): `text-sm font-medium text-black/64` for IMDb, Provider, and Stream URL.
- **Value** (`typography.value`): `text-sm tabular-nums` for the provider. The IMDb ID and the stream URL add `font-mono` (`typography.identifier`). Links add `underline underline-offset-2`.
- **Action** (`typography.action`): the button base, `text-sm font-medium`, sentence case.
- **Field** (`typography.field`): `text-base`.
- **Status** (`typography.status`): `text-sm leading-relaxed text-black/64` for the status line.
- **Footer** (`typography.footer`): `text-xs leading-relaxed text-black/64` for the page safety note.

### Named Rules

**The Two-Role Rule.** Goeist Sans carries the interface. Goeist Mono carries identifiers. Do not set prose, labels, or controls in the mono face.

**The Sentence-Case Rule.** Chrome uses the casing of its text. No `uppercase`, no wide letter spacing on labels, buttons, or the wordmark.

## Layout

`ui/src/shell.ts` sets a top-aligned page. The `body` classes are `min-h-dvh bg-white px-6 text-black antialiased`. The `main` column is `mx-auto flex min-h-dvh w-full max-w-[42rem] flex-col py-14 sm:py-20`, which is 42rem or 672px. The content group is `w-full sm:my-auto`, so it centres on tall screens and starts at the top on a phone. The page opts into OS text scaling with `<meta name="text-scale" content="scale">`.

The header opens the column with `border-b border-black/10 pb-6`. The wordmark and the intro sit left aligned.

The form adds `mt-8` above it. The form sits in a `<search>` landmark and is `flex flex-col gap-3 sm:flex-row`. The text field takes the remaining width (`min-w-0 flex-1`). The type selector and the submit button keep their own width with `min-h-12`. A quiet hint line (`search-hint`, `text-xs text-black/64`) sits under the form so help does not rely on the placeholder. The status line follows with `mt-1` and reserves `min-h-[1.625em]`, so an error does not shift the page. It clears when the user types and is left aligned.

The footer is pushed to the bottom by `justify-between` and keeps `mt-14`. It has `border-t border-black/10 pt-5`, and its paragraph is left aligned.

The result opens in a modal over the theme scrim. `Modal.Container` uses `size="lg"`, and the dialog adds `rounded-xl border border-black/10 sm:max-w-[42rem]`. The dialog has `p-6`. Inside it, the `Card` runs `variant="transparent"` with `gap-0 p-0`.

At `sm`, which is 40rem, the form sits in one row, the dialog widens, the footer note and the actions share one row, and the row keys move beside their values in a `sm:w-28` key column. Below `sm`, the form stacks, each row key sits above its value, and the actions wrap.

**The One-Screen Rule.** One page, one input, one primary action. The answer opens in one dialog. The exact destination shows before the user leaves.

## Elevation & Depth

The page stays flat. The dialog and the toast are the only lifted layers, and they use the theme's overlay shadow. The input carries a faint field shadow. The card inside the dialog is transparent and casts nothing.

### Shadow Vocabulary

- **Field Shadow** (`--field-shadow`): a faint neutral shadow under the input.
- **Overlay Shadow** (`--overlay-shadow`): a soft neutral shadow under the dialog and the toast.
- **Scrim** (`colors.scrim`): the wash behind the dialog.
- **Focus Ring**: a 2px ink ring. Buttons offset the ring by 2px. The input draws a 2px ink ring with no offset.

### Named Rules

**The One Lift Rule.** The page stays flat. The dialog is the only lifted layer, and it uses the theme's overlay shadow.

## Shapes

The radii are restrained:

- **Buttons:** `rounded-lg`, 8px.
- **Text field:** `rounded-lg`, 8px.
- **Dialog:** `rounded-xl`, 12px.
- **Separator:** `rounded-sm`, 4px, on a 1px bar.
- **Spinner:** a circle.

Rows are divided by 1px hairline bars. There are no pills and no clipped corners.

**The Soft-Corner Rule.** Keep controls at 8px and the dialog at 12px. Do not use pill buttons.

## Components

The Foldkit view implements the components in `ui/src/view.ts`.

### Form

- **`TextField`** wraps the input. It holds `name="id"`, the value, `isDisabled` while loading, and `isInvalid` on an error. Its class is `min-w-0 flex-1`.
- **`Label`** is the accessible name, "IMDb or TMDB ID, link, or title". The class is `sr-only`, so the placeholder carries the visible prompt.
- **`Input`** is white, `min-h-12`, `rounded-lg`, with `border border-black/15` and `text-base`. The placeholder uses the theme field placeholder. `aria-invalid` stays `false` until a failed submit. `aria-describedby` always points at the hint, plus `status` while the field is invalid, so help stays tied to the field and the error text is not read before it appears. A shared link prefills the full link, not the bare id, and leaves the dialog closed until the visitor presses Watch now. On a device without touch points, the input takes focus on mount when no ID is shared, and again when the dialog closes. Touch devices are left alone so the on-screen keyboard does not open on its own.
- **Submit `Button`** is ink: `min-h-12 rounded-lg bg-black px-6 text-sm font-medium text-white hover:bg-black/80`. It holds a `Spinner size="sm" color="current"` while the lookup or the title search runs. It is disabled at the same time.
- **Type `select`** sits between the field and the submit: `min-h-12 rounded-lg border border-black/15 bg-white px-3 text-sm font-medium`. The `sr-only` label reads "Movie or TV show". A successful pasted-link lookup sets it to the result type.

### Title Search

- **When:** the input is not an IMDb ID, TMDB ID, or link, `parseTitleInput` returns null and the island calls the `search` action. A bare number is tried as a TMDB ID first; if TMDB has no such title, the number is searched as a title. A link that is not an IMDb title link or a TMDB movie/TV link is rejected with a message.
- **Server:** `src/lib/search.ts` searches one catalog per the Movie/TV selector. Movies ask the Cinemeta movie catalog; a failure answers no titles. Shows ask the Cinemeta series catalog, with a TVMaze fallback when it fails or comes back empty, keeping scores of 0.5 or more and using its medium image. Each row keeps IMDb ID, name, release year, and poster art when present. `sortResults` dedupes by IMDb ID and by name/year/kind, orders newest release first, and caps the list at 6. The query plus the selected kind form the cache key; successful results and a verified empty list are cached for 10 minutes per instance, while a total outage is not cached.
- **Candidates:** a `ul` with `mt-3 divide-y divide-black/10 border-y border-black/10`. Each item is a full-width `button` with `text-left` in a row: an optional 40 by 60 poster thumb (`rounded-lg object-cover`) plus name, year, and IMDb ID. The name is `text-sm font-medium`, the year follows in `text-sm text-black/64` only when known, and the IMDb ID shows in mono `text-xs text-black/44` so remakes stay apart. Hover and focus use `bg-black/5`; the focus ring is 2px ink. Thumbs load lazy and hide when no art ships.
- **Picking:** keeps the typed title in the input, runs the normal lookup, and updates the hash to the IMDb ID. A pasted ID or link also stays as typed. A pasted link sets the selector to the result type. The list stays in place, so after the dialog closes the user can pick another title. A failed or empty search reports through the status line.
- **Copy:** "6 matches. Choose one." for a list, "No title found. Try an ID or the full link." for none.

### Result Dialog

- **`Modal.Backdrop`** uses the theme scrim. The backdrop does not dismiss the dialog. Escape closes it, except while `fetching`.
- **`Modal.Container size="lg"`** and **`Modal.Dialog`** form the shell. The dialog is white, `rounded-xl`, with `border border-black/10`, the overlay shadow, and `p-6`. It scrolls with `max-h-full overflow-y-auto overscroll-contain`, so the actions stay reachable at large text sizes. It is named by `aria-labelledby="result-title"`, which points at the card title.
- **Scrollbar:** the `watch-dialog` class sets a 6px rounded thumb at 18% ink on a transparent track, darkening to 30% on hover. Firefox gets `scrollbar-width: thin` with the same colour. `scrollbar-gutter: stable` keeps the content from shifting when the thumb appears.
- **`Card variant="transparent" className="gap-0 p-0"`** removes the card fill, border, padding, and shadow.
- **`Card.Header`** holds the title (`text-2xl font-semibold tracking-tight text-balance`) and the meta line.
- **`Card.Content`** holds the optional description, the type line, and three rows.
- **`Card.Footer`** holds the safety note and the action row (`flex shrink-0 flex-wrap justify-end gap-2`).
- **`Separator`** divides the rows. Each row is `flex flex-col gap-1 py-3.5 sm:flex-row sm:gap-6`.

### Actions

- **Watch** is the ink primary `Button`: `h-10 rounded-lg bg-black px-5 text-sm font-medium text-white hover:bg-black/80`. It opens `result.url` in a new tab with `noopener`, and closes the dialog.
- **Cancel** is `variant="tertiary"`, `h-10 rounded-lg px-4`: the quiet neutral fill.
- **Refresh** and **Copy** are `variant="outline"` with `isIconOnly`, `size-12 rounded-lg sm:size-10`: a white square with a hairline border. Text buttons are `min-h-12` on touch and `sm:min-h-10` on pointer devices. Refresh shows the spinner while `fetching`. Copy writes a share link to the lookup and calls `toast.success("Link copied.")`.
- **Focus:** every control shows the ink `ring-2`. The input uses a 2px ink ring with no offset. An invalid field keeps the theme danger outline.
- **Disabled:** opacity `0.5` and a `not-allowed` cursor, from the theme's `status-disabled`.

### Status, Toast, and Spinner

- **Status line:** `id="status" role="status" aria-live="polite"` with `text-sm leading-relaxed` and a reserved `min-h-[1.625em]`. It is `text-black/64` by default and `font-medium text-black` on an error. The error stays until the user types or the next lookup starts.
- **`Toast.Provider placement="bottom"`** renders the copy confirmation. The toast is a white panel with the overlay shadow and a rounded corner.
- **`Spinner`** uses `size="sm"`, which is 16px, and `color="current"`.

### Wordmark and Safety Notes

- **Wordmark:** the page `h1` reads "watch" in `text-2xl font-semibold tracking-tight`. The intro below it reads "Search a title, or paste an IMDb or TMDB ID or link."
- **Page safety note:** a `text-xs leading-relaxed text-black/64` paragraph in the footer. It states that the app hosts nothing, links to third parties, and suggests an ad blocker.
- **Dialog safety note:** `text-sm leading-relaxed text-black/64` inside `Card.Footer`. It names the provider and states that the app does not control external sites.

## Do's and Don'ts

### Do:

- Do show the exact provider, canonical IMDb ID, and full stream URL before the user leaves.
- Do keep both safety notes quiet and readable.
- Do keep the primary action in ink.
- Do keep Goeist Sans for the interface and Goeist Mono for identifiers.
- Do keep the labelled input, the keyboard-accessible dialog, focus return, and reduced motion.
- Do keep one primary action per surface: Watch now on the page, Watch in the dialog.

### Don't:

- Don't add an accent colour, a gradient, or a themed card fill.
- Don't use pill buttons or uppercase labels.
- Don't use Goeist Mono for prose, labels, or controls. It is for identifiers only.
- Don't center the prose. Left-align the wordmark, status, and footer.
- Don't stack a second shadow on the dialog. The overlay shadow is the only lift.
- Don't hide or reword the safety notes. The product states that it hosts nothing.
- Don't replace the `sr-only` label with a placeholder alone.
- Don't remove the `motion-reduce` behaviour from the spinner and the transitions.
