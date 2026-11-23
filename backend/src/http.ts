import { Context, Effect, Layer, Schema } from "effect";

export class HttpError extends Schema.TaggedError<HttpError>()("HttpError", {
  url: Schema.String,
  status: Schema.optional(Schema.Int),
}) {}

export interface HttpShape {
  readonly getText: (url: string) => Effect.Effect<string, HttpError>;
  readonly getJson: <A>(
    url: string,
    schema: Schema.ConstraintDecoder<A>,
  ) => Effect.Effect<A, HttpError>;
}

const make = (getText: HttpShape["getText"]): HttpShape => ({
  getText,
  // Bodies are untrusted, so the caller's Schema validates them.
  getJson: <A>(url: string, schema: Schema.ConstraintDecoder<A>) =>
    getText(url).pipe(
      Effect.flatMap((text) =>
        Effect.try({
          try: () => Schema.decodeUnknownSync(schema)(JSON.parse(text) as unknown),
          catch: () => new HttpError({ url }),
        }),
      ),
    ),
});

export class Http extends Context.Service<Http, HttpShape>()("watch/backend/Http") {
  static readonly stubLayer = (getText: HttpShape["getText"]): Layer.Layer<Http> =>
    Layer.succeed(Http, make(getText));

  static readonly fetchLayer = Layer.succeed(
    Http,
    make((url) =>
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
          try: () => fetch(url),
          catch: () => new HttpError({ url }),
        });
        if (!response.ok) {
          return yield* new HttpError({ url, status: response.status });
        }
        return yield* Effect.tryPromise({
          try: () => response.text(),
          catch: () => new HttpError({ url, status: response.status }),
        });
      }),
    ),
  );
}
