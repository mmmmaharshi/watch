---
name: watch
description: Paste an IMDb or TMDB ID; get a working stream link in one quiet, centered result.
colors:
  canvas: "oklch(0.9702 0 0)"
  ink: "oklch(0.2103 0.0059 285.89)"
  accent: "oklch(0.6204 0.195 253.83)"
  accent-hover: "color-mix(in oklab, oklch(0.6204 0.195 253.83) 90%, oklch(0.9911 0 0) 10%)"
  on-accent: "oklch(0.9911 0 0)"
  surface: "oklch(100% 0 0)"
  control: "oklch(94% 0.001 286.375)"
  control-hover: "color-mix(in oklab, oklch(94% 0.001 286.375) 96%, oklch(0.2103 0.0059 285.89) 4%)"
  muted: "oklch(0.5517 0.0138 285.94)"
  separator: "oklch(92% 0.004 286.32)"
  danger: "oklch(0.6532 0.2328 25.74)"
  backdrop: "rgba(0, 0, 0, 0.5)"
typography:
  wordmark:
    fontFamily: "'Scoutie Sans Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.3333
    letterSpacing: "0.36em"
  wordmark-subline:
    fontFamily: "'Scoutie Sans Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 500
    letterSpacing: "0.22em"
  title:
    fontFamily: "'Scoutie Sans Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.3333
    letterSpacing: "-0.025em"
  meta:
    fontFamily: "'Scoutie Sans Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4286
  body:
    fontFamily: "'Scoutie Sans Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "'Scoutie Sans Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.3333
    letterSpacing: "0.1em"
  value:
    fontFamily: "'Scoutie Sans Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4286
  action:
    fontFamily: "'Scoutie Sans Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4286
  field:
    fontFamily: "'Scoutie Sans Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "'Scoutie Sans Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.625
rounded:
  field: "12px"
  control: "24px"
  separator: "4px"
  spinner: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
  xxxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.on-accent}"
  button-secondary:
    backgroundColor: "{colors.control}"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.control-hover}"
  button-icon:
    backgroundColor: "{colors.control}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    width: "40px"
    height: "40px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.field}"
    rounded: "{rounded.field}"
    padding: "8px 12px"
  card:
    backgroundColor: "transparent"
    rounded: "{rounded.control}"
    padding: "0"
  dialog:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "24px"
  spinner:
    textColor: "currentColor"
    rounded: "{rounded.spinner}"
    width: "16px"
    height: "16px"
---

# Design System: watch

## Overview

**Creative North Star: "Quiet Utility"**

watch is one screen with three parts: a wordmark, one input with one primary button, and a dialog that shows the found stream link. HeroUI v3's default light theme supplies the look. The page is a soft grey field, the surfaces are white, and one blue accent marks the primary action.

The visitor pastes an IMDb or TMDB ID and presses Watch now. The result opens in a dialog. The dialog shows the title, the year and IMDb rating, the type, the IMDb ID, the provider, and the full stream URL before the visitor leaves for the provider. A quiet line at the foot of the page states that the app hosts nothing. A second note inside the dialog repeats the warning at the moment of leaving.

**Key Characteristics:**
- One input, one primary action, one result dialog.
- HeroUI v3 default light theme: soft grey canvas, white surfaces, one blue accent. No token overrides.
- One centered column capped by `max-w-[45rem]`.
- Scoutie Sans Variable at every role.
- Pill buttons, 12px fields, and 24px cards and dialog.
- The exact provider, IMDb ID, and stream URL show before the user leaves; the safety note stays quiet.

## Colors

The palette is the HeroUI v3 default light theme. The values live in `@heroui/styles` (`dist/themes/default/variables.css`) and nothing overrides them. `src/styles/global.css` adds only the font. The page sets no `dark` class and offers no theme switch.

### Primary

- **Accent Blue** (`colors.accent`, `--accent`) — the fill of the primary button and the color of every focus ring. Hover uses `colors.accent-hover`. The value is HeroUI's default.
- **Snow** (`colors.on-accent`, `--accent-foreground`) — text on the accent fill.

### Neutral

- **Canvas** (`colors.canvas`, `--background`) — the page field behind the column.
- **Ink** (`colors.ink`, `--foreground`) — body text, the card title, row values, and open links.
- **Surface** (`colors.surface`, `--surface` and `--overlay`) — the input well, the result dialog, and the toast.
- **Control** (`colors.control`, `--default`) — the fill of the secondary and tertiary buttons. Hover uses `colors.control-hover`.
- **Muted** (`colors.muted`, `--muted`) — the wordmark subline, the meta line, the type line, row keys, hints, status text, both safety notes, and the input placeholder. The value is HeroUI's default.
- **Separator** (`colors.separator`, `--separator`) — the 1px rules above the footer and between result rows.
- **Danger** (`colors.danger`, `--danger`) — the outline and ring of an invalid input.

### Named Rules

**The One Accent Rule.** Blue is the only accent. It fills the primary action and draws focus indicators. The secondary and tertiary buttons use the neutral `--default` grey.

## Typography

**Face:** Scoutie Sans Variable, loaded from `@fontsource-variable/scoutie-sans` and set as `--font-sans` in `src/styles/global.css`. Fallback: `ui-sans-serif, system-ui, sans-serif`. It is the only face. There is no second display face and no mono face.

**Character:** One sans carries the wordmark, the card title, the rows, and the buttons. IDs and URLs use `tabular-nums`, not a mono face. The small keys are uppercase with wide tracking. The card title is tight-tracked and balanced.

### Hierarchy

- **Wordmark** (`typography.wordmark`): `text-xs font-bold uppercase tracking-[0.36em]` on the page `h1`.
- **Wordmark Subline** (`typography.wordmark-subline`): `text-[10px] font-medium tracking-[0.22em] text-muted`. The line reads "Look up. Play.".
- **Card Title** (`typography.title`): `text-2xl font-semibold tracking-tight text-balance`. It holds the movie name, or the IMDb ID in caps when there is no name.
- **Card Meta** (`typography.meta`): the card description, `text-sm leading-5 text-muted tabular-nums`. It holds the year and the IMDb rating, joined by a middle dot.
- **Body** (`typography.body`): `text-sm leading-relaxed text-muted text-pretty` for the plot description.
- **Row Key** (`typography.label`): `text-xs font-semibold uppercase tracking-widest text-muted` for IMDb, Provider, Stream URL, and the type line.
- **Row Value** (`typography.value`): `text-sm tabular-nums`. Links add `underline underline-offset-2`.
- **Action** (`typography.action`): the button base, `text-sm font-medium`. The submit button adds `uppercase tracking-wider`. The dialog buttons keep sentence case.
- **Field** (`typography.field`): `text-base`, which steps down to `text-sm` from `sm` up.
- **Caption** (`typography.caption`): `text-xs leading-relaxed` for the status line, the hint, and both safety notes.

### Named Rules

**The One-Face Rule.** Scoutie Sans Variable carries every role. IDs and URLs stay in that face with tabular figures.

## Layout

`src/pages/index.astro` centers the page. The `body` classes are `flex min-h-dvh items-center justify-center bg-background p-5 py-12 text-foreground antialiased max-sm:items-start max-sm:pt-16`. The `main` column is `w-full max-w-[45rem]`, which is 45rem or 720px. It holds the wordmark, the island, and the footer.

The wordmark opens the column. `WatchApp` adds `mt-12` above the form. The form is `flex gap-2` and stacks below `sm` with `max-sm:flex-col`. The text field takes the remaining width (`min-w-0 flex-1`). The submit button keeps its own width. The status line and the hint follow with `mt-2`.

The footer closes the column with `mt-14 border-t border-separator pt-4 text-center`, and its paragraph caps at `max-w-xl`, which is 36rem.

The result opens in a modal over `bg-backdrop`. `Modal.Container` uses `size="lg"`, and the dialog adds `sm:max-w-[45rem]`, which is 45rem or 720px. The dialog has `p-6` and a 24px radius. Inside it, the `Card` runs `variant="transparent"` with `gap-0 p-0`.

At `sm`, which is 40rem, the dialog widens and the row keys move beside their values in a `sm:w-28` key column. Below `sm`, the body aligns to the top (`max-sm:items-start max-sm:pt-16`), the form stacks, the dialog takes the width minus `p-4`, and each row key sits above its value.

**The One-Screen Rule.** One page, one input, one primary action. The answer opens in one dialog. The exact destination shows before the user leaves.

## Elevation & Depth

The default theme supplies three shadows. The input uses `shadow-field`. The dialog and the toast use `shadow-overlay`. A normal card uses `shadow-surface`, but the result card sets `variant="transparent"`, which removes its fill and shadow. The dialog is the only lifted layer.

### Shadow Vocabulary

- **Field Shadow** (`--field-shadow`): `0 2px 4px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06), 0 0 1px rgba(0, 0, 0, 0.06)` under the input.
- **Overlay Shadow** (`--overlay-shadow`): `0 2px 8px rgba(0, 0, 0, 0.06), 0 -6px 12px rgba(0, 0, 0, 0.03), 0 14px 28px rgba(0, 0, 0, 0.08)` under the dialog and the toast.
- **Backdrop** (`--backdrop`): `rgba(0, 0, 0, 0.5)` behind the dialog.
- **Focus Ring**: `ring-2 ring-focus` in accent blue. Buttons offset the ring by `--ring-offset-width`, which is 2px. The toast uses a 2px accent outline with a 2px offset. The input draws a 2px ring with no offset.

### Named Rules

**The One Lift Rule.** The page stays flat. The dialog is the only lifted layer, and it uses the theme's overlay shadow.

## Shapes

The radii come from `--radius: 0.5rem`:

- **Buttons:** `rounded-3xl`, 24px. A 36px to 40px button reads as a pill.
- **Text field:** `rounded-field`, 12px.
- **Card, dialog, toast:** `min(32px, var(--radius-3xl))`, 24px.
- **Separator:** `rounded-sm`, 4px, on a 1px bar.
- **Spinner:** a circle.

Rows are divided by 1px `Separator` bars. There are no clipped corners.

**The Soft-Corner Rule.** Round the controls and the dialog. Keep the field at 12px and the larger surfaces at 24px.

## Components

The island imports from `@heroui/react` in `src/components/WatchApp.tsx`.

### Form

- **`TextField`** wraps the input. It holds `name="id"`, the value, `isDisabled` while loading, and `isInvalid` on an error. Its class is `min-w-0 flex-1`.
- **`Label`** is the accessible name, "IMDb or TMDB ID or link". The class is `sr-only`, so the placeholder carries the visible prompt.
- **`Input`** is white (`bg-field`), 12px radius, `px-3 py-2`, `text-base sm:text-sm`, with a `shadow-field`. The placeholder uses the field token. `aria-describedby="hint"` points at the hint line. The input takes focus on mount when no ID is shared, and again when the dialog closes.
- **Submit `Button`** is the primary variant: accent blue, snow text, `uppercase tracking-wider`. It holds a `Spinner size="sm" color="current"` while the lookup runs. It is disabled at the same time.

### Result Dialog

- **`Modal.Backdrop`** is the default opaque backdrop. The backdrop does not dismiss the dialog. Escape closes it, except while `fetching`.
- **`Modal.Container size="lg"`** and **`Modal.Dialog sm:max-w-[45rem]`** form the shell. The dialog is white `bg-overlay`, `shadow-overlay`, with a 24px radius and `p-6`. It has an `aria-label` equal to the title.
- **`Card variant="transparent" className="gap-0 p-0"`** removes the card fill, border, padding, and shadow.
- **`Card.Header`** holds the title (`text-2xl font-semibold tracking-tight text-balance`) and the meta line.
- **`Card.Content`** holds the optional description, the type line, and three rows.
- **`Card.Footer`** holds the safety note and the action row (`flex flex-wrap justify-end gap-2`).
- **`Separator`** divides the rows. Each row is `flex flex-col gap-1 py-3 sm:flex-row sm:gap-5`.

### Actions

- **Watch** is the default primary `Button`: accent fill, snow text. It opens `result.url` in a new tab with `noopener`, and closes the dialog.
- **Cancel** is `variant="tertiary"`: the neutral `--default` fill.
- **Refresh** and **Copy** are `variant="secondary"` with `isIconOnly`: the same neutral fill, 40px wide, and 36px from `md`. Refresh shows the spinner while `fetching`. Copy writes a share link to the lookup and calls `toast.success("Link copied.")`.
- **Focus:** every button shows the accent `ring-2`. The input uses `status-focused-field`, a 2px accent ring with no offset. An invalid field shows a 1px danger outline, and a 2px danger ring when focused.
- **Disabled:** opacity `0.5` and a `not-allowed` cursor, from the theme's `status-disabled`.

### Status, Toast, and Spinner

- **Status line:** `role="status" aria-live="polite"` with `text-xs leading-relaxed`. It is muted by default and `font-semibold text-foreground` on an error.
- **`Toast.Provider placement="bottom"`** renders the copy confirmation. The toast is a white `bg-surface` panel with `shadow-overlay` and a 24px radius.
- **`Spinner`** uses `size="sm"`, which is 16px, and `color="current"`. It runs the theme's `animate-spin-fast`: one turn in 0.75s, linear.

### Wordmark and Safety Notes

- **Wordmark:** the page `h1` reads "watch" in `text-xs font-bold uppercase tracking-[0.36em]`. "Look up. Play." sits below in `text-[10px] font-medium tracking-[0.22em] text-muted`.
- **Page safety note:** a `text-xs leading-relaxed text-muted` paragraph in the footer, capped at `max-w-xl`. It states that the app hosts nothing, links to third parties, and suggests an ad blocker.
- **Dialog safety note:** the same quiet size inside `Card.Footer`. It names the provider and states that the app does not control external sites.

## Do's and Don'ts

### Do:

- Do show the exact provider, canonical IMDb ID, and full stream URL before the user leaves.
- Do keep both safety notes quiet and readable.
- Do keep the accent blue for the primary action and focus indicators only.
- Do keep Scoutie Sans Variable as the only face.
- Do keep the labelled input, the keyboard-accessible dialog, focus return, and reduced motion.
- Do keep one primary action per surface: Watch now on the page, Watch in the dialog.

### Don't:

- Don't add a second face or a mono face for IDs and URLs. Use tabular figures.
- Don't add a second accent colour, a gradient, or a themed card fill.
- Don't stack a second shadow on the dialog. The overlay shadow is the only lift.
- Don't hide or reword the safety notes. The product states that it hosts nothing.
- Don't replace the `sr-only` label with a placeholder alone.
- Don't remove the `motion-reduce` behaviour from the spinner and the transitions.
