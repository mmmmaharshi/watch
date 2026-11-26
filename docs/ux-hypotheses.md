# UX hypotheses

Outcome over outputs. One metric rules: median seconds from submit to Watch
press, measured by hallway test (5 timed runs, alternating builds). No
in-app tracking: the product keeps no user data, so a stopwatch and a friend
beat instrumentation here.

## How to use this file

- Propose a change as a hypothesis with a pre-committed signal before building.
- Test with the lowest fidelity that answers it: hallway runs on the live or
  preview build, not new code.
- Mark validated or invalidated with date and evidence. Invalidated items are
  removed from plans, not deferred.

## Open

- H1: Dead-link picks drop when users pick Movie/TV first. Signal: retries
  per session fall in 5 hallway runs vs the pre-selector preview build.
  Status: the selector was removed on 2026-11-26 without the comparison run,
  so this can no longer be A/B tested as written.
- H2: Time-to-first-link shrinks with newest-first sorting. Signal: median
  picks-to-play 2 or fewer in 5 hallway runs. Status: shipped untested —
  validate. If it loses to exact-match-first, revert the sort; the build now
  ranks an exact title match first.
- H3: A signed `vs_src` token means watchable. Signal: 5 probe-passing
  titles all play a video element in a real browser. Status: open — needs
  a browser check, not a code change.

## Decided

- (2026-11-22) UI never claims "playable"; it shows provider plus the exact
  URL and the user verifies by opening it. Evidence: map #7, ticket #12.
- (2026-11-22) VidLink is the independent fallback (pair-probe verified).
  Evidence: map #7, ticket #9.
- (2026-11-22) No name-based host gate; trust is provenance plus live probe.
  Evidence: PR #31 review thread.

## Dropped

- (empty) Invalidated hypotheses land here with the evidence that killed them.
