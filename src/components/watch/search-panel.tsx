import { Button, Input, Label, Spinner, TextField } from "@heroui/react";
import type { RefObject } from "react";
import type { TitleCandidate } from "../../lib/search";
import type { Status } from "./use-watch";

interface SearchPanelProps {
  value: string;
  inputRef: RefObject<HTMLInputElement | null>;
  status: Status;
  invalid: boolean;
  busy: boolean;
  candidates: Array<TitleCandidate>;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onPick: (candidate: TitleCandidate) => void;
}

function candidateMeta(candidate: TitleCandidate): string {
  const kind = candidate.kind === "tv" ? "TV show" : "Film";
  return [kind, candidate.year].filter(Boolean).join(" · ");
}

export function SearchPanel({
  value,
  inputRef,
  status,
  invalid,
  busy,
  candidates,
  onChange,
  onSubmit,
  onPick,
}: SearchPanelProps) {
  const text = status.kind === "idle" ? "" : status.text;
  const strong = status.kind === "error" || status.kind === "field";

  return (
    <>
      <search>
        <form
          className="mt-8 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(value);
          }}
        >
          <TextField
            className="min-w-0 flex-1"
            name="id"
            value={value}
            onChange={onChange}
            isDisabled={busy}
            isInvalid={invalid}
          >
            <Label className="sr-only">IMDb or TMDB ID, link, or title</Label>
            <Input
              ref={inputRef}
              className="min-h-12 rounded-lg border border-black/15"
              placeholder="IMDb or TMDB ID, link, or title"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="go"
              aria-invalid={invalid}
              aria-describedby={invalid ? "status search-hint" : "search-hint"}
            />
          </TextField>
          <Button
            type="submit"
            isDisabled={busy}
            className="min-h-12 rounded-lg bg-black px-6 text-sm font-medium text-white hover:bg-black/80"
          >
            {busy && <Spinner size="sm" color="current" className="motion-reduce:animate-none" />}
            Watch now
          </Button>
        </form>
      </search>

      <p id="search-hint" className="mt-3 text-xs leading-relaxed text-black/64">
        Paste an ID or link, or type a title. Bare numbers try TMDB first.
      </p>

      <p
        id="status"
        role="status"
        aria-live="polite"
        className={
          // The line keeps its height when empty, so an error does not shift
          // the centered page.
          "mt-1 min-h-[1.625em] text-sm leading-relaxed " +
          (strong ? "font-medium text-black" : "text-black/64")
        }
      >
        {text}
      </p>

      {candidates.length > 0 && (
        <ul className="mt-3 divide-y divide-black/10 border-y border-black/10">
          {candidates.map((candidate) => (
            <li key={candidate.imdbId}>
              <button
                type="button"
                className="flex w-full items-center gap-3 py-3 text-left hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
                onClick={() => onPick(candidate)}
              >
                {candidate.poster && (
                  <img
                    src={candidate.poster}
                    alt=""
                    loading="lazy"
                    width={40}
                    height={60}
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                    className="h-[60px] w-10 shrink-0 rounded-lg bg-black/5 object-cover"
                  />
                )}
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">{candidate.name}</span>
                  <span className="text-sm text-black/64">{candidateMeta(candidate)}</span>
                  <span className="font-mono text-xs text-black/44">{candidate.imdbId}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
