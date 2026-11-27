import { expect, test } from "bun:test";
import { VIDFAST, VIDLINK, VIDZEE } from "./providers";
import { buildProvidersJson, hasPlayerApi, hasSignedSrc, isAlive } from "./provider-probes";

// Each test pins one probe signal from research/probe-26.md. A plain HTTP 200
// proves nothing: valid and bogus titles return the same shell.

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
  expect(isAlive(VIDLINK, { status: 200, body: "<html>tmdb vidlink player</html>" })).toBe(true);
  expect(isAlive(VIDLINK, { status: 500, body: "Internal Server Error" })).toBe(false);
  expect(isAlive(VIDLINK, { status: 200, body: "<html>generic shell</html>" })).toBe(false);
});

test("a parked domain answers the valid and the bogus title alike", () => {
  const valid = { status: 200, body: "<html>tmdb vidlink player</html>" };
  const bogus = { status: 500, body: "Internal Server Error" };
  expect(isAlive(VIDLINK, valid) && !isAlive(VIDLINK, bogus)).toBe(true);
  expect(isAlive(VIDLINK, valid) && !isAlive(VIDLINK, valid)).toBe(false);
});

test("VidZee counts as alive on 200 with a marker", () => {
  expect(isAlive(VIDZEE, { status: 200, body: "<title>Vidzee Movie Player</title> tmdb" })).toBe(
    true,
  );
  expect(isAlive(VIDZEE, { status: 200, body: "<html>generic shell</html>" })).toBe(false);
  expect(isAlive(VIDZEE, { status: 500, body: "Internal Server Error" })).toBe(false);
});

test("VidFast counts as alive on 200, dead otherwise", () => {
  expect(isAlive(VIDFAST, { status: 200, body: "<html>" })).toBe(true);
  expect(isAlive(VIDFAST, { status: 403, body: "" })).toBe(false);
  expect(isAlive(VIDFAST, { status: 500, body: "" })).toBe(false);
});

test("output keeps one entry per origin and skips bad entries", () => {
  const at = "2026-11-21T00:00:00Z";
  const vidsrc = { name: "vidsrc.sh", baseUrl: "https://vidsrc.sh" };
  expect(buildProvidersJson(["https://vidsrc.sh", "https://vidsrc.sh/"], at)).toEqual({
    updatedAt: at,
    providers: [vidsrc],
  });
  expect(buildProvidersJson(["https://vidsrc.sh", "not a url"], at)).toEqual({
    updatedAt: at,
    providers: [vidsrc],
  });
});

test("empty probe results build an empty list (refresh refuses to write it)", () => {
  expect(buildProvidersJson([], "2026-11-22T00:00:00Z")).toEqual({
    updatedAt: "2026-11-22T00:00:00Z",
    providers: [],
  });
});
