# Glossary

Single context for the `watch` app. Terms only — no implementation.

## Port

Re-implementing the `watch` app on the CAFE stack (Cloudflare + Alchemy + Foldkit + Effect + XState) with behavior unchanged, judged by `docs/agents/acceptance.md`. The port added no features and redesigned no flows; later features are separate changes.

## Parity

The state of behaving exactly like the current app: same lookups, same results, same links, same notes. The acceptance criteria define it; the e2e suite checks it.

## Provider

A third-party embed host the app links to (`VidSrc`, `VidLink`, `VidZee`, `VidFast`). The app hosts nothing.

## Official

The licensed services that carry a title in the visitor's country, read from TMDB watch providers and shown in the dialog as "Also on".
