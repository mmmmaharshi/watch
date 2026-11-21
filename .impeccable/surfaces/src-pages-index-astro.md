---
version: 1
slug: "src-pages-index-astro"
primary_target: "src/pages/index.astro"
related_targets: []
---

# Surface: watch landing page

Scope: `src/pages/index.astro` and its client module. Visitor mode: Operate.

Audience and job: a viewer already holding an IMDb or TMDB ID or link; they want a working stream link with the fewest clicks. Action: paste, press Watch now, inspect the result, then leave for the provider. Proof: the exact provider, canonical IMDb ID, and full stream URL are shown before the user leaves. Constraints: keyless metadata, no accounts, no hosted video, third-party warning must stay readable.

Chosen direction: Ticket wallet. Memorable moment: the found link lands on a pale coupon as a route from the pasted ID to the stream, stamped VALID in carbon red.

Unresolved: none for this surface.

## Direction contract

THESIS: A stream lookup is a ticket, not a search page. The working link is a stamped coupon with a carrier and a destination; the category's centered hero-and-card shell is refused.

OWN-WORLD: Carrier navy #16324F desks, coupon white #F7F4EA stock, jet red #C0392B for the primary and VALID stamp, carbon purple #5B3E74 for filled figures. Airline-grotesk caps for tabbed heads, monospaced tabular figures for IDs and URLs, hairline rules, stub notches. The stamp and the coupon's fixed fields are recognizable with all content removed.

STORY: The visitor sees a ticket being issued: their ID in the FROM field, the provider as CARRIER, the stream URL as TO. The stamp tells them it worked; the warning tells them it is third-party.

FIRST VIEWPORT: Navy field, one pale coupon centered with generous margins. Top tab "watch", one ordinary text input, one solid red Watch now button. On result, the coupon shows FROM / CARRIER / TO fields, title, IMDb, full URL, a VALID stamp, and Cancel / Watch controls. Disclaimer stays readable beneath.

FORM: Ticket wallet, dealt challenger 6 of 6 (the user's pick), seed:7a0f6ff53762f44b.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
