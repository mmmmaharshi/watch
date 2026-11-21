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
import { shareUrl } from "../lib/share";
import { unwrapActionResult } from "../lib/watch";
import type { WatchResult } from "../lib/watch";
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
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-5">
      <span className="text-xs font-semibold tracking-widest text-muted uppercase sm:w-28 sm:shrink-0 sm:pt-0.5">
        {label}
      </span>
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
  const timer = useRef<number | undefined>(undefined);

  const [value, setValue] = useState("");
  const [status, setStatus] = useState<Status>({ text: "" });
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [result, setResult] = useState<WatchResult | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  function clearTimer() {
    window.clearTimeout(timer.current);
  }

  function showError(text: string) {
    setStatus({ text, kind: "error" });
    setInvalid(true);
  }

  function showResults(data: WatchResult) {
    currentId.current = data.id;
    setResult(data);
    setIsOpen(true);
  }

  async function runLookup(raw: string) {
    const input = raw.trim();
    if (!input) {
      showError("Enter an IMDb or TMDB ID or link.");
      inputRef.current?.focus();
      clearTimer();
      timer.current = window.setTimeout(() => {
        setInvalid(false);
        setStatus({ text: "" });
      }, 2000);
      return;
    }

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
      clearTimer();
      timer.current = window.setTimeout(() => setInvalid(false), 2000);
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
      const popup = window.open(result.url, "_blank", "noopener");
      if (popup) {
        popup.opener = null;
      }
    }
    setIsOpen(false);
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
      const id = new URLSearchParams(location.hash.slice(1)).get("id");
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
      clearTimer();
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
      <form
        className="mt-12 flex gap-2 max-sm:flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          void runLookup(value);
        }}
      >
        <TextField
          className="min-w-0 flex-1"
          name="id"
          value={value}
          onChange={setValue}
          isDisabled={loading}
          isInvalid={invalid}
        >
          <Label className="sr-only">IMDb or TMDB ID or link</Label>
          <Input
            ref={inputRef}
            placeholder="IMDb or TMDB ID or link"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="go"
            aria-describedby="hint"
          />
        </TextField>
        <Button type="submit" isDisabled={loading} className="tracking-wider uppercase">
          {loading && <Spinner size="sm" color="current" />}
          Watch now
        </Button>
      </form>

      <p
        role="status"
        aria-live="polite"
        className={
          "text-center text-xs leading-relaxed " +
          (status.text ? "mt-2 " : "") +
          (status.kind === "error" ? "font-semibold text-foreground" : "text-muted")
        }
      >
        {status.text}
      </p>
      <p id="hint" className="mt-2 text-center text-xs leading-relaxed text-muted">
        IMDb or TMDB ID, or the full link. Either works. Example:{" "}
        <a className="text-foreground underline underline-offset-2" href="#id=tt1300854">
          tt1300854
        </a>
        .
      </p>

      <Toast.Provider placement="bottom" />

      <Modal.Backdrop
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        isDismissable={!fetching}
        isKeyboardDismissDisabled={fetching}
      >
        <Modal.Container size="lg">
          <Modal.Dialog className="sm:max-w-2xl" aria-label={title}>
            {result && (
              <Card variant="transparent" className="gap-0 p-0">
                <Card.Header>
                  <Card.Title className="text-2xl font-semibold tracking-tight text-balance">
                    {title}
                  </Card.Title>
                  <Card.Description className="mt-1 tabular-nums">{meta}</Card.Description>
                </Card.Header>

                <Card.Content className="mt-4">
                  {result.description && (
                    <p className="text-sm leading-relaxed text-muted text-pretty">
                      {result.description}
                    </p>
                  )}
                  <p className="mt-3 text-xs font-semibold tracking-widest text-muted uppercase">
                    {resultType(result.type)}
                  </p>

                  <div className="mt-5 border-t border-separator">
                    <Row label="IMDb">
                      <a
                        className="underline underline-offset-2"
                        href={`https://www.imdb.com/title/${result.id}/`}
                        target="_blank"
                        rel="noopener"
                      >
                        {result.id}
                      </a>
                    </Row>
                    <Separator />
                    <Row label="Provider">{result.provider}</Row>
                    <Separator />
                    <Row label="Stream URL">
                      <a
                        className="break-all underline underline-offset-2"
                        href={result.url}
                        target="_blank"
                        rel="noopener"
                      >
                        {result.url}
                      </a>
                    </Row>
                  </div>
                </Card.Content>

                <Card.Footer className="mt-4 flex-col items-stretch gap-4 border-t border-separator pt-4">
                  <p className="text-xs leading-relaxed text-muted text-pretty">
                    You&apos;ll leave this site and play on{" "}
                    <strong className="font-semibold text-foreground">{result.provider}</strong>. We
                    don&apos;t control external sites.
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="tertiary"
                      isDisabled={fetching}
                      onPress={() => handleOpenChange(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      isIconOnly
                      variant="secondary"
                      aria-label="Get another stream link"
                      isDisabled={fetching}
                      onPress={() => void tryAnother()}
                    >
                      {fetching ? <Spinner size="sm" color="current" /> : <RefreshIcon />}
                    </Button>
                    <Button
                      isIconOnly
                      variant="secondary"
                      aria-label="Copy link"
                      isDisabled={fetching}
                      onPress={() => void copyLink()}
                    >
                      <CopyIcon />
                    </Button>
                    <Button isDisabled={fetching} onPress={watch}>
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
