import { expect, test } from "bun:test";
import {
  buildProvidersJson,
  hasPlayerApi,
  hasSignedSrc,
  isVidFastAlive,
  isVidLinkAlive,
  isVidLinkPairAlive,
  isVidZeeAlive,
  needsRotAlarm,
  ROT_ALARM_MS,
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

test("VidLink counts as alive only when valid answers and bogus stays dead", () => {
  const valid = { status: 200, body: "<html>tmdb vidlink player</html>" };
  const bogus = { status: 500, body: "Internal Server Error" };
  expect(isVidLinkPairAlive(valid, bogus)).toBe(true);
  // A parked domain answers 200 with a marker to every title.
  expect(isVidLinkPairAlive(valid, { status: 200, body: "<html>tmdb vidlink player</html>" })).toBe(
    false,
  );
  expect(isVidLinkPairAlive(bogus, bogus)).toBe(false);
});

test("VidZee counts as alive on 200 with a marker", () => {
  expect(isVidZeeAlive(200, "<title>Vidzee Movie Player</title> tmdb")).toBe(true);
  expect(isVidZeeAlive(200, "<html>generic shell</html>")).toBe(false);
  expect(isVidZeeAlive(500, "Internal Server Error")).toBe(false);
});

test("output keeps one entry per origin, skips bad entries, ends with vidfast", () => {
  const at = "2026-11-21T00:00:00Z";
  const vidsrc = { name: "vidsrc.sh", baseUrl: "https://vidsrc.sh" };
  const vidfast = { name: "vidfast.vc", baseUrl: "https://vidfast.vc" };
  expect(
    buildProvidersJson(["https://vidsrc.sh", "https://vidsrc.sh/"], at, [vidfast.baseUrl]),
  ).toEqual({
    updatedAt: at,
    providers: [vidsrc, vidfast],
  });
  expect(buildProvidersJson(["https://vidsrc.sh", "not a url"], at, [vidfast.baseUrl])).toEqual({
    updatedAt: at,
    providers: [vidsrc, vidfast],
  });
  expect(buildProvidersJson(["https://vidsrc.sh"], at, [])).toEqual({
    updatedAt: at,
    providers: [vidsrc],
  });
});

test("VidFast counts as alive on 200, dead otherwise", () => {
  expect(isVidFastAlive(200)).toBe(true);
  expect(isVidFastAlive(403)).toBe(false);
  expect(isVidFastAlive(500)).toBe(false);
});

test("rot alarm fires when the file is missing or older than the window", () => {
  expect(needsRotAlarm(null)).toBe(true);
  expect(needsRotAlarm(60 * 60 * 1000)).toBe(false);
  expect(needsRotAlarm(ROT_ALARM_MS)).toBe(false);
  expect(needsRotAlarm(ROT_ALARM_MS + 1)).toBe(true);
});

test("empty probe results build an empty list (refresh refuses to write it)", () => {
  expect(buildProvidersJson([], "2026-11-22T00:00:00Z", [])).toEqual({
    updatedAt: "2026-11-22T00:00:00Z",
    providers: [],
  });
});
