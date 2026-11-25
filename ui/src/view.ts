import type { Document, Html, HtmlBuilder } from "foldkit/html";
import { Dialog, Input, Select } from "@foldkit/ui";
import { LANGUAGES } from "../../src/lib/languages";
import { imdbUrl } from "../../src/lib/parse-input";
import { COPY } from "./copy";
import { busy, resultMeta, resultTitle, resultType } from "./lookup";
import type { Candidate, Result } from "./lookup";
import { Message } from "./messages";
import type { Model } from "./model";
import { ReadSearchField } from "./mounts";

// The search field's DOM contract: the view writes these, and the mount, the
// entry script, and the focus command read them.
export const SEARCH_FIELD_ID = "search-field";
export const SEARCH_FIELD_NAME = "id";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black";
const FIELD_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-black";
const DISABLED = "disabled:cursor-not-allowed disabled:opacity-50";
const ICON_BUTTON = `flex size-12 items-center justify-center rounded-lg border border-black/10 bg-white sm:size-10 ${FOCUS_RING} ${DISABLED}`;

function Spinner({ h }: { h: HtmlBuilder<Message> }) {
  return h.span([
    h.AriaHidden(true),
    h.Class(
      "size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none",
    ),
  ]);
}

function RefreshIcon({ h }: { h: HtmlBuilder<Message> }) {
  return h.svg(
    [
      h.AriaHidden(true),
      h.Width("16"),
      h.Height("16"),
      h.Attribute("viewBox", "0 0 24 24"),
      h.Attribute("fill", "none"),
      h.Attribute("stroke", "currentColor"),
      h.Attribute("stroke-width", "2"),
      h.Attribute("stroke-linecap", "round"),
      h.Attribute("stroke-linejoin", "round"),
    ],
    [
      h.path([h.Attribute("d", "M21 12a9 9 0 1 1-3-6.7L21 8")]),
      h.path([h.Attribute("d", "M21 3v5h-5")]),
    ],
  );
}

function CopyIcon({ h }: { h: HtmlBuilder<Message> }) {
  return h.svg(
    [
      h.AriaHidden(true),
      h.Width("16"),
      h.Height("16"),
      h.Attribute("viewBox", "0 0 24 24"),
      h.Attribute("fill", "none"),
      h.Attribute("stroke", "currentColor"),
      h.Attribute("stroke-width", "2"),
      h.Attribute("stroke-linecap", "round"),
      h.Attribute("stroke-linejoin", "round"),
    ],
    [
      h.rect([
        h.Attribute("x", "9"),
        h.Attribute("y", "9"),
        h.Attribute("width", "13"),
        h.Attribute("height", "13"),
        h.Attribute("rx", "2"),
        h.Attribute("ry", "2"),
      ]),
      h.path([h.Attribute("d", "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1")]),
    ],
  );
}

function Row({
  h,
  label,
  children,
}: {
  h: HtmlBuilder<Message>;
  label: string;
  children: ReadonlyArray<Html | string>;
}) {
  return h.div(
    [h.Class("flex flex-col gap-1 py-3.5 sm:flex-row sm:gap-6")],
    [
      h.span([h.Class("text-sm font-medium text-black/64 sm:w-28 sm:shrink-0")], [label]),
      h.span([h.Class("min-w-0 flex-1 text-sm tabular-nums")], children),
    ],
  );
}

function Separator({ h }: { h: HtmlBuilder<Message> }) {
  return h.hr([h.Class("h-px rounded-sm border-0 bg-black/10")]);
}

function CandidateList({ model, h }: { model: Model; h: HtmlBuilder<Message> }) {
  const visible = (candidate: Candidate) => !model.hiddenPosters.includes(candidate.imdbId);
  return h.ul(
    [h.Class("mt-3 divide-y divide-black/10 border-y border-black/10")],
    model.lookup.candidates.map((candidate) =>
      h.li(
        [],
        [
          h.button(
            [
              h.Type("button"),
              h.OnClick(Message.PickedCandidate({ candidate })),
              h.Class(
                `flex w-full items-center gap-3 py-3 text-left hover:bg-black/5 ${FOCUS_RING}`,
              ),
            ],
            [
              ...(candidate.poster && visible(candidate)
                ? [
                    h.img([
                      h.Src(candidate.poster),
                      h.Alt(""),
                      h.Loading("lazy"),
                      h.Width("40"),
                      h.Height("60"),
                      h.OnError(Message.FailedPoster({ imdbId: candidate.imdbId })),
                      h.Class("h-[60px] w-10 shrink-0 rounded-lg bg-black/5 object-cover"),
                    ]),
                  ]
                : []),
              h.span(
                [h.Class("flex min-w-0 flex-col gap-0.5")],
                [
                  h.span([h.Class("text-sm font-medium")], [candidate.name]),
                  ...(candidate.year
                    ? [h.span([h.Class("text-sm text-black/64")], [candidate.year])]
                    : []),
                  h.span([h.Class("font-mono text-xs text-black/44")], [candidate.imdbId]),
                ],
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

function ResultDialog({
  model,
  result,
  h,
}: {
  model: Model;
  result: Result | null;
  h: HtmlBuilder<Message>;
}) {
  const retrying = model.lookup.phase === "retrying";
  const title = result === null ? "" : resultTitle(result);
  const meta = result === null ? "" : resultMeta(result);
  const disabled = retrying || busy(model.lookup.phase) || model.generation > model.applied;
  const link = (href: string, text: string, extra: string) =>
    h.a(
      [
        h.Href(href),
        h.Target("_blank"),
        h.Rel("noopener"),
        ...(disabled ? [h.Tabindex(-1)] : []),
        h.Class(
          `font-mono underline underline-offset-2 ${extra} ${
            disabled ? "pointer-events-none" : ""
          }`,
        ),
      ],
      [text],
    );

  const dialogView = ({
    dialog,
    panel,
    title: titleAttributes,
    description,
    closeButton,
    isVisible,
  }: Dialog.RenderInfo) => {
    if (result === null) {
      return h.dialog([...dialog, h.Class("watch-dialog")], []);
    }
    return h.dialog(
      [...dialog, h.Class("watch-dialog")],
      isVisible
        ? [
            // The scrim is deliberately not the Dialog backdrop bundle: the
            // backdrop bundle closes on click, and this dialog never does.
            h.div([h.Class("fixed inset-0 bg-black/50")]),
            h.div(
              [
                ...panel,
                h.Class(
                  "relative mx-auto my-8 max-h-[calc(100dvh-4rem)] w-[calc(100%-3rem)] max-w-[42rem] overflow-y-auto overscroll-contain rounded-xl border border-black/10 bg-white p-6 shadow-[var(--overlay-shadow)]",
                ),
              ],
              [
                h.div(
                  [h.Class("flex flex-col gap-0")],
                  [
                    h.div(
                      [],
                      [
                        h.h2(
                          [
                            ...titleAttributes,
                            h.Class("text-2xl font-semibold tracking-tight text-balance"),
                          ],
                          [title],
                        ),
                        h.p(
                          [...description, h.Class("mt-1 text-sm text-black/64 tabular-nums")],
                          [meta],
                        ),
                      ],
                    ),
                    h.div(
                      [h.Class("mt-4")],
                      [
                        ...(result.description
                          ? [
                              h.p(
                                [h.Class("text-base leading-relaxed text-black/64 text-pretty")],
                                [result.description],
                              ),
                            ]
                          : []),
                        h.p(
                          [h.Class("mt-4 text-sm font-medium text-black/64")],
                          [resultType(result.type)],
                        ),
                        h.div(
                          [h.Class("mt-5 border-t border-black/10")],
                          [
                            Row({
                              h,
                              label: COPY.imdb,
                              children: [link(imdbUrl(result.id), result.id, "")],
                            }),
                            Separator({ h }),
                            Row({
                              h,
                              label: COPY.provider,
                              children: [result.provider],
                            }),
                            Separator({ h }),
                            Row({
                              h,
                              label: COPY.streamUrl,
                              children: [link(result.url, result.url, "break-all")],
                            }),
                            ...(result.official
                              ? [
                                  Separator({ h }),
                                  Row({
                                    h,
                                    label: COPY.official,
                                    children: [
                                      link(
                                        result.official.link,
                                        result.official.services.join(", "),
                                        "",
                                      ),
                                    ],
                                  }),
                                ]
                              : []),
                          ],
                        ),
                      ],
                    ),
                    h.div(
                      [
                        h.Class(
                          "mt-5 flex flex-col gap-4 border-t border-black/10 pt-5 sm:flex-row sm:items-center sm:justify-between",
                        ),
                      ],
                      [
                        h.p(
                          [h.Class("text-sm leading-relaxed text-black/64 text-pretty")],
                          [
                            "You'll leave this site and play on ",
                            h.strong([h.Class("font-medium text-black")], [result.provider]),
                            ". We don't control external sites.",
                          ],
                        ),
                        h.div(
                          [h.Class("flex shrink-0 flex-wrap justify-end gap-2")],
                          [
                            h.button(
                              [
                                ...closeButton,
                                h.Disabled(disabled),
                                h.Class(
                                  `min-h-12 rounded-lg bg-black/5 px-4 text-sm font-medium sm:min-h-10 ${FOCUS_RING} ${DISABLED}`,
                                ),
                              ],
                              [COPY.cancel],
                            ),
                            h.button(
                              [
                                h.Type("button"),
                                h.AriaLabel(COPY.retry),
                                h.OnClick(Message.ClickedRetry()),
                                h.Disabled(disabled),
                                h.Class(ICON_BUTTON),
                              ],
                              [retrying ? Spinner({ h }) : RefreshIcon({ h })],
                            ),
                            h.button(
                              [
                                h.Type("button"),
                                h.AriaLabel(COPY.copy),
                                h.OnClick(Message.ClickedCopy()),
                                h.Disabled(disabled),
                                h.Class(ICON_BUTTON),
                              ],
                              [CopyIcon({ h })],
                            ),
                            h.button(
                              [
                                h.Type("button"),
                                h.Id("watch-result"),
                                h.OnClick(Message.ClickedWatch()),
                                h.Disabled(disabled),
                                h.Class(
                                  `min-h-12 rounded-lg bg-black px-5 text-sm font-medium text-white hover:bg-black/80 sm:min-h-10 ${FOCUS_RING} ${DISABLED}`,
                                ),
                              ],
                              [COPY.watch],
                            ),
                          ],
                        ),
                        ...(model.notice === null
                          ? []
                          : [
                              h.p(
                                [
                                  h.Role("status"),
                                  h.AriaLive("polite"),
                                  h.Class(
                                    "fixed bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-white px-4 py-3 text-sm shadow-[var(--overlay-shadow)]",
                                  ),
                                ],
                                [model.notice],
                              ),
                            ]),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ]
        : [],
    );
  };

  return h.submodel({
    slotId: model.dialog.id,
    model: model.dialog,
    view: Dialog.view,
    viewInputs: {
      hasDescription: true,
      toView: dialogView,
    },
    toParentMessage: (message) => Message.GotDialogMessage({ message }),
  });
}

export function view(model: Model, h: HtmlBuilder<Message>): Document {
  const loading = busy(model.lookup.phase) || model.generation > model.applied;
  const invalid = model.lookup.status.kind === "field";
  const statusText = model.lookup.status.kind === "idle" ? "" : model.lookup.status.text;
  const strong = model.lookup.status.kind === "error" || model.lookup.status.kind === "field";
  const describedBy = invalid ? "status search-hint" : "search-hint";

  const inputView = (attributes: Input.InputAttributes<Message>) =>
    h.div(
      [h.Class("min-w-0 flex-1")],
      [
        h.label([...attributes.label, h.Class("sr-only")], [COPY.fieldLabel]),
        h.input([
          ...attributes.input,
          h.Class(
            `h-12 w-full rounded-lg border border-black/15 bg-white px-3 text-base ${FIELD_RING} data-[invalid]:border-[oklch(0.6532_0.2328_25.74)] data-[disabled]:opacity-50`,
          ),
          h.Autocomplete("off"),
          h.Autocorrect("off"),
          h.Autocapitalize("none"),
          h.Spellcheck(false),
          h.EnterKeyHint("go"),
          h.AriaDescribedBy(describedBy),
          h.OnMount(ReadSearchField()),
        ]),
      ],
    );

  const selectView =
    (label: string, options: ReadonlyArray<{ value: string; text: string; selected: boolean }>) =>
    (attributes: Select.SelectAttributes<Message>) =>
      h.div(
        [h.Class("contents")],
        [
          h.label([...attributes.label, h.Class("sr-only")], [label]),
          h.select(
            [
              ...attributes.select,
              h.Class(
                `h-12 rounded-lg border border-black/15 bg-white px-3 text-sm font-medium ${FOCUS_RING} data-[disabled]:opacity-50`,
              ),
            ],
            options.map((option) =>
              h.option([h.Value(option.value), h.Selected(option.selected)], [option.text]),
            ),
          ),
        ],
      );

  return {
    title: COPY.title,
    lang: "en",
    body: h.main(
      [h.Class("mx-auto flex min-h-dvh w-full max-w-[42rem] flex-col py-14 sm:py-20")],
      [
        h.div(
          [h.Class("w-full sm:my-auto")],
          [
            h.header(
              [h.Class("w-full border-b border-black/10 pb-6")],
              [
                h.h1([h.Class("text-2xl font-semibold tracking-tight")], [COPY.wordmark]),
                h.p([h.Class("mt-1 text-sm text-black/64")], [COPY.intro]),
              ],
            ),
            h.div(
              [h.Class("w-full")],
              [
                h.search(
                  [],
                  [
                    h.form(
                      [
                        h.Class("mt-8 flex flex-col gap-3 sm:flex-row"),
                        h.OnSubmit(Message.SubmittedSearch()),
                      ],
                      [
                        Input.view(
                          {
                            id: SEARCH_FIELD_ID,
                            name: SEARCH_FIELD_NAME,
                            value: model.query,
                            isDisabled: loading,
                            isInvalid: invalid,
                            placeholder: COPY.placeholder,
                            onInput: (value) => Message.ChangedQuery({ value }),
                            toView: inputView,
                          },
                          h,
                        ),
                        Select.view(
                          {
                            id: "media-type",
                            value: model.lookup.kind,
                            isDisabled: loading,
                            onChange: (value) =>
                              Message.ChangedKind({ kind: value === "tv" ? "tv" : "movie" }),
                            toView: selectView(COPY.kindLabel, [
                              {
                                value: "movie",
                                text: COPY.movie,
                                selected: model.lookup.kind === "movie",
                              },
                              { value: "tv", text: COPY.tv, selected: model.lookup.kind === "tv" },
                            ]),
                          },
                          h,
                        ),
                        Select.view(
                          {
                            id: "language",
                            value: model.lookup.language,
                            isDisabled: loading,
                            onChange: (value) => Message.ChangedLanguage({ language: value }),
                            toView: selectView(
                              COPY.languageLabel,
                              LANGUAGES.map((language) => ({
                                value: language.code,
                                text: language.name,
                                selected: language.code === model.lookup.language,
                              })),
                            ),
                          },
                          h,
                        ),
                        h.button(
                          [
                            h.Type("submit"),
                            h.Disabled(loading),
                            h.Class(
                              `flex min-h-12 items-center justify-center gap-2 rounded-lg bg-black px-6 text-sm font-medium text-white hover:bg-black/80 ${FOCUS_RING} ${DISABLED}`,
                            ),
                          ],
                          [...(loading ? [Spinner({ h })] : []), COPY.submit],
                        ),
                      ],
                    ),
                  ],
                ),
                h.p(
                  [h.Id("search-hint"), h.Class("mt-3 text-xs leading-relaxed text-black/64")],
                  [COPY.hint],
                ),
                h.p(
                  [
                    h.Id("status"),
                    h.Role("status"),
                    h.AriaLive("polite"),
                    h.Class(
                      "mt-1 min-h-[1.625em] text-sm leading-relaxed " +
                        (strong ? "font-medium text-black" : "text-black/64"),
                    ),
                  ],
                  [statusText],
                ),
                ...(model.lookup.candidates.length > 0 ? [CandidateList({ model, h })] : []),
              ],
            ),
          ],
        ),
        h.footer(
          [h.Class("mt-14 w-full border-t border-black/10 pt-5")],
          [h.p([h.Class("text-xs leading-relaxed text-black/64")], [COPY.footer])],
        ),
        ResultDialog({ model, result: model.lookup.result, h }),
      ],
    ),
  };
}
