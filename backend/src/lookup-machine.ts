import { createEffectLogic, setupEffect } from "@xstate/effect";
import { Schema } from "effect";
import type { Effect } from "effect";
import { LOOKUP_FAILED, SEARCH_FAILED } from "../../src/lib/messages";
import { fullLinkForId, isLinkLike, parseTitleInput } from "../../src/lib/parse-input";
import {
  Candidate,
  FAILURE_REASONS,
  Kind,
  Result,
  SearchInput,
  SearchOutcome,
} from "../../src/lib/types";
import type { ContentType } from "../../src/lib/types";
// The status copy the machine emits. The tests pin these strings, because they
// are what a person reads while a lookup runs.
const MESSAGES = {
  empty: "Enter an IMDb or TMDB ID, link, or title.",
  badLink: "Use an IMDb title link or a TMDB movie or TV link.",
  searching: "Searching titles...",
  looking: "Finding a working stream...",
  retrying: "Finding another stream...",
  noTitle: "No title found. Try an ID or the full link.",
  lookupFailed: LOOKUP_FAILED,
  noProviders: "No other providers available.",
} as const;

const matchLabel = (count: number): string =>
  `${count} ${count === 1 ? "match" : "matches"}. Choose one.`;

const FailureReason = Schema.Literals(FAILURE_REASONS);

const LookupOutcome = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), result: Result }),
  Schema.Struct({
    ok: Schema.Literal(false),
    reason: FailureReason,
    error: Schema.String,
  }),
]);
export type LookupOutcome = typeof LookupOutcome.Type;

export const Status = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("idle") }),
  Schema.Struct({ kind: Schema.Literal("info"), text: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("loading"), text: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("error"), text: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("field"), text: Schema.String }),
]);
export type Status = typeof Status.Type;

const LookupContext = Schema.Struct({
  value: Schema.String,
  kind: Kind,
  language: Schema.String,
  candidates: Schema.Array(Candidate),
  result: Schema.NullOr(Result),
  status: Status,
  openId: Schema.NullOr(Schema.String),
});
export type LookupContext = typeof LookupContext.Type;

const LookupInput = Schema.Struct({
  id: Schema.String,
  kind: Kind,
  strictKind: Schema.optionalKey(Schema.Boolean),
  name: Schema.optionalKey(Schema.String),
  year: Schema.optionalKey(Schema.String),
  exclude: Schema.optionalKey(Schema.String),
});
export type LookupInput = typeof LookupInput.Type;

export type LookupEvent =
  | { readonly type: "submit"; readonly input: string }
  | { readonly type: "pick"; readonly candidate: Candidate }
  | { readonly type: "retry" }
  | { readonly type: "searchDone"; readonly output: SearchOutcome }
  | { readonly type: "lookupDone"; readonly output: LookupOutcome }
  | { readonly type: "fail"; readonly message: string }
  | { readonly type: "close" }
  | { readonly type: "hashNav"; readonly id: string }
  | { readonly type: "kindChange"; readonly kind: ContentType }
  | { readonly type: "languageChange"; readonly language: string }
  | { readonly type: "change"; readonly value: string };

const Events = {
  submit: Schema.Struct({ input: Schema.String }),
  pick: Schema.Struct({ candidate: Candidate }),
  retry: Schema.Struct({}),
  searchDone: Schema.Struct({ output: SearchOutcome }),
  lookupDone: Schema.Struct({ output: LookupOutcome }),
  fail: Schema.Struct({ message: Schema.String }),
  close: Schema.Struct({}),
  hashNav: Schema.Struct({ id: Schema.String }),
  kindChange: Schema.Struct({ kind: Kind }),
  languageChange: Schema.Struct({ language: Schema.String }),
  change: Schema.Struct({ value: Schema.String }),
};

// Search titles and look up a stream. The UI supplies the real services; the
// tests supply fakes. Product failures stay in the outcome union, so the
// machine decides the next move instead of catching a thrown error.
export interface LookupDeps {
  readonly search: (input: SearchInput) => Effect.Effect<SearchOutcome>;
  readonly lookup: (input: LookupInput) => Effect.Effect<LookupOutcome>;
}

const idleStatus = (): Status => ({ kind: "idle" });
const infoStatus = (text: string): Status => ({ kind: "info", text });
const loadingStatus = (text: string): Status => ({ kind: "loading", text });
const errorStatus = (text: string): Status => ({ kind: "error", text });
const fieldStatus = (text: string): Status => ({ kind: "field", text });

// The status a successful lookup leaves behind: an open list keeps its count.
const afterLookup = (candidates: ReadonlyArray<Candidate>): Status =>
  candidates.length > 0 ? infoStatus(matchLabel(candidates.length)) : idleStatus();

type Move =
  | {
      readonly target: "idle" | "searching" | "looking" | "retrying";
      readonly reenter?: boolean;
      readonly context?: Partial<LookupContext>;
    }
  | { readonly context?: Partial<LookupContext> };

const onKindChange = (kind: ContentType): Move => ({
  context: { kind, candidates: [] },
});

const onLanguageChange = (context: LookupContext, language: string): Move => {
  // A message about the old choice is stale after the change.
  const stale = context.status.kind === "error" || context.status.kind === "field";
  return {
    context: stale
      ? { language, candidates: [], status: idleStatus() }
      : { language, candidates: [] },
  };
};

const onClose = (): Move => ({ context: { openId: null } });

const onChange = (context: LookupContext, value: string): Move => ({
  context:
    context.status.kind === "field"
      ? { value, candidates: [], status: idleStatus() }
      : { value, candidates: [] },
});

// Hash navigation prefills but never opens. The id of the dialog we opened is
// its own history echo and is dropped; re-applying the shown link is a no-op.
const onHashNav = (context: LookupContext, id: string): Move => {
  if (id === context.openId) {
    return { context: {} };
  }
  if (context.result?.id === id) {
    return { context: { openId: id } };
  }
  const link = fullLinkForId(id, context.kind) ?? id;
  if (context.value === link) {
    return { context: {} };
  }
  return { context: { value: link, candidates: [], openId: null } };
};

// What the person typed stays. A pasted link is not replaced by the id.
const isPickEvent = (event: {
  readonly type: string;
}): event is Extract<LookupEvent, { type: "pick" }> => event.type === "pick";

const isSubmitEvent = (event: {
  readonly type: string;
}): event is Extract<LookupEvent, { type: "submit" }> => event.type === "submit";

const onLookupInput = (context: LookupContext, event: { readonly type: string }): LookupInput => {
  if (isPickEvent(event)) {
    return event.candidate.year === undefined
      ? {
          id: event.candidate.imdbId,
          kind: event.candidate.kind,
          strictKind: true,
          name: event.candidate.name,
        }
      : {
          id: event.candidate.imdbId,
          kind: event.candidate.kind,
          strictKind: true,
          name: event.candidate.name,
          year: event.candidate.year,
        };
  }
  if (isSubmitEvent(event)) {
    const parsed = parseTitleInput(event.input);
    // A TMDB link carries its own type, so the selector must not override it.
    const kind = parsed?.kind === "tmdb" && parsed.type ? parsed.type : context.kind;
    return { id: parsed?.id ?? event.input.trim(), kind, strictKind: true };
  }
  return { id: context.value, kind: context.kind };
};

const onSubmit = (context: LookupContext, input: string): Move => {
  const value = input.trim();
  if (!value) {
    return { context: { status: fieldStatus(MESSAGES.empty) } };
  }
  if (!parseTitleInput(value)) {
    if (isLinkLike(value)) {
      return { context: { status: errorStatus(MESSAGES.badLink) } };
    }
    return {
      target: "searching",
      reenter: true,
      context: { value, status: loadingStatus(MESSAGES.searching) },
    };
  }
  return {
    target: "looking",
    reenter: true,
    context: { value, status: loadingStatus(MESSAGES.looking) },
  };
};

const onPick = (): Move => ({
  target: "looking",
  reenter: true,
  context: { status: loadingStatus(MESSAGES.looking) },
});

const onRetry = (context: LookupContext): Move | undefined =>
  context.result
    ? { target: "retrying", context: { status: loadingStatus(MESSAGES.retrying) } }
    : undefined;

const onSearchDone = (output: SearchOutcome): Move => {
  if (!output.ok) {
    return { target: "idle", context: { status: errorStatus(SEARCH_FAILED) } };
  }
  if (output.candidates.length === 0) {
    return { target: "idle", context: { status: errorStatus(MESSAGES.noTitle) } };
  }
  return {
    target: "idle",
    context: {
      candidates: output.candidates,
      status: infoStatus(matchLabel(output.candidates.length)),
    },
  };
};

const onLookupDone = (context: LookupContext, output: LookupOutcome): Move => {
  if (!output.ok) {
    // A bare number may be a title ("1917") rather than a TMDB ID.
    const parsed = parseTitleInput(context.value);
    const bareTmdb = parsed?.kind === "tmdb" && parsed.type === undefined;
    if (bareTmdb && output.reason === "tmdb_not_found") {
      return { target: "searching", context: { status: loadingStatus(MESSAGES.searching) } };
    }
    return { target: "idle", context: { status: errorStatus(output.error) } };
  }
  return {
    target: "idle",
    context: {
      result: output.result,
      // The id whose own history echo must be ignored.
      openId: output.result.id,
      // The selector follows a pasted link; bare ids leave it alone.
      kind: isLinkLike(context.value) ? output.result.type : context.kind,
      status: afterLookup(context.candidates),
    },
  };
};

const onRetryDone = (output: LookupOutcome): Move => {
  if (!output.ok) {
    const text = output.reason === "no_providers" ? MESSAGES.noProviders : output.error;
    return { target: "idle", context: { status: errorStatus(text) } };
  }
  return { target: "idle", context: { result: output.result, status: idleStatus() } };
};

const onFail = (message: string): Move => ({
  target: "idle",
  context: { status: errorStatus(message) },
});

const onRetryInput = (context: LookupContext): LookupInput => {
  const result = context.result;
  // The retry transition only exists when a result is open.
  if (!result) {
    return { id: context.value, kind: context.kind };
  }
  return result.year === undefined
    ? {
        id: result.id,
        kind: result.type,
        strictKind: true,
        name: result.name,
        exclude: result.provider,
      }
    : {
        id: result.id,
        kind: result.type,
        strictKind: true,
        name: result.name,
        year: result.year,
        exclude: result.provider,
      };
};

export type LookupMachine = ReturnType<typeof createLookupMachine>;

export function createLookupMachine(deps: LookupDeps) {
  const search = createEffectLogic({
    schemas: { input: SearchInput },
    effect: ({ input }) => deps.search(input),
  });

  const lookup = createEffectLogic({
    schemas: { input: LookupInput },
    effect: ({ input }) => deps.lookup(input),
  });

  return setupEffect({
    schemas: { context: LookupContext, events: Events },
    actors: { search, lookup },
  }).createMachine({
    id: "lookup",
    context: {
      value: "",
      kind: "movie",
      language: "",
      candidates: [],
      result: null,
      status: idleStatus(),
      openId: null,
    },
    initial: "idle",
    // Events that never move a phase are available in every state.
    on: {
      close: onClose,
      hashNav: (args) => onHashNav(args.context, args.event.id),
      kindChange: (args) => onKindChange(args.event.kind),
      languageChange: (args) => onLanguageChange(args.context, args.event.language),
      change: (args) => onChange(args.context, args.event.value),
    },
    states: {
      idle: {
        on: {
          submit: (args) => onSubmit(args.context, args.event.input),
          pick: onPick,
          retry: (args) => onRetry(args.context),
        },
      },
      searching: {
        invoke: {
          src: "search",
          input: ({ context }) => ({
            query: context.value,
            kind: context.kind,
            language: context.language,
          }),
          onDone: (args, enq) => {
            enq.raise({ type: "searchDone", output: args.event.output });
          },
          onError: (_args, enq) => {
            enq.raise({ type: "fail", message: SEARCH_FAILED });
          },
        },
        on: {
          submit: (args) => onSubmit(args.context, args.event.input),
          pick: onPick,
          retry: (args) => onRetry(args.context),
          searchDone: (args) => onSearchDone(args.event.output),
          fail: (args) => onFail(args.event.message),
        },
      },
      looking: {
        invoke: {
          src: "lookup",
          input: ({ context, event }) => onLookupInput(context, event),
          onDone: (args, enq) => {
            enq.raise({ type: "lookupDone", output: args.event.output });
          },
          onError: (_args, enq) => {
            enq.raise({ type: "fail", message: MESSAGES.lookupFailed });
          },
        },
        on: {
          submit: (args) => onSubmit(args.context, args.event.input),
          pick: onPick,
          retry: (args) => onRetry(args.context),
          lookupDone: (args) => onLookupDone(args.context, args.event.output),
          fail: (args) => onFail(args.event.message),
        },
      },
      retrying: {
        invoke: {
          src: "lookup",
          input: ({ context }) => onRetryInput(context),
          onDone: (args, enq) => {
            enq.raise({ type: "lookupDone", output: args.event.output });
          },
          onError: (_args, enq) => {
            enq.raise({ type: "fail", message: MESSAGES.noProviders });
          },
        },
        on: {
          submit: (args) => onSubmit(args.context, args.event.input),
          pick: onPick,
          lookupDone: (args) => onRetryDone(args.event.output),
          fail: (args) => onFail(args.event.message),
        },
      },
    },
  });
}
