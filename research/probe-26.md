# Probe signal research (#26)

Date: 2026-11-21. Source: live fetches of `https://vidsrc.domains/` and probe URLs below.

## Directory shape

- Page has two sections: `<section id="domains">` (active) and `<section id="old">` (retired).
- Active rows (2026-11-21): `vidsrc.sh` (Primary), `vidsrc2.ru`, `vidsrc.ir`.
- Each active row holds its URL in a copy button: `<button class="chip-copy" data-val="https://...">`.
- Old section rows have either a `data-val` button (`Use New`: vidsrc.me, vidsrc.io, vidsrc.bz, vidsrc.gd, vidsrc.do, vidsrc.tw, vidsrc-embed.ru, vidsrc-embed.su) or plain text with no button (`Dead`: vsrc.su, vidsrc.in, vidsrc.net, and others).
- Rule that works: parse only the slice between `id="domains"` and `id="old"`, take `data-val` URLs. This matches `parseActiveDomains` in `src/lib/providers.ts`. Never parse the whole page. Old `data-val` entries must stay out.
- Note: `vidsrc.sh` and `vidsrc.me` served with expired certs on this date (Python SSL verify failed; browsers may still load). `vidsrc.io` redirects in a loop (HTTP 308).

## Probe results (valid title: tt0133093 movie, tt0903747 tv; bogus: tt0000000)

| Host                                                                 | Valid                                                       | Bogus                            | Body signal                                                                                                                                                       |
| -------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| vidsrc.sh, vidsrc2.ru, vidsrc.ir, vidsrc.me `/embed/movie/tt0133093` | 200                                                         | 200 (same 59994-byte shell)      | None static. Page is a JS shell with `<iframe id="player_iframe" data-api="/vs_src.php?type=movie&id=...">`. Valid and bogus bodies are byte-identical in length. |
| `vs_src.php?type=movie&id=`                                          | 200 JSON `{"src":"...?vs=<token>"}`                         | 200 JSON, same shape             | `"src"` + `?vs=` proves the domain is alive and the API is wired. It does NOT prove the title exists (bogus id also gets a signed src).                           |
| Signed player (`stellarconductornexus.com/embed/...`)                | 200 shell, 10101 bytes                                      | 200 shell, same bytes            | None static. Needs JS run or headless check.                                                                                                                      |
| vidlink.pro `/movie/tt0133093`                                       | 200, body has `tmdb`, `vidlink`                             | 500 Internal Server Error        | Best cheap signal found: status alone tells valid from bogus. Use `200 + body has tmdb/vidlink` for alive, `500` for dead title.                                  |
| player.vidzee.wtf `/embed/movie/tt0133093`                           | 200, title `Vidzee Movie Player`, body has `tmdb`, `vidzee` | 200, same shell                  | Weak. Same shell for bogus. Needs deeper API check (not done here).                                                                                               |
| vidfast.vc `/movie/tt0133093`                                        | 200, has `<video`                                           | 200 (bogus also 200, full shell) | Weak. Static 200 means little.                                                                                                                                    |
| player.videasy.net, videasy.net, vixcloud.cc, vixcloud.co            | DNS fail / 404                                              | —                                | Unreachable on this date. Drop from v1 list or re-check later.                                                                                                    |

## Answer to the ticket question

- Plain HTTP 200 proves nothing on VidSrc hosts. Valid and bogus titles return the same shell.
- Cheapest signal that beats 200 for VidSrc: embed page has `data-api="/vs_src.php?..."` AND that endpoint returns JSON with `"src"` containing `?vs=`. This proves alive + wired, not title playable.
- Only host with a real per-title static signal: VidLink (200 vs 500).
- Full proof of playable needs a headless browser or the inner RCP API. Leave that to #28 (provider list) and #27 (refresh job).

## Suggested next step

- Keep `parseActiveDomains` as is (slice + `data-val`). Add `vs_src.php` `"src"` check as the refresh-job health probe. Prefer VidLink-style status checks where a host offers them.
