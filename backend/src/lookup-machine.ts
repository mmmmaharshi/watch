import { createEffectLogic, setupEffect } from "@xstate/effect";
import { Schema } from "effect";
import type { Effect } from "effect";
import { SEARCH_FAILED } from "../../src/lib/messages";
import type { ContentType } from "../../src/lib/types";

// src/lib/search.ts does not typecheck under this package's
// exactOptionalPropertyTypes, so the candidate shape is declared here.
export interface TitleCandidate {
  readonly imdbId: string;
  readonly name: string;
  readonly year?: string;
  readonly kind: ContentType;
  readonly poster?: string;
}

// The backend package cannot import src/lib/parse-input.ts for the same reason.
// These helpers mirror it and must move with it if that rule changes.
const IMDB_ID = /tt\d{7,8}(?!\d)/;
const TMDB_MOVIE = /themoviedb\.org\/movie\/([1-9]\d{0,7})/i;
const TMDB_TV = /themoviedb\.org\/tv\/([1-9]\d{0,7})/i;
const BARE_TMDB = /^[1-9]\d{0,7}$/;

type ParsedInput =
  | { readonly kind: "imdb"; readonly id: string }
  | { readonly kind: "tmdb"; readonly type?: ContentType; readonly id: string };

const parseTitleInput = (input: string): ParsedInput | null => {
  const value = input.trim().toLowerCase();
  const movie = value.match(TMDB_MOVIE);
  if (movie?.[1]) {
    return { kind: "tmdb", type: "movie", id: movie[1] };
  }
  const tv = value.match(TMDB_TV);
  if (tv?.[1]) {
    return { kind: "tmdb", type: "tv", id: tv[1] };
  }
  const imdb = value.match(IMDB_ID);
  if (imdb?.[0]) {
    return { kind: "imdb", id: imdb[0] };
  }
  if (BARE_TMDB.test(value)) {
    return { kind: "tmdb", id: value };
  }
  return null;
};

const isLinkLike = (value: string): boolean => {
  const trimmed = value.trim().toLowerCase();
  return (
    trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("www.")
  );
};

const imdbUrl = (id: string): string => `https://www.imdb.com/title/${id}/`;

const isImdbId = (value: string): boolean =>
  value.toLowerCase().match(IMDB_ID)?.[0] === value.toLowerCase();

const fullLinkForId = (id: string, kind: ContentType): string | null => {
  const value = id.trim();
  if (isImdbId(value)) {
    return imdbUrl(value.toLowerCase());
  }
  if (BARE_TMDB.test(value)) {
    return `https://www.themoviedb.org/${kind === "tv" ? "tv" : "movie"}/${value}`;
  }
  return null;
};

// Current behavior lives in src/components/watch/use-watch.ts. These strings
// are the port contract, so they are copied literally.
const MESSAGES = {
  empty: "Enter an IMDb or TMDB ID, link, or title.",
  badLink: "Use an IMDb title link or a TMDB movie or TV link.",
  searching: "Searching titles...",
  looking: "Finding a working stream...",
  retrying: "Finding another stream...",
  noTitle: "No title found. Try an ID or the full link.",
  lookupFailed: "Something went wrong. Try again.",
  noProviders: "No other providers available.",
} as const;

const matchLabel = (count: number): string =>
  `${count} ${count === 1 ? "match" : "matches"}. Choose one.`;

const Kind = Schema.Literals(["movie", "tv"]);

const Candidate = Schema.Struct({
  imdbId: Schema.String,
  name: Schema.String,
  year: Schema.optionalKey(Schema.String),
  kind: Kind,
  poster: Schema.optionalKey(Schema.String),
});

const Result = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  provider: Schema.String,
  type: Kind,
  name: Schema.String,
  year: Schema.optionalKey(Schema.String),
  rating: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
});
export type WatchResult = typeof Result.Type;

const FailureReason = Schema.Literals([
  "invalid_input",
  "tmdb_ambiguous",
  "tmdb_not_found",
  "metadata_missing",
  "no_providers",
]);
export type WatchFailureReason = typeof FailureReason.Type;

const SearchOutcome = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), candidates: Schema.Array(Candidate) }),
  Schema.Struct({ ok: Schema.Literal(false), error: Schema.String }),
]);
export type SearchOutcome = typeof SearchOutcome.Type;

const LookupOutcome = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), result: Result }),
  Schema.Struct({
    ok: Schema.Literal(false),
    reason: FailureReason,
    error: Schema.String,
  }),
]);
export type LookupOutcome = typeof LookupOutcome.Type;

const Status = Schema.Union([
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
  candidates: Schema.Array(Candidate),
  result: Schema.NullOr(Result),
  status: Status,
  openId: Schema.NullOr(Schema.String),
});
export type LookupContext = typeof LookupContext.Type;

const SearchInput = Schema.Struct({ query: Schema.String, kind: Kind });
export type SearchInput = typeof SearchInput.Type;

const LookupInput = Schema.Struct({
  id: Schema.String,
  kind: Kind,
  exclude: Schema.optionalKey(Schema.String),
});
export type LookupInput = typeof LookupInput.Type;

export type LookupEvent =
  | { readonly type: "submit"; readonly input: string }
  | { readonly type: "pick"; readonly candidate: TitleCandidate }
  | { readonly type: "retry" }
  | { readonly type: "searchDone"; readonly output: SearchOutcome }
  | { readonly type: "lookupDone"; readonly output: LookupOutcome }
  | { readonly type: "fail"; readonly message: string }
  | { readonly type: "close" }
  | { readonly type: "hashNav"; readonly id: string }
  | { readonly type: "kindChange"; readonly kind: ContentType }
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
const afterLookup = (candidates: ReadonlyArray<TitleCandidate>): Status =>
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
    return { id: event.candidate.imdbId, kind: context.kind };
  }
  if (isSubmitEvent(event)) {
    const parsed = parseTitleInput(event.input);
    // A TMDB link carries its own type, so the selector must not override it.
    const kind = parsed?.kind === "tmdb" && parsed.type ? parsed.type : context.kind;
    return { id: parsed?.id ?? event.input.trim(), kind };
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
    if (BARE_TMDB.test(context.value) && output.reason === "tmdb_not_found") {
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
    return { target: "idle", context: { status: errorStatus(output.error) } };
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
  return { id: result.id, kind: result.type, exclude: result.provider };
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
          input: ({ context }) => ({ query: context.value, kind: context.kind }),
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
