import { expect, test } from "bun:test";
import {
  buildProvidersJson,
  hasPlayerApi,
  hasSignedSrc,
  isVidLinkAlive,
} from "./refresh-providers";

// Each test pins one probe signal from research/probe-26.md. A plain HTTP
// 200 proves nothing: valid and bogus titles return the same shell.

test("embed page counts as wired only with a vs_src data-api hook", () => {
  expect(
    hasPlayerApi('<iframe id="player_iframe" data-api="/vs_src.php?type=movie&id=tt0133093">'),
  ).toBe(true);
  expect(hasPlayerApi("<html><body>no player here</body></html>")).toBe(false);
});

test("vs_src endpoint counts as alive only with a signed src token", () => {
  expect(hasSignedSrc('{"src":"https://cdn.example/embed/abc?vs=token123"}')).toBe(true);
  expect(hasSignedSrc('{"src":"https://cdn.example/embed/abc"}')).toBe(false);
  expect(hasSignedSrc("{}")).toBe(false);
});

test("VidLink counts as alive on 200 with a marker, dead on 500", () => {
  expect(isVidLinkAlive(200, "<html>tmdb vidlink player</html>")).toBe(true);
  expect(isVidLinkAlive(500, "Internal Server Error")).toBe(false);
  expect(isVidLinkAlive(200, "<html>generic shell</html>")).toBe(false);
});

test("output keeps one entry per origin and always ends with vidfast", () => {
  expect(
    buildProvidersJson(["https://vidsrc.sh", "https://vidsrc.sh/"], "2026-11-21T00:00:00Z"),
  ).toEqual({
    updatedAt: "2026-11-21T00:00:00Z",
    providers: [
      { name: "vidsrc.sh", baseUrl: "https://vidsrc.sh" },
      { name: "vidfast.vc", baseUrl: "https://vidfast.vc" },
    ],
  });
});
