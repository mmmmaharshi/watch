import { Effect, Queue, Schema, Stream } from "effect";
import { Subscription } from "foldkit";
import type { Model } from "./model";
import { Message } from "./messages";

const toHashNavigation =
  <E>(queue: Queue.Queue<Message, E>) =>
  () => {
    Queue.offerUnsafe(
      queue,
      Message.NavigatedToHash({ hash: location.hash, search: location.search }),
    );
  };

// Help links change only the hash, which never reloads the page. A
// same-document history change arrives as popstate. Both become one fact; the
// update decides whether it prefills the field or closes an open dialog.
export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  hashChanges: entry(
    { href: Schema.String },
    {
      modelToDependencies: () => ({ href: "" }),
      dependenciesToStream: () =>
        Stream.callback<Message>((queue) =>
          Effect.gen(function* () {
            const handler = toHashNavigation(queue);
            yield* Effect.acquireRelease(
              Effect.sync(() => {
                window.addEventListener("hashchange", handler);
                window.addEventListener("popstate", handler);
              }),
              () =>
                Effect.sync(() => {
                  window.removeEventListener("hashchange", handler);
                  window.removeEventListener("popstate", handler);
                }),
            );
            return yield* Effect.never;
          }),
        ),
    },
  ),
}));
