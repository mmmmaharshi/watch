import { assert, describe, it } from "@effect/vitest";
import { Clock, Deferred, Effect, Layer, Option, Ref, Schema } from "effect";
import { Cache } from "../src/cache";
import { Http, HttpError } from "../src/http";
import type { HttpShape } from "../src/http";
import { ProviderList } from "../src/provider-list";
import {
  DIRECTORY_URL,
  VIDFAST,
  VIDLINK,
  VIDZEE,
  buildEmbedUrl,
  parseActiveDomains,
} from "../../src/lib/providers";
import type { Provider, ProvidersFile } from "../../src/lib/providers";
import { PROVIDERS_STALE_MS, Providers } from "../src/providers";
import type { ProvidersShape } from "../src/providers";
import type { ContentType } from "../../src/lib/types";

const FILE_URL = "https://file.test/providers.json";
const embeds = (base: string, type: ContentType = "movie", id = "tt1") =>
  `${base}/embed/${type}/${id}`;
const probeUrl = (provider: Provider, type: ContentType = "movie", id = "tt1") =>
  buildEmbedUrl(provider, type, id);
const valueTag = (url: string) => `<button data-val="${url}">copy</button>`;
const directoryPage = (domains: ReadonlyArray<string>) =>
  `<section id="domains">${domains.map(valueTag).join("")}</section>`;
const refreshFile = (domains: ReadonlyArray<string>, updatedAt: number) =>
  JSON.stringify({
    updatedAt: new Date(updatedAt).toISOString(),
    providers: domains.map((baseUrl) => ({ name: new URL(baseUrl).host, baseUrl })),
  });
const storedFile = (domains: ReadonlyArray<string>, updatedAt: number): ProvidersFile => ({
  updatedAt: new Date(updatedAt).toISOString(),
  providers: domains.map((baseUrl) => ({ name: new URL(baseUrl).host, baseUrl })),
});

const providersLayer = (
  getText: HttpShape["getText"],
  stored: Option.Option<ProvidersFile> = Option.none(),
) =>
  Providers.layer(FILE_URL).pipe(
    Layer.provide(Http.stubLayer(getText)),
    Layer.provide(Cache.layer(10)),
    Layer.provide(
      Layer.succeed(
        ProviderList,
        ProviderList.of({ load: Effect.succeed(stored), save: () => Effect.void }),
      ),
    ),
  );

const withProviders = <A>(
  getText: HttpShape["getText"],
  body: (providers: ProvidersShape) => Effect.Effect<A>,
  stored: Option.Option<ProvidersFile> = Option.none(),
) =>
  Effect.gen(function* () {
    const providers = yield* Providers;
    return yield* body(providers);
  }).pipe(Effect.provide(providersLayer(getText, stored)));

const makeHarness = Effect.gen(function* () {
  const requests = yield* Ref.make<Array<string>>([]);
  const routes = new Map<string, string>();
  const getText: HttpShape["getText"] = (url) =>
    Ref.update(requests, (list) => [...list, url]).pipe(
      Effect.flatMap(() => {
        const body = routes.get(url);
        return body !== undefined
          ? Effect.succeed(body)
          : Effect.fail(new HttpError({ url, status: 404 }));
      }),
    );
  return { routes, requests, getText };
});

const select = (providers: ProvidersShape) => providers.selectStream({ type: "movie", id: "tt1" });

describe("Providers", () => {
  it.effect("a fresh refresh file beats the directory", () =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const h = yield* makeHarness;
      h.routes.set(FILE_URL, refreshFile(["https://dir.test"], now));
      h.routes.set(embeds("https://dir.test"), "<html>");
      h.routes.set(DIRECTORY_URL, directoryPage(["https://live.test"]));
      h.routes.set(embeds("https://live.test"), "<html>");

      const stream = Option.getOrThrow(yield* withProviders(h.getText, select));

      assert.strictEqual(stream.provider, "dir.test");
      assert.strictEqual(stream.url, embeds("https://dir.test"));
      assert.ok(!(yield* Ref.get(h.requests)).includes(DIRECTORY_URL));
    }),
  );

  it.effect("a stale refresh file yields to the live directory", () =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const h = yield* makeHarness;
      h.routes.set(FILE_URL, refreshFile(["https://stale.test"], now - PROVIDERS_STALE_MS - 1));
      h.routes.set(DIRECTORY_URL, directoryPage(["https://live.test"]));
      h.routes.set(embeds("https://live.test"), "<html>");
      h.routes.set(embeds("https://stale.test"), "<html>");

      const stream = Option.getOrThrow(yield* withProviders(h.getText, select));

      assert.strictEqual(stream.provider, "live.test");
      const requested = yield* Ref.get(h.requests);
      assert.ok(requested.includes(DIRECTORY_URL));
      assert.ok(!requested.includes(embeds("https://stale.test")));
    }),
  );

  it.effect("a stale refresh file answers when the directory is down", () =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const h = yield* makeHarness;
      h.routes.set(FILE_URL, refreshFile(["https://stale.test"], now - PROVIDERS_STALE_MS - 1));
      h.routes.set(embeds("https://stale.test"), "<html>");

      const stream = Option.getOrThrow(yield* withProviders(h.getText, select));

      assert.strictEqual(stream.provider, "stale.test");
      assert.ok((yield* Ref.get(h.requests)).includes(DIRECTORY_URL));
    }),
  );

  it.effect("a missing refresh file uses the live directory", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness;
      h.routes.set(DIRECTORY_URL, directoryPage(["https://live.test"]));
      h.routes.set(embeds("https://live.test"), "<html>");

      const stream = Option.getOrThrow(yield* withProviders(h.getText, select));

      assert.strictEqual(stream.provider, "live.test");
    }),
  );

  it.effect("a stored provider list answers before the legacy file", () =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const h = yield* makeHarness;
      h.routes.set(embeds("https://stored.test"), "<html>");

      const stream = Option.getOrThrow(
        yield* withProviders(
          h.getText,
          select,
          Option.some(storedFile(["https://stored.test"], now)),
        ),
      );

      assert.strictEqual(stream.provider, "stored.test");
      assert.ok(!(yield* Ref.get(h.requests)).includes(FILE_URL));
    }),
  );

  it.effect("a stale stored list yields to the live directory", () =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const h = yield* makeHarness;
      h.routes.set(DIRECTORY_URL, directoryPage(["https://live.test"]));
      h.routes.set(embeds("https://live.test"), "<html>");
      h.routes.set(embeds("https://stored.test"), "<html>");

      const stream = Option.getOrThrow(
        yield* withProviders(
          h.getText,
          select,
          Option.some(storedFile(["https://stored.test"], now - PROVIDERS_STALE_MS - 1)),
        ),
      );

      assert.strictEqual(stream.provider, "live.test");
      assert.ok(!(yield* Ref.get(h.requests)).includes(embeds("https://stored.test")));
    }),
  );

  it.effect("a stale stored list answers when the directory is down", () =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const h = yield* makeHarness;
      h.routes.set(embeds("https://stored.test"), "<html>");

      const stream = Option.getOrThrow(
        yield* withProviders(
          h.getText,
          select,
          Option.some(storedFile(["https://stored.test"], now - PROVIDERS_STALE_MS - 1)),
        ),
      );

      assert.strictEqual(stream.provider, "stored.test");
      assert.ok((yield* Ref.get(h.requests)).includes(DIRECTORY_URL));
    }),
  );

  it.effect("a directory domain wins before the static providers", () =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const h = yield* makeHarness;
      h.routes.set(FILE_URL, refreshFile(["https://dir.test"], now));
      h.routes.set(embeds("https://dir.test"), "<html>");
      h.routes.set(probeUrl(VIDLINK), "<html>");

      const stream = Option.getOrThrow(yield* withProviders(h.getText, select));

      assert.strictEqual(stream.provider, "dir.test");
      assert.ok(!(yield* Ref.get(h.requests)).includes(probeUrl(VIDLINK)));
    }),
  );

  it.effect("the static providers answer when the directory has no live host", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness;
      h.routes.set(probeUrl(VIDLINK), "<html>");
      h.routes.set(probeUrl(VIDFAST), "<html>");

      const stream = Option.getOrThrow(yield* withProviders(h.getText, select));

      assert.strictEqual(stream.provider, "vidlink.pro");
      assert.ok(!(yield* Ref.get(h.requests)).includes(probeUrl(VIDFAST)));
    }),
  );

  it.effect("VidZee answers when VidLink fails", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness;
      h.routes.set(probeUrl(VIDZEE), "<html>");
      h.routes.set(probeUrl(VIDFAST), "<html>");

      const stream = Option.getOrThrow(yield* withProviders(h.getText, select));

      assert.strictEqual(stream.provider, "player.vidzee.wtf");
      assert.ok(!(yield* Ref.get(h.requests)).includes(probeUrl(VIDFAST)));
    }),
  );

  it.effect("VidFast answers when VidLink and VidZee fail", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness;
      h.routes.set(probeUrl(VIDFAST), "<html>");

      const stream = Option.getOrThrow(yield* withProviders(h.getText, select));

      assert.strictEqual(stream.provider, "vidfast.vc");
    }),
  );

  it.effect("a cached provider is probed before the directory on a repeat lookup", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness;
      h.routes.set(probeUrl(VIDLINK), "<html>");

      const program = Effect.gen(function* () {
        const providers = yield* Providers;
        const first = yield* select(providers);
        assert.strictEqual(Option.getOrThrow(first).provider, "vidlink.pro");

        const now = yield* Clock.currentTimeMillis;
        h.routes.set(FILE_URL, refreshFile(["https://dir.test"], now));
        h.routes.set(embeds("https://dir.test"), "<html>");
        return yield* select(providers);
      });

      const second = yield* program.pipe(Effect.provide(providersLayer(h.getText)));

      assert.strictEqual(Option.getOrThrow(second).provider, "vidlink.pro");
      assert.ok(!(yield* Ref.get(h.requests)).includes(embeds("https://dir.test")));
    }),
  );

  it.effect("an excluded provider never wins", () =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const h = yield* makeHarness;
      h.routes.set(FILE_URL, refreshFile(["https://a.test", "https://b.test"], now));
      h.routes.set(embeds("https://a.test"), "<html>");
      h.routes.set(embeds("https://b.test"), "<html>");

      const stream = Option.getOrThrow(
        yield* withProviders(h.getText, (providers) =>
          providers.selectStream({ type: "movie", id: "tt1", exclude: "a.test" }),
        ),
      );

      assert.strictEqual(stream.provider, "b.test");
      assert.ok(!(yield* Ref.get(h.requests)).includes(embeds("https://a.test")));
    }),
  );

  it.effect("an excluded provider that is the only candidate yields no stream", () =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const h = yield* makeHarness;
      h.routes.set(FILE_URL, refreshFile(["https://a.test"], now));
      h.routes.set(embeds("https://a.test"), "<html>");

      const stream = yield* withProviders(h.getText, (providers) =>
        providers.selectStream({ type: "movie", id: "tt1", exclude: "a.test" }),
      );

      assert.ok(Option.isNone(stream));
      assert.ok(!(yield* Ref.get(h.requests)).includes(embeds("https://a.test")));
    }),
  );

  it.effect("a winner interrupts the losing probes", () =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const started = yield* Deferred.make<void>();
      const interrupted = yield* Ref.make<Array<string>>([]);
      const getText: HttpShape["getText"] = (url) => {
        if (url === FILE_URL) {
          return Effect.succeed(refreshFile(["https://a.test", "https://b.test"], now));
        }
        if (url === embeds("https://b.test")) {
          return Deferred.succeed(started, undefined).pipe(
            Effect.andThen(
              Effect.onInterrupt(Effect.never, () =>
                Ref.update(interrupted, (list) => [...list, url]),
              ),
            ),
          );
        }
        if (url === embeds("https://a.test")) {
          // The winner waits until the loser runs, so the interruption is certain.
          return Deferred.await(started).pipe(Effect.andThen(Effect.succeed("<html>")));
        }
        return Effect.fail(new HttpError({ url, status: 404 }));
      };

      const stream = Option.getOrThrow(yield* withProviders(getText, select));

      assert.strictEqual(stream.provider, "a.test");
      assert.deepStrictEqual(yield* Ref.get(interrupted), [embeds("https://b.test")]);
    }),
  );
});

const Label = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(999));
const Type = Schema.Literals(["movie", "tv"]);

describe("Providers rules", () => {
  it.prop(
    "the domains section keeps https origins, dedupes, and drops the old and insecure rows",
    [Schema.Array(Label), Schema.Array(Label), Schema.Array(Label)],
    ([active, old, insecure]) => {
      const activeDomains = active.map((n) => `https://active${n}.test`);
      const oldDomains = old.map((n) => `https://old${n}.test`);
      const insecureDomains = insecure.map((n) => `http://insecure${n}.test`);
      const html =
        directoryPage([...activeDomains, ...insecureDomains, "not a url"]) +
        `<section id="old">${oldDomains.map(valueTag).join("")}</section>`;

      assert.deepStrictEqual(parseActiveDomains(html), [...new Set(activeDomains)]);
    },
  );

  it.prop("every parsed domain is an https origin", [Schema.String], ([raw]) => {
    const html = directoryPage([raw]);

    for (const domain of parseActiveDomains(html)) {
      assert.strictEqual(new URL(domain).protocol, "https:");
      assert.strictEqual(new URL(domain).origin, domain);
    }
  });

  it.prop("a provider without a path uses the embed shape", [Type, Schema.String], ([type, id]) => {
    assert.strictEqual(
      buildEmbedUrl({ name: "x", baseUrl: "https://x.test" }, type, id),
      `https://x.test/embed/${type}/${id}`,
    );
  });

  it.prop("a provider with a path keeps its base and path", [Type, Schema.String], ([type, id]) => {
    const provider = {
      name: "x",
      baseUrl: "https://x.test",
      path: (t: ContentType, i: string) => `/custom/${t}/${i}`,
    };

    assert.strictEqual(buildEmbedUrl(provider, type, id), `https://x.test/custom/${type}/${id}`);
  });
});
