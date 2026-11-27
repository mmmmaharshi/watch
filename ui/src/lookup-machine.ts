import { createEffectLogic, setupEffect } from "@xstate/effect";
import { Schema } from "effect";
import type { Effect } from "effect";
import { COPY } from "../../src/lib/copy";
import { isLinkLike, parseTitleInput } from "../../src/lib/parse-input";
import { Kind, LookupInput, LookupOutcome, Result } from "../../src/lib/types";

export const Status = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("idle") }),
  Schema.Struct({ kind: Schema.Literal("info"), text: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("error"), text: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("field"), text: Schema.String }),
]);
export type Status = typeof Status.Type;

const LookupContext = Schema.Struct({
  // True when the last submit was a pasted link, so its result type becomes
  // the kind a later bare id uses.
  linkSubmit: Schema.Boolean,
  kind: Kind,
  result: Schema.NullOr(Result),
  status: Status,
  openId: Schema.NullOr(Schema.String),
});
export type LookupContext = typeof LookupContext.Type;

export type LookupEvent =
  | { readonly type: "submit"; readonly input: string }
  | { readonly type: "retry" }
  | { readonly type: "lookupDone"; readonly output: LookupOutcome }
  | { readonly type: "fail"; readonly message: string }
  | { readonly type: "close" }
  | { readonly type: "hashNav"; readonly id: string };

// One payload schema per event; the tagged commands below reuse them, so an
// event's shape is declared once.
const Submit = Schema.Struct({ input: Schema.String });
const Exit = Schema.Struct({});
const Done = Schema.Struct({ output: LookupOutcome });
const Fail = Schema.Struct({ message: Schema.String });
const Hash = Schema.Struct({ id: Schema.String });

const Events = {
  submit: Submit,
  retry: Exit,
  lookupDone: Done,
  fail: Fail,
  close: Exit,
  hashNav: Hash,
};

// The four events the page sends. The machine's replies (`lookupDone`, `fail`)
// stay inside.
export const LookupCommand = Schema.Union([
  Schema.Struct({ type: Schema.Literal("submit"), ...Submit.fields }),
  Schema.Struct({ type: Schema.Literal("retry"), ...Exit.fields }),
  Schema.Struct({ type: Schema.Literal("close"), ...Exit.fields }),
  Schema.Struct({ type: Schema.Literal("hashNav"), ...Hash.fields }),
]);
export type LookupCommand = typeof LookupCommand.Type;

// Look up a stream for one id. The UI supplies the real services; the tests
// supply fakes. Product failures stay in the outcome union, so the machine
// decides the next move instead of catching a thrown error.
export interface LookupDeps {
  readonly lookup: (input: LookupInput) => Effect.Effect<LookupOutcome>;
}

const idleStatus = (): Status => ({ kind: "idle" });
const errorStatus = (text: string): Status => ({ kind: "error", text });
const fieldStatus = (text: string): Status => ({ kind: "field", text });

type Move =
  | {
      readonly target: "idle" | "looking" | "retrying";
      readonly reenter?: boolean;
      readonly context?: Partial<LookupContext>;
    }
  | { readonly context?: Partial<LookupContext> };

const onClose = (): Move => ({ context: { openId: null } });

// Hash navigation only reopens or closes. The page owns the field text.
const onHashNav = (context: LookupContext, id: string): Move => {
  if (id === context.openId) {
    return { context: {} };
  }
  if (context.result?.id === id) {
    return { context: { openId: id } };
  }
  return { context: { openId: null } };
};

const onLookupInput = (context: LookupContext, event: { readonly input: string }): LookupInput => {
  const parsed = parseTitleInput(event.input);
  // A TMDB link carries its own type. A bare number keeps no kind, so the
  // mapping tries the movie and TV spaces.
  if (parsed?.kind === "tmdb" && parsed.type === undefined) {
    return { id: parsed.id, strictKind: true };
  }
  const kind = parsed?.kind === "tmdb" && parsed.type ? parsed.type : context.kind;
  return { id: parsed?.id ?? event.input.trim(), kind, strictKind: true };
};

const onSubmit = (context: LookupContext, input: string): Move => {
  const value = input.trim();
  if (!value) {
    return { context: { status: fieldStatus(COPY.machine.empty) } };
  }
  if (!parseTitleInput(value) && isLinkLike(value)) {
    return { context: { status: errorStatus(COPY.machine.badLink) } };
  }
  return {
    target: "looking",
    reenter: true,
    context: { linkSubmit: isLinkLike(value) },
  };
};

const onRetry = (context: LookupContext): Move | undefined =>
  context.result ? { target: "retrying" } : undefined;

// One success move. Every completed lookup opens its own result, and a submit
// that came from a link sets the kind a later bare id will use; a bare id
// leaves it alone.
const succeed = (context: LookupContext, result: Result): Move => ({
  target: "idle",
  context: {
    result,
    // The id whose own history echo must be ignored.
    openId: result.id,
    kind: context.linkSubmit ? result.type : context.kind,
    status: idleStatus(),
  },
});

const onLookupDone = (context: LookupContext, output: LookupOutcome): Move =>
  output.ok
    ? succeed(context, output.result)
    : { target: "idle", context: { status: errorStatus(output.error) } };

const onRetryDone = (context: LookupContext, output: LookupOutcome): Move => {
  if (output.ok) {
    // A retry for the same id can come back without metadata a miss dropped.
    // Keep what the open result already showed.
    const merged =
      context.result === null ? output.result : { ...context.result, ...output.result };
    return succeed(context, merged);
  }
  const text = output.reason === "no_providers" ? COPY.machine.noProviders : output.error;
  return { target: "idle", context: { status: errorStatus(text) } };
};

const onFail = (message: string): Move => ({
  target: "idle",
  context: { status: errorStatus(message) },
});

const onRetryInput = (context: LookupContext): LookupInput => {
  const result = context.result;
  // Unreachable: only a state with an open result offers retry.
  if (!result) {
    return { id: "", kind: context.kind };
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

export function createLookupMachine(deps: LookupDeps) {
  const lookup = createEffectLogic({
    schemas: { input: LookupInput },
    effect: ({ input }) => deps.lookup(input),
  });

  return setupEffect({
    schemas: { context: LookupContext, events: Events },
    actors: { lookup },
  }).createMachine({
    id: "lookup",
    context: {
      linkSubmit: false,
      kind: "movie",
      result: null,
      status: idleStatus(),
      openId: null,
    },
    initial: "idle",
    // Events that never move a phase are available in every state.
    on: {
      close: onClose,
      hashNav: (args) => onHashNav(args.context, args.event.id),
    },
    states: {
      idle: {
        on: {
          submit: (args) => onSubmit(args.context, args.event.input),
          retry: (args) => onRetry(args.context),
        },
      },
      looking: {
        invoke: {
          src: "lookup",
          input: ({ context, event }) =>
            "input" in event ? onLookupInput(context, event) : onRetryInput(context),
          onDone: (args, enq) => {
            enq.raise({ type: "lookupDone", output: args.event.output });
          },
          onError: (_args, enq) => {
            enq.raise({ type: "fail", message: COPY.machine.failed });
          },
        },
        on: {
          submit: (args) => onSubmit(args.context, args.event.input),
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
            enq.raise({ type: "fail", message: COPY.machine.noProviders });
          },
        },
        on: {
          submit: (args) => onSubmit(args.context, args.event.input),
          lookupDone: (args) => onRetryDone(args.context, args.event.output),
          fail: (args) => onFail(args.event.message),
        },
      },
    },
  });
}
