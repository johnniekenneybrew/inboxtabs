'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const BAR_ID     = 'glt-bar';
const PANEL_ID   = 'glt-panel';
const OVERLAY_ID = 'glt-overlay';

// ─── State ────────────────────────────────────────────────────────────────────

let cachedPinned = [];   // [{ id, name }, …]  — kept in sync with storage
let settingsOpen = false;
let dragRow = null;      // row currently being dragged in the settings list

// ─── Label discovery (DOM scrape — no API, no OAuth) ───────────────────────────

/**
 * Reads the user's labels straight from Gmail's left sidebar. Every label is
 * rendered as an <a href="…#label/Name"> element, so we collect those.
 *
 * Gmail only puts *visible* labels in the DOM, so this can miss labels that are
 * collapsed under "More", collapsed nested children, or set to "hide" in the
 * label list. The settings panel's manual "Add a label" input covers anything
 * this misses, and a "Retry" affordance covers the case where Gmail simply
 * hadn't finished rendering yet.
 *
 * @returns {{id: string, name: string}[]} deduped, alphabetically sorted.
 */
function scrapeLabels() {
  const out = new Map(); // name → { id, name }   (id === name; we have no API ids)
  document.querySelectorAll('a[href*="#label/"]').forEach((a) => {
    const name = labelNameFromHref(a.href);
    if (name && !out.has(name)) out.set(name, { id: name, name });
  });
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Extracts a decoded label name from a Gmail label URL, or null. */
function labelNameFromHref(href) {
  const i = href.indexOf('#label/');
  if (i === -1) return null;
  let frag = href.slice(i + '#label/'.length);
  const q = frag.indexOf('?');
  if (q !== -1) frag = frag.slice(0, q);
  if (!frag) return null;
  try {
    return decodeURIComponent(frag.replace(/\+/g, '%20'));
  } catch {
    return frag;
  }
}

// ─── Storage ──────────────────────────────────────────────────────────────────

function loadPinned() {
  return new Promise((resolve) =>
    chrome.storage.sync.get('pinnedLabels', (d) => resolve(d.pinnedLabels || []))
  );
}

function savePinned(labels) {
  return new Promise((resolve) => chrome.storage.sync.set({ pinnedLabels: labels }, resolve));
}

// ─── Navigation ───────────────────────────────────────────────────────────────

/**
 * Returns the name of the currently-active label (or 'INBOX' for the inbox).
 * Reads from the URL hash because Gmail is a hash-router SPA.
 */
function activeTabName() {
  const hash = location.hash;
  if (!hash || hash === '#' || hash.startsWith('#inbox')) return 'INBOX';

  // Native label URL:  #label/To+Do
  const native = hash.match(/^#label\/(.+?)(?:[/?].*)?$/);
  if (native) return decodeURIComponent(native[1].replace(/\+/g, '%20'));

  // Legacy search-style URLs (e.g. if the user typed one in)
  const decoded = decodeURIComponent(hash);
  const quoted = decoded.match(/label:["']([^"']+)["']/i);
  if (quoted) return quoted[1];
  const plain = decoded.match(/label:([^"'\s&/]+)/i);
  return plain ? plain[1] : null;
}

function goToLabel(name) {
  if (name === 'INBOX') {
    location.hash = '#inbox';
  } else {
    // Use Gmail's native label URL (same as clicking a label in the sidebar).
    // The label view has the same DOM structure as the inbox, which keeps our
    // injected tab bar stable across navigation.
    location.hash = '#label/' + encodeURIComponent(name).replace(/%20/g, '+');
  }
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────

function buildBar(pinned) {
  const activeName = activeTabName();
  const bar = document.createElement('div');
  bar.id = BAR_ID;
  bar.setAttribute('role', 'tablist');
  bar.setAttribute('aria-label', 'Label tabs');

  // Inbox is always the first, pinned tab.
  const tabs = [{ id: 'INBOX', name: 'Inbox' }, ...pinned];

  tabs.forEach(({ id, name }) => {
    const btn = document.createElement('button');
    btn.className = 'glt-tab';
    btn.setAttribute('role', 'tab');
    btn.textContent = name;
    btn.dataset.labelId = id;
    btn.dataset.labelName = name;

    const isActive =
      id === 'INBOX'
        ? activeName === 'INBOX'
        : activeName?.toLowerCase() === name.toLowerCase();

    if (isActive) {
      btn.classList.add('glt-tab--active');
      btn.setAttribute('aria-selected', 'true');
    } else {
      btn.setAttribute('aria-selected', 'false');
    }

    btn.addEventListener('click', () => {
      goToLabel(id === 'INBOX' ? 'INBOX' : name);
      setActiveTab(btn);
    });

    bar.appendChild(btn);
  });

  // Settings gear button (right-aligned via CSS margin-left: auto)
  const gear = document.createElement('button');
  gear.className = 'glt-gear';
  gear.title = 'Configure label tabs';
  gear.setAttribute('aria-label', 'Configure label tabs');
  gear.innerHTML = gearIcon();
  gear.addEventListener('click', openSettings);
  bar.appendChild(gear);

  return bar;
}

function setActiveTab(activeBtn) {
  document.querySelectorAll(`#${BAR_ID} .glt-tab`).forEach((btn) => {
    const on = btn === activeBtn;
    btn.classList.toggle('glt-tab--active', on);
    btn.setAttribute('aria-selected', String(on));
  });
}

function updateActiveTab() {
  const activeName = activeTabName();
  document.querySelectorAll(`#${BAR_ID} .glt-tab`).forEach((btn) => {
    const match =
      btn.dataset.labelId === 'INBOX'
        ? activeName === 'INBOX'
        : activeName?.toLowerCase() === btn.dataset.labelName?.toLowerCase();
    btn.classList.toggle('glt-tab--active', match);
    btn.setAttribute('aria-selected', String(match));
  });
}

function gearIcon() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0
      00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.28 7.28 0
      00-1.62-.94l-.36-2.54A.48.48 0 0014 3h-3.84c-.24
      0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0
      00-.59.22L2.74 9.47a.48.48 0 00.12.61l2.03 1.58a7.44 7.44 0
      000 1.88l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38
      1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24
      0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47
      0 .59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.01-1.58zM12 15.6c-1.98
      0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
  </svg>`;
}

// ─── Inject / remove bar ──────────────────────────────────────────────────────

/**
 * Gmail keeps multiple [role="main"] elements in the DOM (one per view) and
 * toggles their visibility. Always inject into the currently-visible one,
 * otherwise the bar lands inside a hidden container and disappears.
 */
function findVisibleMain() {
  const mains = document.querySelectorAll('[role="main"]');
  for (const m of mains) {
    if (m.offsetParent !== null && m.getBoundingClientRect().width > 0) {
      return m;
    }
  }
  return null;
}

function isBarVisible() {
  const bar = document.getElementById(BAR_ID);
  return !!(bar && bar.offsetParent !== null);
}

function injectBar(pinned) {
  document.getElementById(BAR_ID)?.remove();

  // Inject at the top of the visible [role="main"]. Inserting as a sibling of
  // [role="grid"] crashes Gmail's own event handlers, so we stay at the top.
  const main = findVisibleMain();
  if (!main) return false;

  main.prepend(buildBar(pinned));
  return true;
}

/**
 * After Gmail navigation the visible main may take a moment to appear.
 * Retry every 100 ms (up to 2 s) until we can inject into the visible one.
 */
function tryInjectWithRetry(attempts = 0) {
  if (isBarVisible()) {
    updateActiveTab();
    return;
  }
  if (injectBar(cachedPinned)) return;
  if (attempts < 20) {
    setTimeout(() => tryInjectWithRetry(attempts + 1), 100);
  }
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

async function openSettings() {
  if (settingsOpen) return;
  settingsOpen = true;

  // Backdrop
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.addEventListener('click', closeSettings);

  // Modal
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'glt-panel-title');
  panel.addEventListener('click', (e) => e.stopPropagation());

  panel.innerHTML = `
    <div class="glt-sp-head">
      <h2 class="glt-sp-title" id="glt-panel-title">Label Tabs</h2>
      <button class="glt-sp-x" aria-label="Close settings">&#x2715;</button>
    </div>
    <p class="glt-sp-hint">Tick labels to show them as tabs, and drag rows to reorder. Don't see one? Type its name below to add it directly.</p>
    <div class="glt-sp-add">
      <input type="text" class="glt-sp-add-input" id="glt-sp-add-input"
             placeholder="Add a label by name…" aria-label="Add a label by name"
             autocomplete="off" spellcheck="false">
      <button class="glt-sp-add-btn" id="glt-sp-add-btn">Add</button>
    </div>
    <div class="glt-sp-list" id="glt-sp-list">
      <p class="glt-sp-msg">Loading your labels&hellip;</p>
    </div>
    <div class="glt-sp-foot">
      <button class="glt-sp-save" id="glt-sp-save">Save</button>
    </div>
  `;

  document.body.append(overlay, panel);

  panel.querySelector('.glt-sp-x').addEventListener('click', closeSettings);
  panel.querySelector('#glt-sp-save').addEventListener('click', handleSave);

  const listEl  = panel.querySelector('#glt-sp-list');
  const addInput = panel.querySelector('#glt-sp-add-input');
  const addBtn   = panel.querySelector('#glt-sp-add-btn');

  const doAdd = () => {
    const name = addInput.value.trim();
    if (!name) return;
    addManualRow(listEl, name);
    addInput.value = '';
    addInput.focus();
  };
  addBtn.addEventListener('click', doAdd);
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doAdd(); }
  });

  // Focus the add field so the keyboard path is immediate.
  addInput.focus();

  const pinned = await loadPinned();
  renderList(listEl, pinned);
}

/**
 * Renders the merged label list into `container`:
 *   1. Pinned labels first (in saved order), ticked.
 *   2. Scraped-but-not-yet-pinned labels, alphabetically, unticked.
 * Pinned labels missing from the current scrape get a soft "unmatched" hint —
 * they may simply be hidden in the sidebar, or genuinely renamed/deleted.
 */
function renderList(container, pinned) {
  const scraped = scrapeLabels();
  const scrapedNames = new Set(scraped.map((l) => l.name));
  const pinnedNames  = new Set(pinned.map((p) => p.name));

  const rows = [
    ...pinned.map((p) => ({ name: p.name, checked: true, matched: scrapedNames.has(p.name) })),
    ...scraped
      .filter((l) => !pinnedNames.has(l.name))
      .map((l) => ({ name: l.name, checked: false, matched: true })),
  ];

  container.innerHTML = '';

  // Nothing scraped and nothing pinned → full empty-state with Retry.
  if (rows.length === 0) {
    container.appendChild(emptyState(container));
    return;
  }

  // Scrape came back empty but the user has pinned tabs → soft refresh notice.
  if (scraped.length === 0 && pinned.length > 0) {
    container.appendChild(retryNotice(container));
  }

  rows.forEach((r) => container.appendChild(buildRow(container, r)));
}

function buildRow(container, { name, checked, matched }) {
  const row = document.createElement('div');
  row.className = 'glt-row';
  row.draggable = true;
  row.dataset.name = name;
  if (checked) row.classList.add('glt-row--pinned');
  if (checked && !matched) row.classList.add('glt-row--unmatched');

  row.innerHTML = `
    <span class="glt-row-handle" aria-hidden="true" title="Drag to reorder">&#x2807;</span>
    <label class="glt-row-label">
      <input type="checkbox" class="glt-row-cb"${checked ? ' checked' : ''}>
      <span class="glt-row-name"></span>
    </label>
    <span class="glt-row-warn" tabindex="0" role="img"
      aria-label="Not visible in your sidebar right now — it may be hidden, renamed, or deleted"
      title="This label isn't visible in your sidebar right now. It may be tucked under &quot;More&quot;, hidden, renamed, or deleted. Use the pencil to fix the name, or untick to remove.">&#9888;</span>
    <button class="glt-row-edit" title="Rename this tab" aria-label="Rename this tab">&#9998;</button>
  `;
  row.querySelector('.glt-row-name').textContent = name;

  // Keep the pinned visual + edit affordance in sync with the checkbox.
  const cb = row.querySelector('.glt-row-cb');
  cb.addEventListener('change', () => {
    row.classList.toggle('glt-row--pinned', cb.checked);
    if (!cb.checked) row.classList.remove('glt-row--unmatched');
  });

  row.querySelector('.glt-row-edit').addEventListener('click', (e) => {
    e.preventDefault();
    startEdit(row);
  });

  attachDragHandlers(container, row);
  return row;
}

/** Turns a row's name into an inline text field so a renamed label can be fixed. */
function startEdit(row) {
  const nameSpan = row.querySelector('.glt-row-name');
  if (!nameSpan) return; // already editing
  const current = row.dataset.name;
  row.draggable = false;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'glt-row-edit-input';
  input.value = current;
  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const next = (commit ? input.value.trim() : current) || current;
    const span = document.createElement('span');
    span.className = 'glt-row-name';
    span.textContent = next;
    input.replaceWith(span);
    row.dataset.name = next;
    row.draggable = true;
    // The user has asserted this name, so clear any stale "unmatched" hint.
    if (next !== current) row.classList.remove('glt-row--unmatched');
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')      { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

/** Adds (or re-checks) a label the scrape didn't surface. */
function addManualRow(container, name) {
  const existing = [...container.querySelectorAll('.glt-row')]
    .find((r) => r.dataset.name.toLowerCase() === name.toLowerCase());

  if (existing) {
    const cb = existing.querySelector('.glt-row-cb');
    cb.checked = true;
    existing.classList.add('glt-row--pinned');
    existing.scrollIntoView({ block: 'nearest' });
    flash(existing);
    return;
  }

  // Clear any empty-state / notice placeholder before adding the first real row.
  container.querySelector('.glt-sp-empty')?.remove();

  // Manually added → treat as matched (user asserted it exists) to avoid a
  // confusing warning right after they typed it.
  const row = buildRow(container, { name, checked: true, matched: true });
  container.prepend(row);
  flash(row);
}

function flash(row) {
  row.classList.add('glt-row--flash');
  setTimeout(() => row.classList.remove('glt-row--flash'), 700);
}

/** Full empty state: scrape found nothing and the user has nothing pinned. */
function emptyState(container) {
  const wrap = document.createElement('div');
  wrap.className = 'glt-sp-empty';
  const msg = document.createElement('p');
  msg.className = 'glt-sp-msg';
  msg.textContent =
    "Couldn't read your labels automatically. Make sure Gmail has finished loading, then click Retry — or just type a label name above to add it directly.";
  const btn = document.createElement('button');
  btn.className = 'glt-sp-retry';
  btn.textContent = 'Retry';
  btn.addEventListener('click', () => renderList(container, collectChecked(container)));
  wrap.append(msg, btn);
  return wrap;
}

/** Soft notice: scrape failed but the user already has pinned tabs to keep. */
function retryNotice(container) {
  const wrap = document.createElement('div');
  wrap.className = 'glt-sp-notice';
  const span = document.createElement('span');
  span.textContent = "Couldn't refresh your label list from Gmail.";
  const btn = document.createElement('button');
  btn.className = 'glt-sp-retry glt-sp-retry--inline';
  btn.textContent = 'Retry';
  btn.addEventListener('click', () => renderList(container, collectChecked(container)));
  wrap.append(span, btn);
  return wrap;
}

/** Reads the currently-ticked rows, in DOM order, as a pinned-labels array. */
function collectChecked(container) {
  const out = [];
  container.querySelectorAll('.glt-row').forEach((row) => {
    if (row.querySelector('.glt-row-cb')?.checked) {
      out.push({ id: row.dataset.name, name: row.dataset.name });
    }
  });
  return out;
}

// ── Drag-and-drop reordering ──
function attachDragHandlers(container, row) {
  row.addEventListener('dragstart', (e) => {
    dragRow = row;
    e.dataTransfer.effectAllowed = 'move';
    // Defer class to allow the drag ghost to render first
    setTimeout(() => row.classList.add('glt-row--dragging'), 0);
  });

  row.addEventListener('dragend', () => {
    row.classList.remove('glt-row--dragging');
    container.querySelectorAll('.glt-row--over').forEach((r) => r.classList.remove('glt-row--over'));
    dragRow = null;
  });

  row.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (row !== dragRow) {
      container.querySelectorAll('.glt-row--over').forEach((r) => r.classList.remove('glt-row--over'));
      row.classList.add('glt-row--over');
    }
  });

  row.addEventListener('dragleave', () => row.classList.remove('glt-row--over'));

  row.addEventListener('drop', (e) => {
    e.preventDefault();
    row.classList.remove('glt-row--over');
    if (!dragRow || dragRow === row) return;
    const rows = [...container.querySelectorAll('.glt-row')];
    const si = rows.indexOf(dragRow);
    const di = rows.indexOf(row);
    si < di ? row.after(dragRow) : row.before(dragRow);
  });
}

async function handleSave() {
  const listEl = document.getElementById('glt-sp-list');
  const pinned = collectChecked(listEl);

  const saveBtn = document.getElementById('glt-sp-save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  await savePinned(pinned);
  cachedPinned = pinned;
  closeSettings();
  injectBar(pinned);
}

function closeSettings() {
  document.getElementById(OVERLAY_ID)?.remove();
  document.getElementById(PANEL_ID)?.remove();
  settingsOpen = false;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ─── MutationObserver — keeps bar alive across Gmail's DOM churning ───────────

const debouncedEnsure = debounce(() => {
  if (!isBarVisible()) {
    tryInjectWithRetry();
  }
}, 300);

const domObserver = new MutationObserver(debouncedEnsure);

// ─── Hash-change — update the active-tab indicator on Gmail navigation ────────

window.addEventListener('hashchange', () => {
  updateActiveTab();      // update indicator immediately if bar is already there
  tryInjectWithRetry();   // re-inject if bar already missing
  // Gmail usually removes the bar AFTER hashchange while it re-renders the
  // main panel. Re-check at several intervals so we catch the removal whenever
  // it happens and re-inject.
  [200, 500, 1000, 1500].forEach((d) => setTimeout(tryInjectWithRetry, d));
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function init() {
  cachedPinned = await loadPinned();

  if (injectBar(cachedPinned)) {
    // Gmail was already ready — start observing immediately.
    domObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    // [role="main"] / [role="grid"] not ready yet — poll until they appear.
    const waitObs = new MutationObserver(
      debounce(() => {
        if (injectBar(cachedPinned)) {
          waitObs.disconnect();
          domObserver.observe(document.body, { childList: true, subtree: true });
        }
      }, 200)
    );
    waitObs.observe(document.body, { childList: true, subtree: true });
  }

  // Sync tab bar if another tab/window changes the pinned list.
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.pinnedLabels) {
      cachedPinned = changes.pinnedLabels.newValue || [];
      injectBar(cachedPinned);
    }
  });
}

init();
