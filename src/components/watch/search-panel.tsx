import { Button, Input, Label, Spinner, TextField } from "@heroui/react";
import type { RefObject } from "react";
import type { TitleCandidate } from "../../lib/search";
import type { ContentType } from "../../lib/types";
import type { Status } from "./use-watch";

interface SearchPanelProps {
  value: string;
  kind: ContentType;
  inputRef: RefObject<HTMLInputElement | null>;
  status: Status;
  invalid: boolean;
  busy: boolean;
  candidates: Array<TitleCandidate>;
  onChange: (value: string) => void;
  onKindChange: (kind: ContentType) => void;
  onSubmit: (value: string) => void;
  onPick: (candidate: TitleCandidate) => void;
}

function candidateMeta(candidate: TitleCandidate): string | undefined {
  return candidate.year;
}

export function SearchPanel({
  value,
  kind,
  inputRef,
  status,
  invalid,
  busy,
  candidates,
  onChange,
  onKindChange,
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
              placeholder="Title, IMDb or TMDB ID, or link"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="go"
              aria-invalid={invalid}
              aria-describedby={invalid ? "status" : undefined}
            />
          </TextField>
          <label className="sr-only" htmlFor="media-type">
            Movie or TV show
          </label>
          <select
            id="media-type"
            value={kind}
            onChange={(event) => onKindChange(event.target.value === "tv" ? "tv" : "movie")}
            disabled={busy}
            className="min-h-12 rounded-lg border border-black/15 bg-white px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
          >
            <option value="movie">Movie</option>
            <option value="tv">TV</option>
          </select>
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

      <p
        id="status"
        role="status"
        aria-live="polite"
        className={
          // The line keeps its height when empty, so an error does not shift
          // the centered page.
          "mt-3 min-h-[1.625em] text-sm leading-relaxed " +
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
                className="flex w-full flex-col gap-0.5 py-3 text-left hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
                onClick={() => onPick(candidate)}
              >
                <span className="text-sm font-medium">{candidate.name}</span>
                {candidateMeta(candidate) && (
                  <span className="text-sm text-black/64">{candidateMeta(candidate)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
