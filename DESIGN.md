---
name: watch
description: Paste an IMDb or TMDB ID; get a working stream link on a stamped coupon.
colors:
  navy: "#16324F"
  navy-glow: "#1E4062"
  navy-deep: "#0F2537"
  red: "#C0392B"
  coupon: "#F7F4EA"
  paper: "#FFFDF6"
  purple: "#5B3E74"
  muted: "#7C838C"
  line: "rgba(22, 50, 79, 0.25)"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.01em"
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.08em"
  body:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    letterSpacing: "0.16em"
rounded:
  none: "0"
  round: "50%"
spacing:
  xs: "8px"
  sm: "12px"
  md: "20px"
  lg: "28px"
components:
  button-primary:
    backgroundColor: "{colors.red}"
    textColor: "{colors.coupon}"
    rounded: "{rounded.none}"
    padding: "0 26px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "#A63225"
    textColor: "{colors.coupon}"
  button-primary-disabled:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.coupon}"
  button-watch:
    backgroundColor: "{colors.red}"
    textColor: "{colors.coupon}"
    rounded: "{rounded.none}"
    padding: "0 20px"
    height: "38px"
  button-watch-hover:
    backgroundColor: "#A63225"
    textColor: "{colors.coupon}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.navy}"
    rounded: "{rounded.none}"
    padding: "0 20px"
    height: "38px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.navy}"
    rounded: "{rounded.none}"
    padding: "0 14px"
    height: "48px"
  coupon-card:
    backgroundColor: "{colors.coupon}"
    rounded: "{rounded.none}"
  type-tag:
    backgroundColor: "transparent"
    textColor: "{colors.red}"
    rounded: "{rounded.none}"
    padding: "3px 8px"
---

# Design System: watch

## Overview

**Creative North Star: "Ticket Wallet"**

A stream lookup is a ticket, not a search page. The working link is a stamped coupon with a carrier and a destination; the category's centered hero-and-card shell is refused. Ticket Wallet treats the pasted ID as the start of a short route: FROM, CARRIER, TO, and a stamp that says it worked.

The desk is a radial navy field, lit at the center and deep at the edges. A single pale coupon sits on it with generous margins, its tab in carbon purple and its figures set as monospaced tabular data. Hairline rules do the structuring; surfaces stay square and unrounded, and depth is one coupon shadow over a light scrim. The stamp and the coupon's fixed fields are recognizable with all content removed, so the shape carries the idea before the words do.

The visitor sees a ticket being issued: their ID in the FROM field, the provider as CARRIER, the stream URL as TO. The stamp tells them it worked; the warning tells them it is third-party. The themed caret and selection carry the red signal into the text. Provenance: ticket wallet world, seed 7a0f6ff53762f44b, from the surface direction contract.

**Key Characteristics:**
- One input, one action, one result dialog.
- Coupon on a dark radial field; square corners and hairline rules.
- Airline-grotesk caps for heads, monospaced tabular figures for IDs and URLs.
- Jet red drives the primary action, the VALID stamp, and the themed caret/selection.
- Third-party warning stays readable beneath the result.

## Colors

Two accents work against a paper-and-navy neutral base: carrier navy structures the field and text, jet red drives the actions and certifies, carbon purple fills the figures. Normative values live in the frontmatter; prose names roles only.

### Primary

- **Carrier Navy** — the radial field's mid stop, link color, ticket title, barcode ink, and structural text. It is the structural voice, held in `colors.navy`.
- **Jet Red** — the primary action fill (Watch now and Watch), focus ring, themed caret and selection, type tag, error state, and VALID stamp. Its presence means action or success; see `colors.red`.

### Secondary

- **Carbon Purple** — filled figures: the coupon head, the dialog's carrier head, provider meta, pending status, and the input's focus border. See `colors.purple`.

### Neutral

- **Radial Navy** — the lit center of the desk field, behind the coupon (`colors.navy-glow`).
- **Desk Navy** — the outer stop of the field and the punched notch circles (`colors.navy-deep`).
- **Coupon White** — the ticket stock and the ink on dark surfaces (`colors.coupon`).
- **Paper** — the input well, one step lighter than the coupon (`colors.paper`).
- **Muted Ink** — placeholder text, field labels, hints, and the disabled button (`colors.muted`).
- **Hairline Rule** — the low-opacity navy stroke that divides fields and outlines controls (`colors.line`).

### Named Rules

**The Jet Red Rule.** Jet red marks the primary action, the VALID stamp, and the themed caret/selection; when it appears, the ticket acted or succeeded.

## Typography

**Display Font:** Barlow Condensed (self-hosted via Fontsource) with Arial Narrow fallback — the airline-grotesk caps.
**Body Font:** IBM Plex Mono (self-hosted via Fontsource) with ui-monospace fallback — the monospaced tabular data.
**Label/Mono Font:** Barlow Condensed for field caps; IBM Plex Mono for small meta and identifiers.

**Character:** The Fontsource bundle ships Barlow Condensed, Barlow, and IBM Plex Mono; the implemented stacks call Barlow Condensed and IBM Plex Mono. One voice calls the route, the other states the data, and neither is decorative.

### Hierarchy

- **Display** (Barlow Condensed, bold): the ticket title in the result dialog; size and tracking are normative in `typography.display`.
- **Headline** (Barlow Condensed, bold): the "watch" tab in the coupon head; see `typography.headline`.
- **Body** (IBM Plex Mono, regular): input, field values, notices, and status lines; values live in `typography.body`, with tabular figures on by default.
- **Label** (Barlow Condensed, uppercase): FROM / CARRIER / TO caps and field labels; see `typography.label`.
- **Meta** (IBM Plex Mono, uppercase, 10px / 0.14em): the coupon head meta line. The dialog carrier head uses 11px / 0.16em Barlow Condensed caps; the red type tag is 10px / 0.1em, the VALID stamp is 22px bold with 0.2em tracking, and the title drops to 34px on narrow screens.

### Named Rules

**The Airline-Caps Rule.** Airline-grotesk caps carry tabbed heads; monospaced tabular figures carry IDs and URLs.

## Layout

The desk is a centered flex field with 32px vertical and 16px horizontal body padding, safe-area insets on top and bottom, and a 56px top pad with 18px sides on narrow screens. A single desk column maxes out at 980px. Inside it the coupon stacks as head, form, status, hint, and recent; the result is a dialog over the same desk with its own purple carrier head, and the safety notice sits below.

The form pairs a 48px input with a 48px red primary button across a 12px gap; at the 640px breakpoint it stacks and the button goes full width. The ticket splits into a fluid main panel and a fixed 190px stub; at the same breakpoint the stub drops below and its punched notches are hidden. Field data uses a 1fr / 2.2fr grid with an 18px gap, printing FROM, CARRIER, and TO in that order and collapsing to one column there. The rhythm is 8 / 12 / 20 / 28px.

**The One-Screen Rule.** One page, one input, one primary action; the result appears in a dialog over the same coupon, with the exact destination shown before the user leaves.

## Elevation & Depth

The system is flat except for one lifted object. The desk is a radial navy field, not a surface that lifts; the coupon alone floats, and the result dialog reuses that stock over a light navy scrim. Depth is separation of stock, not stacked cards.

### Shadow Vocabulary

- **Coupon Lift** (`box-shadow: 0 28px 60px rgba(0, 0, 0, 0.35)`): the single ambient shadow under the coupon; nothing else in the system lifts.
- **Modal Scrim** (`background: rgba(22, 50, 79, 0.12)`): a light navy wash behind the result dialog; it tints the desk rather than dimming it.

### Named Rules

**The Single-Lift Rule.** The coupon is the only surface that floats; the desk and dialog stay flat.

## Shapes

Square corners throughout; the only circles are the 18px punched notches on the stub edge and the loading spinner. Structure comes from hairline rules: 1px dividers, a 3px double top border on the ticket, and a dashed stub divider. The stub closes with a 26px navy barcode strip. The VALID stamp is a 3px double-bordered rectangle rotated -12deg. There are no rounded cards, no pills, and no clipped corners.

**The Content-Removed Rule.** The stamp and the coupon's fixed fields are recognizable with all content removed.

## Components

### Buttons

- **Shape:** square corners, Barlow Condensed uppercase caps, no border on filled variants.
- **Primary (Watch now):** jet red fill (`colors.red`), coupon-white text, 48px tall, 26px side padding, 17px size, 0.12em tracking; hover `#A63225`, active `scale(0.98)`, disabled muted with a wait cursor.
- **Small Primary (Watch):** jet red fill, coupon-white text, 38px tall, 20px side padding, 14px size; hover `#A63225`.
- **Secondary (Cancel / icons):** transparent fill, 1px hairline border, navy text, 38px tall; hover a 6% navy wash, copied state `#1E7A46`.
- **Focus:** 3px jet-red outline with 3px offset on every control.

### Chips

- **Style:** the red type tag is a transparent chip with a 1px jet-red border, red uppercase 10px text, 0.1em tracking, and 3px / 8px padding. It has no selected state; it is a printed label.

### Cards / Containers

- **Corner Style:** square; the ticket carries a 3px double navy top border over a 1px hairline outline.
- **Background:** coupon white; input wells are paper, and both the coupon head and the dialog carrier head are carbon purple.
- **Shadow Strategy:** one Coupon Lift; see Elevation & Depth.
- **Internal Padding:** head 14px / 28px / 12px, dialog head 10px / 24px, main 20px / 24px / 18px, stub 20px / 16px — the 12 / 20 / 28px rhythm.
- **Stub:** fixed 190px, dashed hairline divider, two 18px navy-deep notch circles punched at the split, a 26px barcode strip at its foot, and the rotated VALID stamp pinned bottom-right.

### Inputs / Fields

- **Style:** paper fill, 1px hairline border, 48px tall, 14px side padding, 13px mono text, italic muted placeholder.
- **Focus:** border shifts to carbon purple; error shifts to jet red; loading holds purple with a 14px spinner rotating `0.7s linear infinite`.
- **Theming:** the input caret and text selection are jet red on coupon white.

### Dialog

- **Style:** transparent dialog capped at 720px over the Modal Scrim. It opens with a purple carrier head (`watch` / `Stream pass · Issued`), then the result ticket printing FROM / CARRIER / TO, followed by the third-party warning and the Cancel / retry / copy / Watch controls.

### Signature Component: VALID Stamp

A 3px double jet-red border, 22px bold Barlow Condensed caps, 0.2em tracking, rotated -12deg, pinned to the stub's bottom-right. It is the proof-of-success mark and must remain legible with all other content removed.

## Do's and Don'ts

### Do:

- Do show the exact provider, canonical IMDb ID, and full stream URL before the user leaves the site.
- Do keep the third-party warning and safety notice readable beneath the result.
- Do keep hairline rules, square corners, the stub notch, and the barcode strip on every ticket.
- Do keep the 3px jet-red focus outline, themed caret and selection, keyboard-accessible dialog, focus return, and reduced-motion override.
- Do use tabular figures for IDs, gate, class, and URLs.

### Don't:

- Don't add rounded cards or extra shadows; the radial field is the desk's only gradient.
- Don't use jet red for decoration; it drives the primary action and certifies the stamp.
- Don't turn this into a search page with navigation, hero, or discovery cards.
- Don't hide or reword the third-party warning; the product states it hosts nothing.
