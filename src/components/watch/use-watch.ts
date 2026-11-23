import { actions } from "astro:actions";
import { toast } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { isWatchResult } from "../../lib/action-result";
import { SEARCH_FAILED } from "../../lib/messages";
import { fullLinkForId, parseTitleInput } from "../../lib/parse-input";
import type { TitleCandidate } from "../../lib/search";
import { shareUrl } from "../../lib/share";
import type { ContentType } from "../../lib/types";
import type { WatchResult } from "../../lib/types";
import { parseSharedId } from "../../lib/watch-view";

export type Phase = "idle" | "searching" | "looking" | "retrying";

export type Status =
  | { kind: "idle" }
  | { kind: "info"; text: string }
  | { kind: "loading"; text: string }
  | { kind: "error"; text: string }
  | { kind: "field"; text: string };

const MESSAGES = {
  empty: "Enter an IMDb or TMDB ID, link, or title.",
  badLink: "Use an IMDb title link or a TMDB movie or TV link.",
  searching: "Searching titles...",
  looking: "Finding a working stream...",
  retrying: "Finding another stream...",
  noTitle: "No title found. Try an ID or the full link.",
  lookupFailed: "Something went wrong. Try again.",
  noProviders: "No other providers available.",
  copyFailed: "Copy failed. Select the link text to copy it manually.",
};

function matchLabel(count: number): string {
  return `${count} ${count === 1 ? "match" : "matches"}. Choose one.`;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

// A touch device focus would open the on-screen keyboard before the user asked
// for it. Pointer media is unreliable in some emulators, so use touch points.
function canAutoFocus(): boolean {
  return navigator.maxTouchPoints === 0;
}

async function fetchWatch(id: string, kind: ContentType, exclude?: string) {
  const response = await actions.watch({ id, kind, exclude });
  if (response.error) {
    throw new Error(response.error.message);
  }
  if (!response.data) {
    throw new Error(MESSAGES.lookupFailed);
  }
  return response.data;
}

async function fetchSearch(query: string, kind: ContentType) {
  const response = await actions.search({ query, kind });
  if (response.error) {
    throw new Error(response.error.message);
  }
  if (!response.data) {
    throw new Error(SEARCH_FAILED);
  }
  return response.data;
}

export function useWatch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const currentId = useRef<string | null>(null);
  const loadingId = useRef<string | null>(null);

  const [value, setValue] = useState("");
  const [kind, setKind] = useState<ContentType>("movie");
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [candidates, setCandidates] = useState<Array<TitleCandidate>>([]);
  const [result, setResult] = useState<WatchResult | null>(null);
  const [open, setOpen] = useState(false);

  const formBusy = phase === "searching" || phase === "looking";
  const retrying = phase === "retrying";

  const run = useCallback(
    async <T>(
      next: Exclude<Phase, "idle">,
      message: string,
      fallback: string,
      task: () => Promise<T>,
    ): Promise<T | null> => {
      setPhase(next);
      setStatus({ kind: "loading", text: message });
      try {
        return await task();
      } catch (error) {
        setStatus({ kind: "error", text: messageOf(error, fallback) });
        return null;
      } finally {
        setPhase("idle");
      }
    },
    [],
  );

  const search = useCallback(
    async (query: string, searchKind: ContentType) => {
      const out = await run("searching", MESSAGES.searching, SEARCH_FAILED, () =>
        fetchSearch(query, searchKind),
      );
      if (!out) {
        return;
      }
      if (!out.ok) {
        setStatus({ kind: "error", text: SEARCH_FAILED });
        return;
      }
      if (out.candidates.length === 0) {
        setStatus({ kind: "error", text: MESSAGES.noTitle });
        return;
      }
      setCandidates(out.candidates);
      setStatus({ kind: "info", text: matchLabel(out.candidates.length) });
    },
    [run],
  );

  const lookupAndOpen = useCallback(
    async (raw: string, lookupKind: ContentType): Promise<WatchResult | null> => {
      const input = raw.trim();
      loadingId.current = input;
      try {
        const out = await run("looking", MESSAGES.looking, MESSAGES.lookupFailed, () =>
          fetchWatch(input, lookupKind),
        );
        if (!out) {
          return null;
        }
        if (!out.ok) {
          // A bare number may be a title ("1917") rather than a TMDB ID.
          if (/^[1-9]\d{0,7}$/.test(input) && out.reason === "tmdb_not_found") {
            await search(input, lookupKind);
            return null;
          }
          setStatus({ kind: "error", text: out.error });
          return null;
        }
        if (!isWatchResult(out.result)) {
          setStatus({ kind: "error", text: MESSAGES.lookupFailed });
          return null;
        }
        currentId.current = out.result.id;
        if (location.hash !== `#id=${out.result.id}`) {
          history.pushState(null, "", `#id=${out.result.id}`);
        }
        setResult(out.result);
        setOpen(true);
        setStatus({ kind: "idle" });
        return out.result;
      } finally {
        loadingId.current = null;
      }
    },
    [run, search],
  );

  async function submit(raw: string) {
    const input = raw.trim();
    if (!input) {
      setStatus({ kind: "field", text: MESSAGES.empty });
      inputRef.current?.focus();
      return;
    }

    if (!parseTitleInput(input)) {
      if (/^https?:\/\//i.test(input) || /^www\./i.test(input)) {
        setStatus({ kind: "error", text: MESSAGES.badLink });
        return;
      }
      await search(input, kind);
      return;
    }

    const data = await lookupAndOpen(input, kind);
    if (!data) {
      return;
    }
    // What the person typed stays: a pasted link is not replaced by the ID.
    // The selector follows a pasted link; bare ids leave it alone.
    if (/^https?:\/\//i.test(input) || /^www\./i.test(input)) {
      setKind(data.type);
    }
    setStatus(
      candidates.length > 0
        ? { kind: "info", text: matchLabel(candidates.length) }
        : { kind: "idle" },
    );
  }

  async function pick(candidate: TitleCandidate) {
    const data = await lookupAndOpen(candidate.imdbId, kind);
    if (!data) {
      return;
    }
    // Keep the typed title and the list: the user may pick another one.
    setStatus(
      candidates.length > 0
        ? { kind: "info", text: matchLabel(candidates.length) }
        : { kind: "idle" },
    );
  }

  async function retry() {
    if (!result || retrying) {
      return;
    }
    const retryKind: ContentType = result.type;
    const out = await run("retrying", MESSAGES.retrying, MESSAGES.noProviders, () =>
      fetchWatch(result.id, retryKind, result.provider),
    );
    if (!out) {
      return;
    }
    if (!out.ok) {
      setStatus({ kind: "error", text: out.error });
      return;
    }
    setResult(out.result);
    setStatus({ kind: "idle" });
  }

  async function copy() {
    if (!result) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl(location.origin, result.id));
      toast.success("Link copied.");
    } catch (error) {
      setStatus({ kind: "error", text: messageOf(error, MESSAGES.copyFailed) });
    }
  }

  function watch() {
    if (result) {
      window.open(result.url, "_blank", "noopener");
    }
    close();
    // The list stays behind the dialog, so keep its count with it.
    setStatus(
      candidates.length > 0
        ? { kind: "info", text: matchLabel(candidates.length) }
        : { kind: "idle" },
    );
  }

  function close() {
    setOpen(false);
    currentId.current = null;
  }

  function change(next: string) {
    setValue(next);
    setCandidates([]);
    if (status.kind === "field") {
      setStatus({ kind: "idle" });
    }
  }

  function changeKind(next: ContentType) {
    setKind(next);
    setCandidates([]);
  }

  useEffect(() => {
    const shared = parseSharedId(location.search, location.hash);
    if (shared) {
      // The URL is the source of truth on mount; the lookup below corrects it.
      // The field shows the full link, not the bare id.
      // eslint-disable-next-line react/set-state-in-effect
      setValue(fullLinkForId(shared, kind) ?? shared);
      void lookupAndOpen(shared, kind);
    } else {
      // A fast paste can land in the SSR field before hydration; the
      // controlled input would reset to "". Adopt what is already typed.
      setValue(inputRef.current?.value ?? "");
      if (canAutoFocus()) {
        inputRef.current?.focus();
      }
    }
    // Help links change only the hash, which does not reload the page.
    // Same-document clicks go through the router (popstate, no hashchange);
    // back/forward can fire both, so an id that is showing or loading is skipped.
    function handleHash() {
      const id = parseSharedId(location.search, location.hash);
      if (!id || id === currentId.current || id === loadingId.current) {
        return;
      }
      setCandidates([]);
      setValue(fullLinkForId(id, kind) ?? id);
      void lookupAndOpen(id, kind);
    }
    window.addEventListener("hashchange", handleHash);
    window.addEventListener("popstate", handleHash);
    return () => {
      window.removeEventListener("hashchange", handleHash);
      window.removeEventListener("popstate", handleHash);
    };
  }, [lookupAndOpen, kind]);

  // The input is disabled while the lookup runs, so React Aria saves `body`
  // as the element to focus on close. On desktop, send focus back to the field.
  useEffect(() => {
    if (!open && canAutoFocus()) {
      inputRef.current?.focus();
    }
  }, [open]);

  return {
    value,
    kind,
    change,
    changeKind,
    inputRef,
    status,
    invalid: status.kind === "field",
    formBusy,
    retrying,
    candidates,
    result,
    open,
    submit,
    pick,
    retry,
    copy,
    watch,
    close,
  };
}
