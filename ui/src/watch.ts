import { Component, Head } from "@effect/ui";
import type { View } from "@effect/ui";
import { Html, HtmlCommand, HtmlHead } from "@effect/ui/html";
import { fullLinkForId, imdbUrl, parseSharedId } from "../../src/lib/parse-input";
import {
  AdvanceLookup,
  AwaitLookupSettle,
  ClearHistoryHash,
  CopyShareLink,
  DismissNotice,
  OpenStream,
  WriteHistoryHash,
} from "./commands";
import { COPY } from "./copy";
import { busy, resultMeta, resultTitle, resultType } from "./lookup";
import type { LookupEvent, LookupState, Result } from "./lookup";
import { WatchMessage } from "./messages";
import { WatchModel, WatchProps, initModel } from "./model";
import { ReadSearchField, SearchField, TrackHash } from "./mounts";

// The search field's DOM contract: the view writes these, and the mount and
// the focus command read them.
export const SEARCH_FIELD_ID = "search-field";
export const SEARCH_FIELD_NAME = "id";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const FIELD_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ink";
const DISABLED = "disabled:cursor-not-allowed disabled:opacity-50";
const ICON_BUTTON = `flex size-12 items-center justify-center rounded-lg border border-line bg-fill hover:bg-fill-hover sm:size-10 ${FOCUS_RING} ${DISABLED}`;

const focusSearch = () => HtmlCommand.focus(SearchField, () => Component.noop);

function Spinner(h: H) {
  return h.span
    .attr("aria-hidden", "true")
    .class(
      "size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none",
    );
}

function RefreshGlyph(h: H) {
  return h.span.attr("aria-hidden", "true").class("text-lg leading-none").children("↻");
}

function CopyGlyph(h: H) {
  return h.span.attr("aria-hidden", "true").class("text-lg leading-none").children("⧉");
}

function Row<C extends View.Children<WatchMessage>>(h: H, label: string, children: C) {
  return h.div
    .class("flex flex-col gap-1 py-3.5 sm:flex-row sm:gap-6")
    .children(
      h.span.class("text-sm font-medium text-ink-2 sm:w-28 sm:shrink-0").children(label),
      h.span.class("min-w-0 flex-1 text-sm tabular-nums").children(children),
    );
}

function Separator(h: H) {
  return h.hr.class("h-px rounded-sm border-0 bg-line");
}

function inputAttrs(invalid: boolean, describedBy: string) {
  const attrs = {
    id: SEARCH_FIELD_ID,
    name: SEARCH_FIELD_NAME,
    autocomplete: "off",
    autocorrect: "off",
    autocapitalize: "none",
    spellcheck: "false",
    enterkeyhint: "go",
    placeholder: COPY.placeholder,
    "aria-describedby": describedBy,
  };
  if (invalid) {
    return { ...attrs, "aria-invalid": "true", "data-invalid": "" };
  }
  return attrs;
}

const WatchDef = Html.component({
  name: "Watch",
  props: WatchProps,
  model: WatchModel,
  message: WatchMessage,
});

type H = Component.Helper<typeof WatchDef>;

const resultDialog = WatchDef.fragment((h, model: WatchModel, result: Result | null) => {
  const retrying = model.lookup.phase === "retrying";
  const title = result === null ? "" : resultTitle(result);
  const meta = result === null ? "" : resultMeta(result);
  const disabled = retrying || busy(model.lookup.phase) || model.generation > model.applied;
  const dialogOpen = model.lookup.openId !== null && result !== null;

  const link = (href: string, text: string, extra: string) => {
    const anchored = h.a.attrs({ href, target: "_blank", rel: "noopener" });
    const focusable = disabled ? anchored.attr("tabindex", "-1") : anchored;
    return focusable
      .class(
        `font-mono underline underline-offset-2 ${extra} ${disabled ? "pointer-events-none" : ""}`,
      )
      .children(text);
  };

  // A native modal dialog: the Model decides when it opens, the host turns
  // blunt close requests such as Escape into cancel events, and the browser
  // owns the scrim and the page's inert state.
  const frame =
    result === null
      ? h.dialog.class("watch-dialog")
      : h.dialog.class("watch-dialog").attrs({
          "aria-label": title,
          "aria-describedby": "watch-meta",
        });
  return frame
    .modal(dialogOpen)
    .on("cancel", WatchMessage.RequestedCloseResult({ reason: "escape-key" }))
    .children(
      ...(result === null
        ? []
        : [
            h.div
              .class(
                "relative mx-auto my-8 max-h-[calc(100dvh-4rem)] w-[calc(100%-3rem)] max-w-[42rem] overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-6 shadow-[var(--overlay-shadow)]",
              )
              .children(
                h.div.class("flex flex-col gap-0").children(
                  h.div.children(
                    h.h2
                      .class("text-2xl font-semibold tracking-tight text-balance")
                      .children(title),
                    h.p
                      .attrs({ id: "watch-meta" })
                      .class("mt-1 text-sm text-ink-2 tabular-nums")
                      .children(meta),
                  ),
                  h.div.class("mt-4").children(
                    ...(result.description
                      ? [
                          h.p
                            .class("text-base leading-relaxed text-ink-2 text-pretty")
                            .children(result.description),
                        ]
                      : []),
                    h.p
                      .class("mt-4 text-sm font-medium text-ink-2")
                      .children(resultType(result.type)),
                    h.div
                      .class("mt-5 border-t border-line")
                      .children(
                        Row(h, COPY.imdb, [link(imdbUrl(result.id), result.id, "")]),
                        Separator(h),
                        Row(h, COPY.provider, [result.provider]),
                        Separator(h),
                        Row(h, COPY.streamUrl, [link(result.url, result.url, "break-all")]),
                      ),
                    ...(model.lookup.status.kind === "idle"
                      ? []
                      : [
                          h.p
                            .attr("role", "status")
                            .attr("aria-live", "polite")
                            .class(
                              `mt-4 text-sm leading-relaxed ${
                                model.lookup.status.kind === "error"
                                  ? "font-medium text-ink"
                                  : "text-ink-2"
                              }`,
                            )
                            .children(model.lookup.status.text),
                        ]),
                  ),
                  h.div
                    .class(
                      "mt-5 flex flex-col gap-4 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between",
                    )
                    .children(
                      h.p
                        .class("text-sm leading-relaxed text-ink-2 text-pretty")
                        .children(
                          "You'll leave this site and play on ",
                          h.strong.class("font-medium text-ink").children(result.provider),
                          ". We don't control external sites.",
                        ),
                      h.div.class("flex shrink-0 flex-wrap justify-end gap-2").children(
                        h.button
                          .attrs({ type: "button" })
                          .on("click", WatchMessage.RequestedCloseResult({ reason: "close-press" }))
                          .disabled(disabled)
                          .class(
                            `min-h-12 rounded-lg bg-fill hover:bg-fill-hover px-4 text-sm font-medium sm:min-h-10 ${FOCUS_RING} ${DISABLED}`,
                          )
                          .children(COPY.cancel),
                        h.button
                          .attrs({ type: "button" })
                          .attr("aria-label", COPY.retry)
                          .on("click", WatchMessage.ClickedRetry())
                          .disabled(disabled)
                          .class(ICON_BUTTON)
                          .children(retrying ? Spinner(h) : RefreshGlyph(h)),
                        h.button
                          .attrs({ type: "button" })
                          .attr("aria-label", COPY.copy)
                          .on("click", WatchMessage.ClickedCopy())
                          .disabled(disabled)
                          .class(ICON_BUTTON)
                          .children(CopyGlyph(h)),
                        h.button
                          .attrs({ type: "button", id: "watch-result" })
                          .on("click", WatchMessage.ClickedWatch())
                          .disabled(disabled)
                          .class(
                            `min-h-12 rounded-lg bg-action px-5 text-sm font-medium text-canvas hover:bg-action-hover sm:min-h-10 ${FOCUS_RING} ${DISABLED}`,
                          )
                          .children(COPY.watch),
                      ),
                      ...(model.notice === null
                        ? []
                        : [
                            h.p
                              .attr("role", "status")
                              .attr("aria-live", "polite")
                              .class(
                                "fixed bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-surface px-4 py-3 text-sm shadow-[var(--overlay-shadow)]",
                              )
                              .children(model.notice),
                          ]),
                    ),
                ),
              ),
          ]),
    );
});

export const WatchNoDeps = WatchDef.make({
  init: () => initModel(),
  update: ($, message) => {
    const advance = (event: LookupEvent) => {
      const generation = $.model.generation + 1;
      return $.evolve({ generation }).run(AdvanceLookup.make({ generation, event }));
    };

    // A successful lookup is the only thing that opens the dialog. The same
    // snapshot also writes the shareable hash, once, from the update.
    const applySnapshot = (generation: number, snapshot: LookupState) => {
      if (generation < $.model.generation) {
        return $.model;
      }
      const previous = $.model.lookup.openId;
      let next: Component.Step<WatchModel, WatchMessage, never, AdvanceLookup | AwaitLookupSettle> =
        $.evolve({
          lookup: snapshot,
          applied: generation,
        });
      if (snapshot.phase !== "idle") {
        next = next.run(AwaitLookupSettle.make({ generation }));
      }
      if (previous === null && snapshot.openId !== null) {
        next = next.run(WriteHistoryHash.make({ id: snapshot.openId }));
      } else if (previous !== null && snapshot.openId === null) {
        next = next.run(ClearHistoryHash.make({}));
        if ($.model.canAutoFocus) {
          next = next.run(focusSearch());
        }
      }
      // An empty submit is a field error, and the field takes the cursor back.
      if (snapshot.status.kind === "field") {
        next = next.run(focusSearch());
      }
      return next;
    };

    const isPending = () => $.model.lookup.phase !== "idle" || $.model.generation > $.model.applied;

    return WatchMessage.match(message, {
      MountedSearch: ({ fieldText, hash, search, isTouch }) => {
        const canAutoFocus = !isTouch;
        if (fieldText !== "") {
          // A paste that landed before hydration wins over everything: never
          // wipe what the person already typed.
          return $.evolve({ canAutoFocus, query: fieldText });
        }
        const sharedId = parseSharedId(search, hash);
        if (sharedId !== null) {
          const link = fullLinkForId(sharedId, $.model.lookup.kind) ?? sharedId;
          const generation = $.model.generation + 1;
          return $.evolve({ canAutoFocus, query: link, generation }).run(
            AdvanceLookup.make({ generation, event: { type: "hashNav", id: sharedId } }),
          );
        }
        const applied = $.evolve({ canAutoFocus, query: "" });
        return canAutoFocus ? applied.run(focusSearch()) : applied;
      },

      UpdatedQuery: ({ value }) =>
        $.evolve({
          query: value,
          lookup: { ...$.model.lookup, status: { kind: "idle" } },
        }),

      SubmittedSearch: () =>
        isPending() ? $.model : advance({ type: "submit", input: $.model.query }),

      ClickedRetry: () => (isPending() ? $.model : advance({ type: "retry" })),

      NavigatedToHash: ({ hash, search }) => {
        const id = parseSharedId(search, hash);
        if (id === null) {
          return $.model.lookup.openId === null ? $.model : advance({ type: "close" });
        }
        if (id === $.model.lookup.openId) {
          return $.model;
        }
        if ($.model.lookup.result?.id === id) {
          return advance({ type: "hashNav", id });
        }
        const link = fullLinkForId(id, $.model.lookup.kind) ?? id;
        if ($.model.query === link) {
          return $.model;
        }
        const generation = $.model.generation + 1;
        return $.evolve({
          generation,
          query: link,
        }).run(AdvanceLookup.make({ generation, event: { type: "hashNav", id } }));
      },

      CompletedAdvanceLookup: ({ generation, snapshot }) => applySnapshot(generation, snapshot),

      CompletedAwaitLookupSettle: ({ generation, snapshot }) => applySnapshot(generation, snapshot),

      RequestedCloseResult: ({ reason }) => {
        if (reason !== "escape-key" && reason !== "close-press") {
          return $.model;
        }
        if ($.model.lookup.phase !== "idle") {
          return $.model;
        }
        return advance({ type: "close" });
      },

      ClickedCopy: () => {
        const result = $.model.lookup.result;
        return result === null ? $.model : $.run(CopyShareLink.make({ id: result.id }));
      },

      SucceededCopyShareLink: () => $.evolve({ notice: COPY.copied }).run(DismissNotice.make({})),

      FailedCopyShareLink: ({ message }) =>
        $.evolve({
          lookup: { ...$.model.lookup, status: { kind: "error", text: message } },
        }),

      ClickedWatch: () => {
        const result = $.model.lookup.result;
        if (result === null) {
          return $.model;
        }
        const generation = $.model.generation + 1;
        return $.evolve({ generation, notice: null }).run(
          AdvanceLookup.make({ generation, event: { type: "close" } }),
          OpenStream.make({ url: result.url }),
        );
      },

      CompletedDismissNotice: () => $.evolve({ notice: null }),
    });
  },
  view: (h, model) => {
    const loading = busy(model.lookup.phase) || model.generation > model.applied;
    const invalid = model.lookup.status.kind === "field";
    const statusText = model.lookup.status.kind === "idle" ? "" : model.lookup.status.text;
    const strong = model.lookup.status.kind === "error" || model.lookup.status.kind === "field";
    const describedBy = invalid ? "status search-hint" : "search-hint";

    return h.main
      .onMount(TrackHash({}))
      .class("mx-auto flex min-h-dvh w-full max-w-[42rem] flex-col py-14 sm:py-20")
      .children(
        h.div.class("w-full sm:my-auto").children(
          h.header
            .class("w-full border-b border-line pb-6")
            .children(
              h.h1.class("text-2xl font-semibold tracking-tight").children(COPY.wordmark),
              h.p.class("mt-1 text-sm text-ink-2").children(COPY.intro),
            ),
          h.div.class("w-full").children(
            h.search.children(
              h.form
                .class("mt-8 flex flex-col gap-3 sm:flex-row")
                .on("submit", WatchMessage.SubmittedSearch())
                .children(
                  h.div.class("min-w-0 flex-1").children(
                    h.label.class("sr-only").attr("for", SEARCH_FIELD_ID).children(COPY.fieldLabel),
                    h.input
                      .ref(SearchField)
                      .attrs(inputAttrs(invalid, describedBy))
                      .value(model.query)
                      .disabled(loading)
                      .class(
                        `h-12 w-full rounded-lg border border-line bg-canvas px-3 text-base ${FIELD_RING} data-[invalid]:border-[oklch(0.72_0.19_25)] data-[disabled]:opacity-50`,
                      )
                      .on("input", ({ value }) => WatchMessage.UpdatedQuery({ value }))
                      .onMount(ReadSearchField({})),
                  ),
                  h.button
                    .attrs({ type: "submit" })
                    .disabled(loading)
                    .class(
                      `flex min-h-12 items-center justify-center gap-2 rounded-lg bg-action px-6 text-sm font-medium text-canvas hover:bg-action-hover ${FOCUS_RING} ${DISABLED}`,
                    )
                    .children(...(loading ? [Spinner(h)] : []), COPY.submit),
                ),
            ),
            h.p
              .attrs({ id: "search-hint" })
              .class("mt-3 text-xs leading-relaxed text-ink-2")
              .children(COPY.hint),
            h.p
              .attrs({ id: "status", role: "status", "aria-live": "polite" })
              .class(
                "mt-1 min-h-[1.625em] text-sm leading-relaxed " +
                  (strong ? "font-medium text-ink" : "text-ink-2"),
              )
              .children(statusText),
          ),
        ),
        h.footer
          .class("mt-auto w-full border-t border-line pt-5 sm:mt-14")
          .children(h.p.class("text-xs leading-relaxed text-ink-2").children(COPY.footer)),
        resultDialog(h, model, model.lookup.result),
      );
  },
  head: () => [Head.title(COPY.title), HtmlHead.lang("en")],
});
