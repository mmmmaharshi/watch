import { addRecent, parseRecent } from "../lib/recent";

interface WatchData {
  id: string;
  url: string;
  provider: string;
  type: string;
  name?: string;
  year?: string;
  rating?: string;
  description?: string;
}

const form = document.getElementById("form") as HTMLFormElement;
const main = document.querySelector("main") as HTMLElement;
const input = document.getElementById("imdb") as HTMLInputElement;
const btn = document.getElementById("go") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLElement;
const modal = document.getElementById("modal") as HTMLElement;
const modalMeta = document.getElementById("modal-meta") as HTMLElement;
const modalDescription = document.getElementById("modal-description") as HTMLElement;
const modalType = document.getElementById("modal-type") as HTMLElement;
const modalProvider = document.getElementById("modal-provider") as HTMLElement;
const modalUrlText = document.getElementById("modal-url-text") as HTMLAnchorElement;
const modalImdb = document.getElementById("modal-imdb") as HTMLAnchorElement;
const modalCopy = document.getElementById("modal-copy") as HTMLButtonElement;
const modalCancel = document.getElementById("modal-cancel") as HTMLButtonElement;
const modalTryAnother = document.getElementById("modal-try-another") as HTMLButtonElement;
const modalWatch = document.getElementById("modal-watch") as HTMLButtonElement;
const modalWarningProvider = document.getElementById("modal-warning-provider") as HTMLElement;

// The ID rides in the hash so a shared link never creates a second URL for
// search engines to index. The query form is still read for older links.
const params = new URLSearchParams(location.search || location.hash.slice(1));
if (params.get("id")) input.value = params.get("id") as string;

let pendingStreamUrl: string | null = null;
let currentProvider: string | null = null;
let currentId: string | null = null;
let isFetching = false;
let focusedElementBeforeModal: Element | null = null;

const RECENT_KEY = "watch.recent";
const recent = document.getElementById("recent") as HTMLElement;

function setStatus(text: string, type: string) {
  status.textContent = text;
  status.className = type ? `status ${type}` : "status";
}

function setLoading(loading: boolean) {
  btn.disabled = loading;
  btn.classList.toggle("loading", loading);
  input.classList.toggle("loading", loading);
  input.disabled = loading;
  if (loading) input.blur();
}

function setModalFetching(fetching: boolean) {
  isFetching = fetching;
  modalTryAnother.classList.toggle("loading", fetching);
  modalCancel.disabled = fetching;
  modalCopy.disabled = fetching;
  modalWatch.disabled = fetching;
  modalTryAnother.disabled = fetching;
  [modalImdb, modalUrlText].forEach(a => (a.style.pointerEvents = fetching ? "none" : ""));
  (main as HTMLElement & { inert: boolean }).inert = fetching || modal.classList.contains("active");
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
  modal.classList.add("active");
  (main as HTMLElement & { inert: boolean }).inert = true;
  trapFocus();
}

function hideModal() {
  modal.classList.remove("active");
  pendingStreamUrl = null;
  currentProvider = null;
  currentId = null;
  (main as HTMLElement & { inert: boolean }).inert = false;
  releaseFocus();
}

function trapFocus() {
  focusedElementBeforeModal = document.activeElement;
  const focusable = modal.querySelectorAll("button:not([disabled]), input:not([disabled]), [tabindex]");
  if (focusable.length) (focusable[0] as HTMLElement).focus();
  modal.addEventListener("keydown", handleFocusTrap);
}

function releaseFocus() {
  modal.removeEventListener("keydown", handleFocusTrap);
  if (focusedElementBeforeModal) (focusedElementBeforeModal as HTMLElement).focus();
}

function handleFocusTrap(e: Event) {
  const ke = e as KeyboardEvent;
  if (ke.key !== "Tab") return;
  const focusable = modal.querySelectorAll("button:not([disabled]), input:not([disabled]), [tabindex]");
  const first = focusable[0] as HTMLElement;
  const last = focusable[focusable.length - 1] as HTMLElement;
  if (ke.shiftKey && document.activeElement === first) {
    ke.preventDefault();
    last.focus();
  } else if (!ke.shiftKey && document.activeElement === last) {
    ke.preventDefault();
    first.focus();
  }
}

modalCopy.addEventListener("click", async () => {
  if (!pendingStreamUrl) return;
  try {
    await navigator.clipboard.writeText(pendingStreamUrl);
    modalCopy.classList.add("copied");
    setTimeout(() => modalCopy.classList.remove("copied"), 2000);
  } catch (err) {
    console.error("Failed to copy:", err);
  }
});

modalCancel.addEventListener("click", hideModal);
modalWatch.addEventListener("click", () => {
  if (pendingStreamUrl) window.open(pendingStreamUrl, "_blank");
  hideModal();
  setStatus("", "");
});

modalTryAnother.addEventListener("click", async () => {
  if (!currentId || isFetching) return;
  setModalFetching(true);
  setStatus("Finding another stream...", "loading");
  try {
    const res = await fetch(`/api/watch?id=${encodeURIComponent(currentId)}&exclude=${encodeURIComponent(currentProvider as string)}`);
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error);
    }
    const data = await res.json();
    showModal({ ...data, id: currentId });
    setStatus("", "");
  } catch (err) {
    setStatus((err as Error).message || "No other providers available.", "error");
  } finally {
    setModalFetching(false);
    (main as HTMLElement & { inert: boolean }).inert = true;
  }
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && modal.classList.contains("active") && !isFetching) hideModal();
});

async function go() {
  const value = input.value.trim();
  if (!value) {
    setStatus("Enter an IMDB ID or an IMDb link.", "error");
    input.setAttribute("aria-invalid", "true");
    input.focus();
    input.classList.add("error");
    setTimeout(() => {
      input.classList.remove("error");
      setStatus("", "");
    }, 2000);
    return;
  }

  setLoading(true);
  setStatus("Finding a working stream...", "loading");

  try {
    const res = await fetch(`/api/watch?id=${encodeURIComponent(value)}`);
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error);
    }
    const data = await res.json();
    // The server answers with the canonical ID, whether an ID or a link went in.
    input.value = data.id;
    input.setAttribute("aria-invalid", "false");
    input.classList.remove("error");
    if (location.hash !== `#id=${data.id}`) history.pushState(null, "", `#id=${data.id}`);
    setStatus("", "");
    showModal(data);
    saveRecent(data.id, data.name);
  } catch (err) {
    setStatus((err as Error).message || "Something went wrong. Try again.", "error");
    input.setAttribute("aria-invalid", "true");
    input.classList.add("error");
    setTimeout(() => input.classList.remove("error"), 2000);
  } finally {
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
  if (!items.length) return;
  recent.append("Recent: ");
  items.forEach((item, i) => {
    if (i) recent.append(" · ");
    const link = document.createElement("a");
    link.href = `#id=${encodeURIComponent(item.id)}`;
    link.textContent = item.name || item.id;
    recent.appendChild(link);
  });
}

form.addEventListener("submit", e => {
  e.preventDefault();
  go();
});

renderRecent();
// A shared link such as /#id=tt0133093 (or a whole IMDb link) loads right away.
if (params.get("id")) go();
else input.focus();
// Recent and help links change only the hash, which does not reload the page.
window.addEventListener("hashchange", () => {
  const shared = new URLSearchParams(location.hash.slice(1)).get("id");
  if (!shared || shared === currentId) return;
  input.value = shared;
  go();
});
