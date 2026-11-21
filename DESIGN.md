---
name: watch
description: Paste an IMDb or TMDB ID; get a working stream link in one quiet, ruled record.
colors:
  ink: "#0A0A0A"
  ink-hover: "#2B2B2B"
  paper: "#FAFAFA"
  surface: "#FFFFFF"
  gray: "#6B6B6B"
  line: "#E4E4E4"
  scrollbar: "#C9C9C9"
typography:
  display:
    fontFamily: "'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.035em"
  display-mobile:
    fontFamily: "'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "27px"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.035em"
  result-meta:
    fontFamily: "'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "0.04em"
  wordmark:
    fontFamily: "'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.36em"
  body:
    fontFamily: "'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "0em"
  field:
    fontFamily: "'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0em"
  label:
    fontFamily: "'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.2em"
  action:
    fontFamily: "'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.12em"
  action-small:
    fontFamily: "'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.12em"
  caption:
    fontFamily: "'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  fine-print:
    fontFamily: "'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "0em"
rounded:
  control: "4px"
  record: "6px"
  spinner: "50%"
spacing:
  xs: "8px"
  sm: "10px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "26px"
  xxxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "0 26px"
    height: "58px"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
    textColor: "{colors.paper}"
  button-primary-disabled:
    backgroundColor: "{colors.gray}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
  button-primary-small:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.action-small}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.field}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "58px"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.action-small}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  button-icon:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    width: "44px"
    height: "44px"
  record:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.record}"
    padding: "34px 36px 26px"
---

# Design System: watch

## Overview

**Creative North Star: "Monochrome Product Canon"**

A stream lookup is a plain product screen, not a themed object. The answer is one typographic record on a white field; the ticket metaphor and its costume are refused. Monochrome Product Canon treats the pasted ID as the shortest path to a link, with no ornament between the visitor and the answer.

The field is paper-white and the ink is near-black. One centered column, hairline rules, and strict monochrome do all the structuring; a single soft-offset shadow under the found record is the only depth. One workhorse grotesk, self-hosted Archivo, speaks at every role — there is no second display face and no monospace costume for identifiers. The found link resolves into one quiet, ruled record: the movie title as the lead line, a small year-and-rating line beneath it, then IMDb ID, provider, and full stream URL, with a single ink-black primary action and nothing else asking for attention.

The visitor pastes an ID, presses Watch now, and reads that record before leaving for the provider. Black is the only emphasis; the link is the product. A quiet line at the foot states that the app hosts nothing. Recognizable with all content removed by its centered column, thin rules, and strict monochrome. Provenance: Monochrome Product Canon, seed 7a0f6ff53762f44b, from the surface direction contract (safer re-roll, grounded card 1 of 2).

**Key Characteristics:**
- One input, one action, one ruled result record.
- Centered 720px column on a paper-white field, hairline rules, strict monochrome.
- One workhorse grotesk at every role; no second display face, no monospace costume.
- A single ink-black primary action is the only emphasis; the link is the product.
- The exact provider, IMDb ID, and stream URL show before the user leaves; the safety note stays readable.

## Colors

A strict monochrome palette: one near-black ink for action and text, a paper field, white surfaces, gray secondary, and hairline rules. Normative values live in the frontmatter; prose names roles only.

### Primary

- **Ink Black** (`colors.ink`) — the single primary action fill (Watch now and Watch), link and value text, focus outline, selection background, and error emphasis. It is the only emphasis on the screen.
- **Ink Lift** (`colors.ink-hover`) — the hover step of the primary action, one shade softer than at rest.

### Neutral

- **Paper** (`colors.paper`) — the page field and the primary action's text.
- **White Surface** (`colors.surface`) — the input well, the record, and the ghost and icon controls.
- **Secondary Gray** (`colors.gray`) — the contrast floor: placeholders, meta labels, hints, status, warnings, notices, the result's year-and-rating line, and the disabled action.
- **Hairline** (`colors.line`) — the 1px rules that outline controls and divide the record's rows.
- **Scrollbar Thumb** (`colors.scrollbar`) — the thumb on the paper field; the field carries a thin scrollbar so the chrome stays quiet.

### Named Rules

**The Strict Monochrome Rule.** Strict monochrome: near-black ink, paper field, white surfaces, gray secondary, hairline rules. Ink is the only emphasis; the link is the product.

## Typography

**Display & Body Font:** Archivo, self-hosted via Fontsource at weights 400 / 500 / 600 / 700, with system-ui, -apple-system, 'Segoe UI', sans-serif as fallback.
**Second Display Face:** none.
**Mono / Costume Face:** none.

**Character:** One workhorse grotesk carries every role, from the wordmark to the lead line to the tabular identifiers and URLs. There is one real type scale, generous tracking on the small caps, and tight tracking on the lead line; nothing is set in a second face.

### Hierarchy

- **Display** (`typography.display`): the movie title in the result h2 — largest, tight-tracked, and balanced so long titles wrap evenly; steps down on narrow screens to `typography.display-mobile`.
- **Result Meta** (`typography.result-meta`): the year and "IMDb <rating>" line directly beneath the title, in secondary gray. There is no separate label above the title.
- **Wordmark** (`typography.wordmark`): the small "watch" caps; its subline uses 500 weight and wider tracking.
- **Body** (`typography.body`): description, row values, warning, and notice copy.
- **Field** (`typography.field`): the ID input, with tabular figures on by default.
- **Label** (`typography.label`): uppercase keys (IMDb / Provider / Stream URL) and the type line.
- **Action** (`typography.action`): the primary button caps.
- **Action Small** (`typography.action-small`): ghost, icon, and small-primary caps.
- **Caption / Fine Print** (`typography.caption`, `typography.fine-print`): status, hint, warning, and safety note.

### Named Rules

**The One-Voice Rule.** One workhorse grotesk — self-hosted Archivo — at every role, with no second display face and no monospace costume. One real type scale.

**The Balanced Lead Rule.** The movie title is the lead: it wraps with balance and carries a quiet year-and-rating line beneath, with no separate label above it.

## Layout

A centered flex column caps at 720px with generous top and bottom margins and safe-area insets; the body fills the viewport on a paper field. Controls share one height, with the input and primary button sitting side by side across a small gap, and the record keeps its own padding. The found result opens in a centered dialog over a light ink scrim capped to the same column width, with the safety notice below. The field uses a thin scrollbar with a `colors.scrollbar` thumb.

At the 640px breakpoint the body aligns to the top, the form stacks with the primary button full width, the lead line steps down to the mobile display size, record padding tightens, and the ruled rows stack key-over-value. The spacing rhythm runs from the smallest control gaps to the record's generous padding; every step is normative in `spacing`.

**The One-Screen Rule.** One page, one input, one action. The answer is one quiet, ruled record on a white field, and the exact destination shows before the user leaves.

## Elevation & Depth

Depth is one soft-offset shadow under the found record; the paper field and white surfaces otherwise sit flat. Hairline rules, not stacked cards, carry structure. The dialog adds only a light ink scrim behind it, and the input shows a faint ink ring on focus.

### Shadow Vocabulary

- **Record Shadow** (`box-shadow: 0 12px 30px rgba(10, 10, 10, 0.06)`): the single soft-offset shadow under the found record.
- **Focus Ring** (`box-shadow: 0 0 0 3px rgba(10, 10, 10, 0.08)`): a faint ink ring on the focused input, paired with an ink border.
- **Modal Scrim** (`background: rgba(10, 10, 10, 0.18)`): the light wash behind the result dialog.

### Named Rules

**The Soft-Offset Rule.** The record carries one soft-offset shadow; the field, surfaces, and dialog stay flat. Hairline rules do the structuring.

## Shapes

Small, controlled radii only: controls use the small control radius and the found record uses a slightly larger one; the loading spinner is the only circle. Structure comes from 1px hairline rules that outline controls and divide the record into rows. There are no pills, no clipped corners, and no stacked card silhouettes.

**The Content-Removed Rule.** Recognizable with all content removed by its centered column, thin rules, and strict monochrome.

## Components

### Buttons

- **Shape:** small control radius, Archivo uppercase caps, no visible border on the filled variant.
- **Primary (Watch now):** ink fill, paper text, with the height, side padding, and caps normed in `components.button-primary`; hover lifts to `colors.ink-hover`, active scales slightly, disabled goes gray with a wait cursor.
- **Small Primary (Watch):** the same ink fill at the smaller control height; see `components.button-primary-small`.
- **Ghost / Icon (Cancel, retry, copy):** white surface, 1px hairline border, ink text; hover darkens the border to ink, and the copied state fills with ink and paper text.
- **Focus:** a 2px ink outline with 3px offset on every control; the input instead focuses with an ink border and faint ring.

### Text Input

- **Style:** white well, 1px hairline border, control radius, the shared control height, and field-sized ink text with tabular figures.
- **Focus / Error:** the border shifts to ink with a faint ring; the error state thickens the ink border.
- **Placeholder:** secondary gray. The caret and selection use ink and paper.

### Ruled Record

- **Lead:** the movie title in the h2 uses `typography.display` with balanced wrapping; the year and IMDb rating sit directly beneath in `typography.result-meta`. No label sits above the title.
- **Corner Style:** the record radius, a touch larger than controls.
- **Background:** white surface with a 1px hairline border.
- **Shadow Strategy:** one soft-offset shadow; see Elevation & Depth.
- **Internal Padding:** generous, normed in `components.record`; rows are divided by hairline rules.

### Ruled Rows

- **Style:** key/value pairs divided by 1px hairline rules; uppercase tracked gray keys beside tabular ink values. Links are underlined with a small offset.

### Wordmark & Safety Note

- **Wordmark:** small tracked ink caps with a quieter gray subline.
- **Safety Note:** quiet gray fine print at the foot, centered and readable; it states the app hosts nothing and links to third parties.

## Do's and Don'ts

### Do:

- Do show the exact provider, canonical IMDb ID, and full stream URL before the user leaves the site.
- Do keep the third-party warning and safety note quiet and readable beneath the result.
- Do keep the centered column, hairline rules, and strict monochrome recognizable with all content removed.
- Do keep one workhorse grotesk and one real type scale at every role.
- Do keep the labelled input, keyboard-accessible dialog, focus return, and reduced-motion support.
- Do keep the single ink-black primary action as the only emphasis; the link is the product.

### Don't:

- Don't add a second display face or a monospace costume for IDs and URLs; Archivo carries every role.
- Don't add color accents, gradients, or themed carets and selection; the field stays paper-white and the ink near-black.
- Don't theme this as a ticket, coupon, or discovery page with navigation, hero, or cards; the ticket metaphor is refused.
- Don't round beyond the small control radius or stack extra shadows; the record carries one soft-offset shadow on a white field.
- Don't hide or reword the third-party warning; the product states it hosts nothing.
- Don't put a "Stream Found" label above the movie title; the title is the lead.
