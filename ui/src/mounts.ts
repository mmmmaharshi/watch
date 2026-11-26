import { Effect, Queue, Stream } from "effect";
import { Mount } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { WatchMessage } from "./messages";

// Focuses the search field after the dialog closes and on an empty submit.
export const SearchField = Html.ref("SearchField", "input");

// Reads the field once, when the input mounts. A paste that lands before
// hydration is adopted instead of wiped, and the mount reports the touch
// capability once, so the update can leave the keyboard closed on a phone.
export const ReadSearchField = Mount.make(
  "watch/ReadSearchField",
  { args: {} },
  (input: HTMLInputElement) =>
    Effect.sync(() =>
      WatchMessage.MountedSearch({
        fieldText: input.value ?? "",
        hash: location.hash,
        search: location.search,
        isTouch: navigator.maxTouchPoints > 0,
      }),
    ),
);

const toHashNavigation =
  <E>(queue: Queue.Queue<WatchMessage, E>) =>
  () => {
    Queue.offerUnsafe(
      queue,
      WatchMessage.NavigatedToHash({ hash: location.hash, search: location.search }),
    );
  };

// Help links change only the hash, which never reloads the page. A
// same-document history change arrives as popstate. Both become one fact; the
// update decides whether it prefills the field or closes an open dialog.
export const TrackHash = Mount.makeStream("watch/TrackHash", { args: {} }, (_node: HTMLElement) =>
  Stream.callback<WatchMessage>((queue) =>
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
);
