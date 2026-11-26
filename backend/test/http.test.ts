import { assert, describe, it } from "@effect/vitest";
import { assertInstanceOf } from "@effect/vitest/utils";
import { Effect, Schema } from "effect";
import { createServer } from "node:http";
import type { IncomingHttpHeaders } from "node:http";
import { USER_AGENT } from "../../src/consts";
import { Http, HttpError } from "../src/http";

const Answer = Schema.Struct({ id: Schema.String });

interface Responder {
  json(body: unknown): void;
  fail(status: number): void;
}

// The test holds the server open with acquireRelease; a random port keeps
// parallel test runs apart.
const startServer = (
  handler: (url: string | undefined, respond: Responder, headers: IncomingHttpHeaders) => void,
) =>
  Effect.acquireRelease(
    Effect.promise(async () => {
      const server = createServer((request, response) =>
        handler(
          request.url,
          {
            json: (body) => {
              response.setHeader("content-type", "application/json");
              response.end(JSON.stringify(body));
            },
            fail: (status) => {
              response.statusCode = status;
              response.end();
            },
          },
          request.headers,
        ),
      );
      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve());
      });
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("test server did not report a port");
      }
      return { server, baseUrl: `http://127.0.0.1:${address.port}` };
    }),
    ({ server }) =>
      Effect.promise(
        () =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
  );

describe("Http", () => {
  it.effect("the fetch layer reads and decodes JSON from a server", () =>
    Effect.gen(function* () {
      const { baseUrl } = yield* startServer((url, respond) => {
        if (url === "/titles/tt0133093") {
          respond.json({ id: "tt0133093" });
        } else {
          respond.fail(404);
        }
      });
      const http = yield* Http;
      const title = yield* http.getJson(`${baseUrl}/titles/tt0133093`, Answer);
      assert.strictEqual(title.id, "tt0133093");
    }).pipe(Effect.provide(Http.fetchLayer)),
  );

  it.effect("the fetch layer sends the caller's headers", () => {
    let seen: string | undefined;
    return Effect.gen(function* () {
      const { baseUrl } = yield* startServer((_url, respond, headers) => {
        seen = headers["user-agent"];
        respond.json({});
      });
      const http = yield* Http;
      yield* http.getText(`${baseUrl}/identify`, { "User-Agent": USER_AGENT });
      assert.strictEqual(seen, USER_AGENT);
    }).pipe(Effect.provide(Http.fetchLayer));
  });

  it.effect("the fetch layer reports the status of a failed response", () =>
    Effect.gen(function* () {
      const { baseUrl } = yield* startServer((_url, respond) => respond.fail(404));
      const http = yield* Http;
      const error = yield* http.getText(`${baseUrl}/missing`).pipe(Effect.flip);
      assertInstanceOf(error, HttpError);
      assert.strictEqual(error.status, 404);
      assert.strictEqual(error.url, `${baseUrl}/missing`);
    }).pipe(Effect.provide(Http.fetchLayer)),
  );
});
