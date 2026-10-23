// The page and its browser module, inlined as strings.
//
// Vercel bundles this function with Rolldown, which has no loader for .html or
// any other asset, so the page cannot be read from disk at runtime or imported
// as a file. The text ships inside the bundle instead.
//
// Escaping rule: a literal backtick or dollar-brace in the page must be
// escaped as it would be in any template literal, or this module fails to
// parse and `bun test` says so immediately.

export const SITE_URL = "https://watch.maharshi.work";

export const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Watch Movies and TV Shows Online — Paste an IMDb ID</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polygon points='5 3 19 12 5 21 5 3'/></svg>">
<link rel="canonical" href="${SITE_URL}/">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist+Pixel&display=swap" rel="stylesheet">
<meta name="description" content="Paste an IMDb ID or an IMDb link to find a working stream for any movie or TV show. No sign-up, no app, just a click to play.">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Watch">
<meta property="og:title" content="Watch Movies and TV Shows Online — Paste an IMDb ID">
<meta property="og:description" content="Paste an IMDb ID or an IMDb link to find a working stream for any movie or TV show.">
<meta property="og:url" content="${SITE_URL}/">
<meta property="og:image" content="${SITE_URL}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Watch movies and TV shows online — paste an IMDb ID or link.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Watch Movies and TV Shows Online — Paste an IMDb ID">
<meta name="twitter:description" content="Paste an IMDb ID or an IMDb link to find a working stream for any movie or TV show.">
<style>
  :root {
    --canvas: #0A0A0A;
    --ink: #FFFFFF;
    --ink-secondary: rgb(255 255 255 / 56%);
    --ink-tertiary: rgb(255 255 255 / 36%);
    --border: rgb(255 255 255 / 10%);
    --border-strong: rgb(255 255 255 / 18%);
    --fill-hover: rgb(255 255 255 / 9%);
    --fill-pressed: rgb(255 255 255 / 14%);
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body { height: 100%; }

  body {
    font-family: 'Geist Pixel', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    font-size: 16px;
    line-height: 1.5;
    background: var(--canvas);
    color: var(--ink);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .container {
    width: 100%;
    max-width: 480px;
  }

  .header {
    margin-bottom: 48px;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 500;
    letter-spacing: -0.01em;
    line-height: 1.2;
  }

  .subtitle {
    color: var(--ink-secondary);
    margin-top: 8px;
  }

  .form-group {
    display: flex;
    align-items: stretch;
  }

  input {
    flex: 1;
    padding: 16px 20px;
    font-size: 1rem;
    font-family: inherit;
    font-weight: 400;
    border: 1px solid var(--border-strong);
    border-radius: 8px 0 0 8px;
    background: var(--canvas);
    color: var(--ink);
    outline: none;
    min-width: 0;
    transition: border-color 0.15s ease;
  }

  input::placeholder {
    color: var(--ink-tertiary);
  }

  input:focus {
    border-color: var(--ink);
  }

  input.loading {
    border-color: var(--ink);
    animation: pulse 0.8s infinite alternate;
  }

  @keyframes pulse {
    to { border-color: var(--border-strong); }
  }

  button {
    padding: 16px 24px;
    font-size: 1rem;
    font-family: inherit;
    font-weight: 500;
    border: 1px solid var(--ink);
    border-radius: 0 8px 8px 0;
    background: var(--ink);
    color: var(--canvas);
    cursor: pointer;
    transition: background 0.15s ease, transform 0.1s ease;
    white-space: nowrap;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: 120px;
  }

  button:hover {
    background: var(--ink-secondary);
    border-color: var(--ink-secondary);
  }

  button:active {
    transform: scale(0.98);
  }

  button:disabled {
    background: var(--ink-tertiary);
    border-color: var(--ink-tertiary);
    cursor: wait;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--canvas);
    border-top-color: transparent;
    border-radius: 50%;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  button.loading .spinner {
    opacity: 1;
    animation: spin 0.7s linear infinite;
  }

  button.loading .btn-text {
    opacity: 0.7;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .status {
    margin-top: 16px;
    font-size: 0.875rem;
    min-height: 1.5rem;
    transition: opacity 0.2s ease;
  }

  .status.loading {
    color: var(--ink-tertiary);
  }

  .status.error {
    color: var(--ink-secondary);
  }

  .help {
    margin-top: 8px;
    color: var(--ink-tertiary);
    font-size: 0.875rem;
  }

  .help a {
    color: var(--ink-secondary);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .help a:hover {
    color: var(--ink);
  }

  .disclaimer {
    margin-top: 16px;
    color: var(--ink-tertiary);
    font-size: 0.75rem;
    line-height: 1.5;
  }

  @media (max-width: 480px) {
    .container {
      max-width: 100%;
    }

    .header {
      margin-bottom: 32px;
    }

    .disclaimer {
      margin-top: 24px;
      font-size: 0.75rem;
    }

    .form-group {
      flex-direction: column;
      gap: 0;
    }

    input {
      border-radius: 8px 8px 0 0;
      border-right: 1px solid var(--border-strong);
      border-bottom: none;
    }

    .form-group button {
      border-radius: 0 0 8px 8px;
      border-top: none;
    }

    .modal {
      padding: 20px;
      max-width: 100%;
    }

    .modal .detail {
      flex-direction: row;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 0;
    }

    .modal .detail-label {
      flex: 0 0 auto;
      white-space: nowrap;
    }

    .modal .detail-value {
      flex: 1 1 auto;
      min-width: 0;
      max-width: none;
      text-align: right;
      justify-content: flex-end;
      overflow-wrap: anywhere;
      font-size: 0.8rem;
    }

    .modal .actions {
      flex-direction: row;
      flex-wrap: nowrap;
      gap: 8px;
    }

    .modal .btn-secondary,
    .modal .btn-primary {
      width: auto;
      min-width: 0;
      flex: 1 1 auto;
      padding: 12px 8px;
      font-size: 0.8rem;
    }

    .modal .btn-secondary.icon {
      width: 44px;
      height: 44px;
      flex: 0 0 auto;
      padding: 0;
    }
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 64%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.2s ease, visibility 0.2s ease;
  }

  .modal-overlay.active {
    opacity: 1;
    visibility: visible;
  }

  .modal {
    background: var(--canvas);
    border: 1px solid var(--border-strong);
    border-radius: 12px;
    padding: 32px;
    width: 100%;
    max-width: 400px;
  }

  .modal h2 {
    font-size: 1.25rem;
    font-weight: 500;
    margin-bottom: 8px;
  }

  .modal .meta {
    color: var(--ink-secondary);
    font-size: 0.875rem;
    margin-bottom: 24px;
  }

  .modal-description {
    color: var(--ink-secondary);
    font-size: 0.875rem;
    line-height: 1.5;
    margin: 16px 0 8px;
  }

  .modal .detail {
    display: flex;
    justify-content: space-between;
    padding: 12px 0;
    border-top: 1px solid var(--border);
  }

  .modal .detail:first-of-type {
    border-top: none;
  }

  .modal .detail-label {
    color: var(--ink-tertiary);
    font-size: 0.875rem;
  }

  .modal .detail-value {
    font-size: 0.875rem;
    text-align: right;
    word-break: break-all;
    max-width: 60%;
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: flex-end;
  }

  .modal .warning {
    margin-top: 16px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 0.875rem;
    color: var(--ink-secondary);
  }

  .modal .warning strong {
    color: var(--ink);
  }

  .modal .detail-value a {
    color: inherit;
    text-decoration: none;
  }

  .modal .detail-value a:hover {
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .modal .btn-secondary.icon.copied {
    color: #22c55e;
    border-color: #22c55e;
  }


  .modal .actions {
    display: flex;
    gap: 8px;
    margin-top: 24px;
    flex-wrap: nowrap;
  }

  .modal .btn-secondary {
    flex: 1 1 auto;
    padding: 12px 16px;
    font-size: 0.875rem;
    font-family: inherit;
    font-weight: 500;
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    background: transparent;
    color: var(--ink);
    cursor: pointer;
    transition: background 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: fit-content;
  }

  .modal .btn-secondary.icon svg {
    transition: transform 0.2s ease;
  }

  .modal .btn-secondary.icon.loading svg {
    animation: spin 0.7s linear infinite;
  }

  .modal .btn-primary {
    flex: 1 1 auto;
    padding: 12px 16px;
    font-size: 0.875rem;
    font-family: inherit;
    font-weight: 500;
    border: 1px solid var(--ink);
    border-radius: 8px;
    background: var(--ink);
    color: var(--canvas);
    cursor: pointer;
    transition: background 0.15s ease;
    min-width: fit-content;
  }

  .modal .btn-secondary:hover {
    background: var(--fill-hover);
  }

  .modal .btn-primary:hover {
    background: var(--ink-secondary);
  }

  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
</head>
<body>
  <main class="container">
    <header class="header">
      <h1>Watch movies and TV shows online</h1>
      <p class="subtitle">Paste an IMDb ID or an IMDb link to start.</p>
    </header>

    <form class="form-group" id="form">
      <input type="text" id="imdb" placeholder="IMDB ID or link" autocomplete="off" spellcheck="false" aria-label="IMDB ID or link">
      <button type="submit" id="go">
        <span class="spinner"></span>
        <span class="btn-text">Watch now</span>
      </button>
    </form>

    <p class="status" id="status" role="status" aria-live="polite"></p>
    <p class="help">Enter an IMDb ID, e.g. <a href="#id=tt1300854">tt1300854</a> — or paste an IMDb link.</p>
    <p class="help" id="recent"></p>
    <p class="disclaimer">We don't host anything — we only link to third-party providers. Check the URL before playing. Prefer an ad blocker for safety.</p>
  </main>

  <div class="modal-overlay" id="modal">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <h2 id="modal-title">Stream Found</h2>
      <p class="meta" id="modal-meta"></p>
      <p class="modal-description" id="modal-description" style="display: none;"></p>
      <div class="detail">
        <span class="detail-label">Type</span>
        <span class="detail-value" id="modal-type"></span>
      </div>
      <div class="detail">
        <span class="detail-label">Provider</span>
        <span class="detail-value" id="modal-provider"></span>
      </div>
      <div class="detail">
        <span class="detail-label">IMDB</span>
        <span class="detail-value"><a id="modal-imdb" href="#" target="_blank" rel="noopener"></a></span>
      </div>
      <div class="detail">
        <span class="detail-label">Stream URL</span>
        <span class="detail-value"><a id="modal-url-text" href="#" target="_blank" rel="noopener"></a></span>
      </div>
      <div class="warning">
        <span>You'll leave this site and play on </span>
        <strong id="modal-warning-provider"></strong>
        <span>. We don't control external sites.</span>
      </div>
      <div class="actions">
        <button class="btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn-secondary icon" id="modal-try-another" title="Get another stream link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8"/>
            <path d="M21 3v5h-5"/>
          </svg>
        </button>
        <button class="btn-secondary icon" id="modal-copy" title="Copy URL">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
        <button class="btn-primary" id="modal-watch">Watch</button>
      </div>
    </div>
  </div>

<script type="module">
import { addRecent, parseRecent } from './recent.js';

const form = document.getElementById('form');
const main = document.querySelector('main');
const input = document.getElementById('imdb');
const btn = document.getElementById('go');
const status = document.getElementById('status');
const modal = document.getElementById('modal');
const modalMeta = document.getElementById('modal-meta');
const modalDescription = document.getElementById('modal-description');
const modalType = document.getElementById('modal-type');
const modalProvider = document.getElementById('modal-provider');
const modalUrlText = document.getElementById('modal-url-text');
const modalImdb = document.getElementById('modal-imdb');
const modalCopy = document.getElementById('modal-copy');
const modalCancel = document.getElementById('modal-cancel');
const modalTryAnother = document.getElementById('modal-try-another');
const modalWatch = document.getElementById('modal-watch');
const modalWarningProvider = document.getElementById('modal-warning-provider');

// The ID rides in the hash so a shared link never creates a second URL for
// search engines to index. The query form is still read for older links.
const params = new URLSearchParams(location.search || location.hash.slice(1));
if (params.get('id')) input.value = params.get('id');

let pendingStreamUrl = null;
let currentProvider = null;
let currentId = null;
let isFetching = false;
let focusedElementBeforeModal = null;

const RECENT_KEY = 'watch.recent';
const recent = document.getElementById('recent');

function setStatus(text, type) {
  status.textContent = text;
  status.className = type ? \`status \${type}\` : 'status';
}

function setLoading(loading) {
  btn.disabled = loading;
  btn.classList.toggle('loading', loading);
  input.classList.toggle('loading', loading);
  input.disabled = loading;
  if (loading) input.blur();
}

function setModalFetching(fetching) {
  isFetching = fetching;
  modalTryAnother.classList.toggle('loading', fetching);
  modalCancel.disabled = fetching;
  modalCopy.disabled = fetching;
  modalWatch.disabled = fetching;
  modalTryAnother.disabled = fetching;
  [modalImdb, modalUrlText].forEach(a => a.style.pointerEvents = fetching ? 'none' : '');
  main.inert = fetching || modal.classList.contains('active');
}

function showModal(data) {
  pendingStreamUrl = data.url;
  currentProvider = data.provider;
  currentId = data.id;
  const title = data.name || data.id.toUpperCase();
  const bits = [data.year, data.rating ? \`★ \${data.rating}\` : null].filter(Boolean).join(' · ');
  modalMeta.textContent = title + (bits ? \` — \${bits}\` : '');
  if (data.description) {
    modalDescription.textContent = data.description;
    modalDescription.style.display = 'block';
  } else {
    modalDescription.style.display = 'none';
  }
  modalType.textContent = data.type === 'tv' ? 'TV Show' : 'Movie';
  modalProvider.textContent = data.provider;
  modalWarningProvider.textContent = data.provider;
  modalImdb.href = \`https://www.imdb.com/title/\${data.id}/\`;
  modalImdb.textContent = \`https://www.imdb.com/title/\${data.id}/\`;
  modalUrlText.href = data.url;
  modalUrlText.textContent = data.url;
  modalCopy.classList.remove('copied');
  modal.classList.add('active');
  main.inert = true;
  trapFocus();
}

function hideModal() {
  modal.classList.remove('active');
  pendingStreamUrl = null;
  currentProvider = null;
  currentId = null;
  main.inert = false;
  releaseFocus();
}

function trapFocus() {
  focusedElementBeforeModal = document.activeElement;
  const focusable = modal.querySelectorAll('button, input, [tabindex]');
  if (focusable.length) focusable[0].focus();
  
  modal.addEventListener('keydown', handleFocusTrap);
}

function releaseFocus() {
  modal.removeEventListener('keydown', handleFocusTrap);
  if (focusedElementBeforeModal) focusedElementBeforeModal.focus();
}

function handleFocusTrap(e) {
  if (e.key !== 'Tab') return;
  const focusable = modal.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]');
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

modalCopy.addEventListener('click', async () => {
  if (!pendingStreamUrl) return;
  try {
    await navigator.clipboard.writeText(pendingStreamUrl);
    modalCopy.classList.add('copied');
    setTimeout(() => modalCopy.classList.remove('copied'), 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
});

modalCancel.addEventListener('click', hideModal);
modalWatch.addEventListener('click', () => {
  if (pendingStreamUrl) window.open(pendingStreamUrl, '_blank');
  hideModal();
  setStatus('', '');
});

modalTryAnother.addEventListener('click', async () => {
  if (!currentId || isFetching) return;
  setModalFetching(true);
  setStatus('Finding another stream...', 'loading');
  try {
    const res = await fetch(\`/api/watch?id=\${encodeURIComponent(currentId)}&exclude=\${encodeURIComponent(currentProvider)}\`);
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const data = await res.json();
    showModal({ ...data, id: currentId });
    setStatus('', '');
  } catch (err) {
    setStatus(err.message || 'No other providers available.', 'error');
  } finally {
    setModalFetching(false);
    main.inert = true;
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modal.classList.contains('active') && !isFetching) hideModal();
});

async function go() {
  const value = input.value.trim();
  if (!value) {
    setStatus('Enter an IMDB ID or an IMDb link.', 'error');
    input.style.borderColor = 'var(--ink)';
    setTimeout(() => { input.style.borderColor = ''; setStatus('', ''); }, 2000);
    return;
  }

  setLoading(true);
  setStatus('Finding a working stream...', 'loading');

  try {
    const res = await fetch(\`/api/watch?id=\${encodeURIComponent(value)}\`);
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const data = await res.json();
    // The server answers with the canonical ID, whether an ID or a link went in.
    input.value = data.id;
    if (location.hash !== \`#id=\${data.id}\`) history.pushState(null, '', \`#id=\${data.id}\`);
    setStatus('', '');
    showModal(data);
    saveRecent(data.id, data.name);
  } catch (err) {
    setStatus(err.message || 'Something went wrong. Try again.', 'error');
    input.style.borderColor = 'var(--ink)';
    setTimeout(() => input.style.borderColor = '', 2000);
  } finally {
    setLoading(false);
  }
}

const storedRecent = () => parseRecent(localStorage.getItem(RECENT_KEY));

function saveRecent(id, name) {
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
  recent.append('Recent: ');
  items.forEach((item, i) => {
    if (i) recent.append(' · ');
    const link = document.createElement('a');
    link.href = \`#id=\${encodeURIComponent(item.id)}\`;
    link.textContent = item.name || item.id;
    recent.appendChild(link);
  });
}

form.addEventListener('submit', e => { e.preventDefault(); go(); });

renderRecent();
// A shared link such as /#id=tt0133093 (or a whole IMDb link) loads right away.
if (params.get('id')) go();
else input.focus();
// Recent and help links change only the hash, which does not reload the page.
window.addEventListener('hashchange', () => {
  const shared = new URLSearchParams(location.hash.slice(1)).get('id');
  if (!shared || shared === currentId) return;
  input.value = shared;
  go();
});
</script>
</body>
</html>
`;

export const RECENT_JS = `// The recent-lookups list. Pure functions, no DOM, in their own module so the
// browser and \`bun test\` can share the one implementation.

const RECENT_MAX = 5;

// Newest first, no duplicates, capped. Entries without a string id are dropped.
export function addRecent(list, entry) {
  if (!entry || typeof entry.id !== "string") return list.slice(0, RECENT_MAX);
  return [entry, ...list.filter(item => item && item.id !== entry.id)].slice(0, RECENT_MAX);
}

// localStorage may hold anything: junk, or a shape from an older version.
export function parseRecent(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item => item && typeof item.id === "string");
  } catch {
    return [];
  }
}
`;
