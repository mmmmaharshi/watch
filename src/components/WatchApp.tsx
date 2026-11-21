import { actions } from "astro:actions";
import {
  Button,
  Card,
  Input,
  Label,
  Modal,
  Separator,
  Spinner,
  TextField,
  Toast,
  toast,
} from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { parseTitleInput } from "../lib/parse-input";
import { shareUrl } from "../lib/share";
import { unwrapActionResult } from "../lib/watch";
import type { WatchResult } from "../lib/watch";
import type { TitleCandidate } from "../lib/search";
import { parseSharedId, resultMeta, resultTitle, resultType } from "../lib/watch-view";

type Status = { text: string; kind?: "loading" | "error" };

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

async function lookup(value: string, exclude?: string): Promise<WatchResult> {
  const result: unknown = await actions.watch({ id: value, exclude });
  return unwrapActionResult(result);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3.5 sm:flex-row sm:gap-6">
      <span className="text-sm font-medium text-black/64 sm:w-28 sm:shrink-0">{label}</span>
      <span className="min-w-0 flex-1 text-sm tabular-nums">{children}</span>
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export default function WatchApp() {
  const inputRef = useRef<HTMLInputElement>(null);
  const currentId = useRef<string | null>(null);
  const loadingId = useRef<string | null>(null);

  const [value, setValue] = useState("");
  const [status, setStatus] = useState<Status>({ text: "" });
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [result, setResult] = useState<WatchResult | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [candidates, setCandidates] = useState<Array<TitleCandidate>>([]);

  function showError(text: string) {
    setStatus({ text, kind: "error" });
    setInvalid(true);
  }

  function showResults(data: WatchResult) {
    currentId.current = data.id;
    setResult(data);
    setIsOpen(true);
  }

  async function runSearch(query: string) {
    setLoading(true);
    setCandidates([]);
    setStatus({ text: "Searching titles...", kind: "loading" });
    try {
      const response = await actions.search({ query });
      if (response.error) {
        throw new Error(response.error.message);
      }
      const list = response.data?.candidates ?? [];
      if (list.length === 0) {
        showError("No title found. Try an ID or the full link.");
        return;
      }
      setStatus({ text: `${list.length} ${list.length === 1 ? "match" : "matches"}. Choose one.` });
      setCandidates(list);
    } catch (error) {
      showError(errMessage(error, "Title search failed. Try an ID."));
    } finally {
      setLoading(false);
    }
  }

  function chooseCandidate(candidate: TitleCandidate) {
    setCandidates([]);
    setValue(candidate.imdbId);
    void runLookup(candidate.imdbId);
  }

  async function runLookup(raw: string) {
    const input = raw.trim();
    if (!input) {
      showError("Enter an IMDb or TMDB ID, link, or title.");
      inputRef.current?.focus();
      return;
    }

    if (!parseTitleInput(input)) {
      await runSearch(input);
      return;
    }

    setCandidates([]);
    setLoading(true);
    loadingId.current = input;
    setStatus({ text: "Finding a working stream...", kind: "loading" });

    try {
      const data = await lookup(input);
      // The server answers with the canonical ID, whether an ID or a link went in.
      setValue(data.id);
      setInvalid(false);
      if (location.hash !== `#id=${data.id}`) {
        history.pushState(null, "", `#id=${data.id}`);
      }
      setStatus({ text: "" });
      showResults(data);
    } catch (error) {
      showError(errMessage(error, "Something went wrong. Try again."));
    } finally {
      loadingId.current = null;
      setLoading(false);
    }
  }

  async function tryAnother() {
    if (!result || fetching) {
      return;
    }
    setFetching(true);
    setStatus({ text: "Finding another stream...", kind: "loading" });
    try {
      showResults(await lookup(result.id, result.provider));
      setStatus({ text: "" });
    } catch (error) {
      setStatus({ text: errMessage(error, "No other providers available."), kind: "error" });
    } finally {
      setFetching(false);
    }
  }

  async function copyLink() {
    if (!result) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl(location.origin, result.id));
      toast.success("Link copied.");
    } catch (error) {
      setStatus({
        text: errMessage(error, "Copy failed. Select the link text to copy it manually."),
        kind: "error",
      });
    }
  }

  function watch() {
    if (result) {
      window.open(result.url, "_blank", "noopener");
    }
    handleOpenChange(false);
    setStatus({ text: "" });
  }

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (!open) {
      currentId.current = null;
    }
  }

  useEffect(() => {
    const shared = parseSharedId(location.search, location.hash);
    if (shared) {
      // The URL is the source of truth on mount; the lookup below corrects it.
      // eslint-disable-next-line react/set-state-in-effect
      setValue(shared);
      void runLookup(shared);
    } else {
      inputRef.current?.focus();
    }
    // Help links change only the hash, which does not reload the page.
    // Same-document clicks go through the router (popstate, no hashchange);
    // back/forward can fire both, so an id that is showing or loading is skipped.
    function handleHash() {
      const id = parseSharedId(location.search, location.hash);
      if (!id || id === currentId.current || id === loadingId.current) {
        return;
      }
      setValue(id);
      void runLookup(id);
    }
    window.addEventListener("hashchange", handleHash);
    window.addEventListener("popstate", handleHash);
    return () => {
      window.removeEventListener("hashchange", handleHash);
      window.removeEventListener("popstate", handleHash);
    };
    // The handlers read refs and setters only, so one mount is enough.
  }, []);

  // The input is disabled while the lookup runs, so React Aria saves `body`
  // as the element to focus on close. Send focus back to the field instead.
  useEffect(() => {
    if (!isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const title = result ? resultTitle(result) : "Stream found";
  const meta = result ? resultMeta(result) : "";

  return (
    <>
      <search>
        <form
          className="mt-8 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void runLookup(value);
          }}
        >
          <TextField
            className="min-w-0 flex-1"
            name="id"
            value={value}
            onChange={(next) => {
              setValue(next);
              setCandidates([]);
              if (invalid) {
                setInvalid(false);
                setStatus({ text: "" });
              }
            }}
            isDisabled={loading}
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
              aria-describedby={invalid ? "hint status" : "hint"}
            />
          </TextField>
          <Button
            type="submit"
            isDisabled={loading}
            className="min-h-12 rounded-lg bg-black px-6 text-sm font-medium text-white hover:bg-black/80"
          >
            {loading && (
              <Spinner size="sm" color="current" className="motion-reduce:animate-none" />
            )}
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
          (status.kind === "error" ? "font-medium text-black" : "text-black/64")
        }
      >
        {status.text}
      </p>

      {candidates.length > 0 && (
        <ul className="mt-3 divide-y divide-black/10 border-y border-black/10">
          {candidates.map((candidate) => (
            <li key={candidate.imdbId}>
              <button
                type="button"
                className="flex w-full flex-col gap-0.5 py-3 text-left hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
                onClick={() => chooseCandidate(candidate)}
              >
                <span className="text-sm font-medium">{candidate.name}</span>
                <span className="text-sm text-black/64">
                  {candidate.description ?? candidate.year}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p id="hint" className="mt-2 text-sm leading-relaxed text-black/64">
        IMDb or TMDB ID, the full link, or a title. Example:{" "}
        <a className="font-mono text-black underline underline-offset-2" href="#id=tt1300854">
          tt1300854
        </a>
        .
      </p>

      <Toast.Provider placement="bottom" />

      <Modal.Backdrop
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        isDismissable={false}
        isKeyboardDismissDisabled={fetching}
      >
        <Modal.Container size="lg">
          <Modal.Dialog
            className="max-h-full overflow-y-auto overscroll-contain rounded-2xl border border-black/10 sm:max-w-[42rem]"
            aria-labelledby="result-title"
          >
            {result && (
              <Card variant="transparent" className="gap-0 p-0">
                <Card.Header>
                  <Card.Title
                    id="result-title"
                    className="text-2xl font-semibold tracking-tight text-balance"
                  >
                    {title}
                  </Card.Title>
                  <Card.Description className="mt-1 text-sm text-black/64 tabular-nums">
                    {meta}
                  </Card.Description>
                </Card.Header>

                <Card.Content className="mt-4">
                  {result.description && (
                    <p className="text-base leading-relaxed text-black/64 text-pretty">
                      {result.description}
                    </p>
                  )}
                  <p className="mt-4 text-sm font-medium text-black/64">
                    {resultType(result.type)}
                  </p>

                  <div className="mt-5 border-t border-black/10">
                    <Row label="IMDb">
                      <a
                        className={
                          "font-mono underline underline-offset-2" +
                          (fetching ? " pointer-events-none" : "")
                        }
                        href={`https://www.imdb.com/title/${result.id}/`}
                        target="_blank"
                        rel="noopener"
                        tabIndex={fetching ? -1 : undefined}
                      >
                        {result.id}
                      </a>
                    </Row>
                    <Separator />
                    <Row label="Provider">{result.provider}</Row>
                    <Separator />
                    <Row label="Stream URL">
                      <a
                        className={
                          "break-all font-mono underline underline-offset-2" +
                          (fetching ? " pointer-events-none" : "")
                        }
                        href={result.url}
                        target="_blank"
                        rel="noopener"
                        tabIndex={fetching ? -1 : undefined}
                      >
                        {result.url}
                      </a>
                    </Row>
                  </div>
                </Card.Content>

                <Card.Footer className="mt-5 flex-col gap-4 border-t border-black/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm leading-relaxed text-black/64 text-pretty">
                    You&apos;ll leave this site and play on{" "}
                    <strong className="font-medium text-black">{result.provider}</strong>. We
                    don&apos;t control external sites.
                  </p>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    <Button
                      variant="tertiary"
                      isDisabled={fetching}
                      className="min-h-12 rounded-lg px-4 text-sm font-medium sm:min-h-10"
                      onPress={() => handleOpenChange(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      isIconOnly
                      variant="outline"
                      aria-label="Get another stream link"
                      isDisabled={fetching}
                      className="size-12 rounded-lg sm:size-10"
                      onPress={() => void tryAnother()}
                    >
                      {fetching ? (
                        <Spinner size="sm" color="current" className="motion-reduce:animate-none" />
                      ) : (
                        <RefreshIcon />
                      )}
                    </Button>
                    <Button
                      isIconOnly
                      variant="outline"
                      aria-label="Copy link"
                      isDisabled={fetching}
                      className="size-12 rounded-lg sm:size-10"
                      onPress={() => void copyLink()}
                    >
                      <CopyIcon />
                    </Button>
                    <Button
                      isDisabled={fetching}
                      className="min-h-12 rounded-lg bg-black px-5 text-sm font-medium text-white hover:bg-black/80 sm:min-h-10"
                      onPress={watch}
                    >
                      Watch
                    </Button>
                  </div>
                </Card.Footer>
              </Card>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
