import { actions } from "astro:actions";
import { addRecent, parseRecent } from "../lib/recent";
import { shareUrl } from "../lib/share";
import { isRecord, isWatchResult } from "../lib/watch";
import type { WatchResult as WatchData } from "../lib/watch";

function reqEl(id: "form"): HTMLFormElement;
function reqEl(id: "imdb"): HTMLInputElement;
function reqEl(
  id: "go" | "modal-copy" | "modal-cancel" | "modal-try-another" | "modal-watch",
): HTMLButtonElement;
function reqEl(id: "modal"): HTMLDialogElement;
function reqEl(id: "modal-url-text" | "modal-imdb"): HTMLAnchorElement;
function reqEl(id: string): HTMLElement;
function reqEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`missing element #${id}`);
  }
  return el;
}

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

const form = reqEl("form");
const input = reqEl("imdb");
const btn = reqEl("go");
const status = reqEl("status");
const modal = reqEl("modal");
const modalMeta = reqEl("modal-meta");
const modalDescription = reqEl("modal-description");
const modalType = reqEl("modal-type");
const modalProvider = reqEl("modal-provider");
const modalUrlText = reqEl("modal-url-text");
const modalImdb = reqEl("modal-imdb");
const modalCopy = reqEl("modal-copy");
const modalCancel = reqEl("modal-cancel");
const modalTryAnother = reqEl("modal-try-another");
const modalWatch = reqEl("modal-watch");
const modalWarningProvider = reqEl("modal-warning-provider");

// The ID rides in the hash so a shared link never creates a second URL for
// search engines to index. The query form is still read for older links.
const params = new URLSearchParams(location.search || location.hash.slice(1));
const sharedId = params.get("id");
if (sharedId) {
  input.value = sharedId;
}

let pendingStreamUrl: string | null = null;
let currentProvider: string | null = null;
let currentId: string | null = null;
let isFetching = false;
let loadingId: string | null = null;

const RECENT_KEY = "watch.recent";

// Dev-only worst-case fixtures for the break-ui pass. Only reachable on a dev
// build (import.meta.env.DEV is replaced at compile time), driven by
// ?data=worst|sparse|error. Shaped exactly like the action result.
const WORST: WatchData = {
  id: "tt0281583",
  url: "https://vidsrc.in/embed/movie/tt0281583?autoPlay=false&sub_url=https%3A%2F%2Fexample.com%2Fsubs%2Fborat-cultural-learnings-of-america-for-make-benefit-glorious-nation-of-kazakhstan.srt&ds_lang=en",
  provider: "vidsrc.in",
  type: "movie",
  name: "Borat: Cultural Learnings of America for Make Benefit Glorious Nation of Kazakhstan",
  year: "2006",
  rating: "7.4",
  description:
    "A journalist from Kazakhstan travels across America to learn its customs, filming every misunderstanding along the way. His producer follows with a live bear, a bag of ice, and no plan whatsoever, which turns a simple documentary into a cross-country chase full of awkward encounters, broken hotel rooms, and lessons nobody asked for. Along the way he discovers rodeos, etiquette classes, and a swimsuit contest that changes the entire purpose of the trip. The footage that survives is chaotic, frequently unusable, and somehow exactly the story he set out to tell.",
};

const SPARSE: WatchData = {
  id: "tt0133093",
  url: "https://vidsrc.in/embed/movie/tt0133093",
  provider: "vidsrc.in",
  type: "movie",
  name: "The Matrix",
};

function devFixture(): { data?: WatchData; error?: string } | null {
  if (!import.meta.env.DEV) {
    return null;
  }
  const kind = new URLSearchParams(location.search).get("data");
  if (kind === "worst") {
    return { data: { ...WORST } };
  }
  if (kind === "sparse") {
    return { data: { ...SPARSE } };
  }
  if (kind === "error") {
    return { error: "No working providers available" };
  }
  return null;
}

async function lookup(value: string, exclude?: string): Promise<WatchData> {
  if (import.meta.env.DEV) {
    const fixture = devFixture();
    if (fixture) {
      if (fixture.error) {
        throw new Error(fixture.error);
      }
      if (fixture.data) {
        return fixture.data;
      }
    }
  }
  // astro:actions is a virtual module that tsrs resolves as any. Narrow the
  // result through runtime guards before it enters typed code.
  const result: unknown = await actions.watch({ id: value, exclude });
  if (!isRecord(result)) {
    throw new Error("Something went wrong. Try again.");
  }
  if (isRecord(result.error)) {
    const message = result.error.message;
    throw new Error(typeof message === "string" ? message : "Something went wrong. Try again.");
  }
  if (!isWatchResult(result)) {
    throw new Error("Something went wrong. Try again.");
  }
  return result;
}
const recent = reqEl("recent");

function setStatus(text: string, type?: "loading" | "error") {
  status.textContent = text;
  status.className = type ? `status ${type}` : "status";
}

function setLoading(loading: boolean) {
  btn.disabled = loading;
  btn.classList.toggle("loading", loading);
  input.classList.toggle("loading", loading);
  input.disabled = loading;
  if (loading) {
    input.blur();
  }
}

function setModalFetching(fetching: boolean) {
  isFetching = fetching;
  modalTryAnother.classList.toggle("loading", fetching);
  modalCancel.disabled = fetching;
  modalCopy.disabled = fetching;
  modalWatch.disabled = fetching;
  modalTryAnother.disabled = fetching;
  [modalImdb, modalUrlText].forEach((a) => (a.style.pointerEvents = fetching ? "none" : ""));
}

function showModal(data: WatchData) {
  pendingStreamUrl = data.url;
  currentProvider = data.provider;
  currentId = data.id;
  const title = data.name || data.id.toUpperCase();
  const bits = [data.year, data.rating ? `★ ${data.rating}` : null].filter(Boolean).join(" · ");
  modalMeta.textContent = title + (bits ? ` — ${bits}` : "");
  if (data.description) {
    modalDescription.textContent = data.description;
    modalDescription.style.display = "block";
  } else {
    modalDescription.style.display = "none";
  }
  modalType.textContent = data.type === "tv" ? "TV Show" : "Movie";
  modalProvider.textContent = data.provider;
  modalWarningProvider.textContent = data.provider;
  modalImdb.href = `https://www.imdb.com/title/${data.id}/`;
  modalImdb.textContent = `https://www.imdb.com/title/${data.id}/`;
  modalUrlText.href = data.url;
  modalUrlText.textContent = data.url;
  modalCopy.classList.remove("copied");
  if (!modal.open) {
    modal.showModal();
  }
  modalCancel.focus();
}

function hideModal() {
  if (modal.open) {
    modal.close();
  }
  pendingStreamUrl = null;
  currentProvider = null;
  currentId = null;
}

async function onCopy(): Promise<void> {
  if (!currentId) {
    return;
  }
  try {
    await navigator.clipboard.writeText(shareUrl(location.origin, currentId));
    modalCopy.classList.add("copied");
    setTimeout(() => modalCopy.classList.remove("copied"), 2000);
  } catch (error) {
    setStatus(errMessage(error, "Copy failed. Select the link text to copy it manually."), "error");
  }
}

modalCopy.addEventListener("click", () => {
  void onCopy();
});

modalCancel.addEventListener("click", hideModal);
modalWatch.addEventListener("click", () => {
  if (pendingStreamUrl) {
    const popup = window.open(pendingStreamUrl, "_blank", "noopener");
    if (popup) {
      popup.opener = null;
    }
  }
  hideModal();
  setStatus("");
});

async function onTryAnother(): Promise<void> {
  if (!currentId || !currentProvider || isFetching) {
    return;
  }
  setModalFetching(true);
  setStatus("Finding another stream...", "loading");
  try {
    const data = await lookup(currentId, currentProvider);
    showModal(data);
    setStatus("");
  } catch (error) {
    setStatus(errMessage(error, "No other providers available."), "error");
  } finally {
    setModalFetching(false);
  }
}

modalTryAnother.addEventListener("click", () => {
  void onTryAnother();
});

// Esc during a fetch would drop the open dialog, so block it until done.
modal.addEventListener("cancel", (e) => {
  if (isFetching) {
    e.preventDefault();
  }
});

async function go() {
  const value = input.value.trim();
  if (!value) {
    setStatus("Enter an IMDb or TMDB ID or link.", "error");
    input.setAttribute("aria-invalid", "true");
    input.focus();
    input.classList.add("error");
    setTimeout(() => {
      input.classList.remove("error");
      setStatus("");
    }, 2000);
    return;
  }

  setLoading(true);
  loadingId = value;
  setStatus("Finding a working stream...", "loading");

  try {
    const data = await lookup(value);
    // The server answers with the canonical ID, whether an ID or a link went in.
    input.value = data.id;
    input.setAttribute("aria-invalid", "false");
    input.classList.remove("error");
    if (location.hash !== `#id=${data.id}`) {
      history.pushState(null, "", `#id=${data.id}`);
    }
    setStatus("");
    showModal(data);
    saveRecent(data.id, data.name);
  } catch (error) {
    setStatus(errMessage(error, "Something went wrong. Try again."), "error");
    input.setAttribute("aria-invalid", "true");
    input.classList.add("error");
    setTimeout(() => input.classList.remove("error"), 2000);
  } finally {
    loadingId = null;
    setLoading(false);
  }
}

const storedRecent = () => parseRecent(localStorage.getItem(RECENT_KEY));

function saveRecent(id: string, name?: string) {
  const list = addRecent(storedRecent(), { id, name });
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Storage blocked or full — the list is a convenience, not a requirement.
  }
  renderRecent();
}

// Built with createElement/textContent: names come from a third-party API.
function renderRecent() {
  const items = storedRecent();
  recent.hidden = items.length === 0;
  recent.replaceChildren();
  if (!items.length) {
    return;
  }
  recent.append("Recent: ");
  items.forEach((item, i) => {
    if (i) {
      recent.append(" · ");
    }
    const link = document.createElement("a");
    link.href = `#id=${encodeURIComponent(item.id)}`;
    link.textContent = item.name || item.id;
    recent.append(link);
  });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  void go();
});

renderRecent();

// Dev-only dataset switch for the break-ui pass. Fixed chrome, not part of the
// design. The choice rides in ?data=, so a reload keeps the selection.
if (import.meta.env.DEV) {
  const kinds = ["demo", "worst", "sparse", "error"] as const;
  const active = new URLSearchParams(location.search).get("data") ?? "demo";
  if (active === "worst") {
    try {
      localStorage.setItem(
        RECENT_KEY,
        JSON.stringify([
          {
            id: "tt0281583",
            name: "Borat: Cultural Learnings of America for Make Benefit Glorious Nation of Kazakhstan",
          },
          { id: "tt0468569", name: "The Dark Knight" },
          { id: "tt0111161", name: "The Shawshank Redemption" },
          { id: "tt0903747", name: "Breaking Bad" },
          { id: "tt0133093", name: "The Matrix" },
        ]),
      );
    } catch {
      // Seed data is a convenience, not a requirement.
    }
    renderRecent();
  }
  const bar = document.createElement("nav");
  bar.setAttribute("aria-label", "Fixture data");
  bar.style.cssText =
    "position:fixed;left:50%;bottom:12px;transform:translateX(-50%);display:flex;gap:4px;padding:4px;border-radius:999px;background:#333;color:#fff;font:12px system-ui;z-index:9999;";
  for (const kind of kinds) {
    const b = document.createElement("button");
    b.textContent = kind;
    b.style.cssText = `border:0;border-radius:999px;padding:4px 10px;cursor:pointer;background:${active === kind ? "#fff" : "transparent"};color:${active === kind ? "#000" : "#fff"};font:inherit;`;
    b.addEventListener("click", () => {
      const url = new URL(location.href);
      if (kind === "demo") {
        url.searchParams.delete("data");
      } else {
        url.searchParams.set("data", kind);
      }
      location.href = url.toString();
    });
    bar.append(b);
  }
  document.body.append(bar);
}
// A shared link such as /#id=tt0133093 (or a whole IMDb link) loads right away.
if (params.get("id")) {
  void go();
} else {
  input.focus();
}
// Help and recent links change only the hash, which does not reload the page.
// Same-document clicks go through the router (popstate, no hashchange);
// back/forward can fire both, so an id that is showing or loading is skipped.
function handleHash() {
  const shared = new URLSearchParams(location.hash.slice(1)).get("id");
  if (!shared || shared === currentId || shared === loadingId) {
    return;
  }
  input.value = shared;
  void go();
}
window.addEventListener("hashchange", handleHash);
window.addEventListener("popstate", handleHash);
