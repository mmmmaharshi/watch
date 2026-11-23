import { assert, describe, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import type { ProvidersFile } from "../src/providers";
import { DIRECTORY_URL, VIDFAST, VIDLINK, VIDZEE, buildEmbedUrl } from "../src/providers";
import { ROT_ALARM_MS } from "../../src/lib/provider-probes";
import { runRefresh } from "../src/refresh";
import type { ProbeResponse, RefreshDeps } from "../src/refresh";

const PROBE_ID = "tt0133093";
const BOGUS_ID = "tt0000000";

const directoryPage = (domains: ReadonlyArray<string>) =>
  `<section id="domains">${domains
    .map((domain) => `<button data-val="${domain}">copy</button>`)
    .join("")}</section>`;

const wiredEmbed = '<iframe data-api="/vs_src.php?type=movie&id=tt0133093"></iframe>';
const signedSrc = '{"src":"https://cdn.test/embed?vs=token"}';
const vidLinkPlayer = "<html>tmdb vidlink player</html>";
const vidZeePlayer = "<html>tmdb vidzee player</html>";

const vidsrcRoutes = (origin: string): Array<[string, ProbeResponse]> => [
  [
    buildEmbedUrl({ name: new URL(origin).host, baseUrl: origin }, "movie", PROBE_ID),
    {
      status: 200,
      body: wiredEmbed,
    },
  ],
  [`${origin}/vs_src.php?type=movie&id=${PROBE_ID}`, { status: 200, body: signedSrc }],
];

const hiredRoutes = (): Array<[string, ProbeResponse]> => [
  [buildEmbedUrl(VIDLINK, "movie", PROBE_ID), { status: 200, body: vidLinkPlayer }],
  [buildEmbedUrl(VIDLINK, "movie", BOGUS_ID), { status: 500, body: "Internal Server Error" }],
  [buildEmbedUrl(VIDZEE, "movie", PROBE_ID), { status: 200, body: vidZeePlayer }],
  [buildEmbedUrl(VIDFAST, "movie", PROBE_ID), { status: 200, body: "<html>vidfast</html>" }],
];

interface Harness {
  readonly saved: Array<ProvidersFile>;
  readonly probed: Array<string>;
  readonly deps: RefreshDeps;
}

const harness = (
  routes: ReadonlyArray<[string, ProbeResponse]>,
  current: Option.Option<ProvidersFile>,
  saveIsBroken = false,
): Harness => {
  const table = new Map(routes);
  const saved: Array<ProvidersFile> = [];
  const probed: Array<string> = [];
  return {
    saved,
    probed,
    deps: {
      probe: (url) => {
        probed.push(url);
        const route = table.get(url);
        return route === undefined
          ? Effect.fail(new Error(`no route for ${url}`))
          : Effect.succeed(route);
      },
      current: Effect.succeed(current),
      save: (file) => {
        if (saveIsBroken) {
          return Effect.fail(new Error("binding down"));
        }
        saved.push(file);
        return Effect.void;
      },
    },
  };
};

const stored = (updatedAt: number): ProvidersFile => ({
  updatedAt: new Date(updatedAt).toISOString(),
  providers: [{ name: "kept.test", baseUrl: "https://kept.test" }],
});

describe("provider refresh", () => {
  it.effect("probes the directory and stores the hosts that answer", () =>
    Effect.gen(function* () {
      const h = harness(
        [
          [DIRECTORY_URL, { status: 200, body: directoryPage(["https://a.test"]) }],
          ...vidsrcRoutes("https://a.test"),
          ...hiredRoutes(),
        ],
        Option.none(),
      );

      const outcome = yield* runRefresh(h.deps);

      assert.strictEqual(outcome.written, true);
      assert.strictEqual(outcome.providers, 4);
      assert.deepStrictEqual(outcome.skipped, []);
      assert.deepStrictEqual(h.saved, [
        {
          updatedAt: "1970-01-01T00:00:00.000Z",
          providers: [
            { name: "a.test", baseUrl: "https://a.test" },
            { name: "vidlink.pro", baseUrl: VIDLINK.baseUrl },
            { name: "player.vidzee.wtf", baseUrl: VIDZEE.baseUrl },
            { name: "vidfast.vc", baseUrl: VIDFAST.baseUrl },
          ],
        },
      ]);
    }),
  );

  it.effect("skips a host whose embed has no player wiring", () =>
    Effect.gen(function* () {
      const h = harness(
        [
          [DIRECTORY_URL, { status: 200, body: directoryPage(["https://dead.test"]) }],
          [
            buildEmbedUrl({ name: "dead.test", baseUrl: "https://dead.test" }, "movie", PROBE_ID),
            { status: 200, body: "<html>no player</html>" },
          ],
          ...hiredRoutes(),
        ],
        Option.none(),
      );

      const outcome = yield* runRefresh(h.deps);

      assert.deepStrictEqual(outcome.skipped, ["https://dead.test"]);
      assert.deepStrictEqual(
        h.saved[0]?.providers.map((entry) => entry.baseUrl),
        [VIDLINK.baseUrl, VIDZEE.baseUrl, VIDFAST.baseUrl],
      );
    }),
  );

  it.effect("keeps the stored list when the directory is unreachable and the list is fresh", () =>
    Effect.gen(function* () {
      const h = harness([], Option.some(stored(-1000)));

      const outcome = yield* runRefresh(h.deps);

      assert.strictEqual(outcome.written, false);
      assert.strictEqual(outcome.providers, 1);
      assert.deepStrictEqual(h.saved, []);
    }),
  );

  it.effect("fails when the directory is unreachable and the stored list has rotted", () =>
    Effect.gen(function* () {
      const h = harness([], Option.some(stored(-ROT_ALARM_MS - 1)));

      const failure = yield* runRefresh(h.deps).pipe(Effect.flip);

      assert.strictEqual(failure.reason, "directory_unreachable_and_stale");
      assert.deepStrictEqual(h.saved, []);
    }),
  );

  it.effect("fails when no candidate passes, and stores nothing", () =>
    Effect.gen(function* () {
      const h = harness(
        [[DIRECTORY_URL, { status: 200, body: directoryPage(["https://a.test"]) }]],
        Option.none(),
      );

      const failure = yield* runRefresh(h.deps).pipe(Effect.flip);

      assert.strictEqual(failure.reason, "no_providers");
      assert.deepStrictEqual(h.saved, []);
    }),
  );

  it.effect("a failed write fails the run instead of reporting success", () =>
    Effect.gen(function* () {
      const h = harness(
        [
          [DIRECTORY_URL, { status: 200, body: directoryPage(["https://a.test"]) }],
          ...vidsrcRoutes("https://a.test"),
          ...hiredRoutes(),
        ],
        Option.none(),
        true,
      );

      const failure = yield* runRefresh(h.deps).pipe(Effect.flip);

      assert.strictEqual(failure.reason, "write_failed");
    }),
  );
});
