const svg = (inner, cls = 'h-4 w-4') =>
  `<svg class="${cls}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICON = {
  link: svg('<path d="M8.5 11.5a3.5 3.5 0 005 0l2.5-2.5a3.5 3.5 0 00-5-5l-1 1"/><path d="M11.5 8.5a3.5 3.5 0 00-5 0L4 11a3.5 3.5 0 005 5l1-1"/>'),
  copy: svg('<rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M13 7V5.5A1.5 1.5 0 0011.5 4h-6A1.5 1.5 0 004 5.5v6A1.5 1.5 0 005.5 13H7"/>'),
  check: svg('<path d="M4 10.5l4 4 8-9"/>'),
  alert: svg('<circle cx="10" cy="10" r="7.5"/><path d="M10 6v4.5M10 13.5h.01"/>'),
  trash: svg('<path d="M4 6h12M8 6V4.5A1.5 1.5 0 019.5 3h1A1.5 1.5 0 0112 4.5V6m2 0v9.5a1.5 1.5 0 01-1.5 1.5h-5A1.5 1.5 0 016 15.5V6"/>'),
};

const PAGE_SIZE = 10;
const config = { onDelete: null, onCreate: null, onRetry: null };
let allLinks = [];
let page = 1;
let wired = false;
let pendingDelete = null;

const $ = (id) => document.getElementById(id);
const show = (n, on) => n && n.classList.toggle('hidden', !on);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const linkId = (l) => l._id ?? l.id ?? '';
const shortDisplay = (l) => `${window.location.host}/${l.shortUrl}`;
const shortFull = (l) => `${window.location.origin}/${l.shortUrl}`;
const fmtDate = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' });
};

const STATE_IDS = ['links-loading', 'links-error', 'links-empty', 'links-no-results', 'links-table-wrap', 'links-pagination'];
const hideStates = () => STATE_IDS.forEach((id) => show($(id), false));

const ICON_BTN = 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50';
const clickBadge = (n, label = '') =>
  `<span class="inline-flex min-w-8 items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
    n > 0 ? 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/10' : 'bg-slate-100 text-slate-500'}">${n.toLocaleString()}${label}</span>`;

function rowHtml(link) {
  const clicks = Number(link.clicks) || 0;
  const dest = link.longUrl || 'No destination link found';
  return `
    <tr class="transition-colors duration-150 hover:bg-slate-50/70">
      <td class="whitespace-nowrap px-5 py-3.5 align-middle">
        <div class="flex items-center gap-2.5">
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">${ICON.link}</span>
          <span class="select-all text-sm font-medium text-indigo-600">${esc(shortDisplay(link))}</span>
        </div>
      </td>
      <td class="max-w-0 px-4 py-3.5 align-middle">
        <div class="truncate text-sm text-slate-500" title="${esc(dest)}">${esc(dest)}</div>
      </td>
      <td class="whitespace-nowrap px-4 py-3.5 text-right align-middle">${clickBadge(clicks)}</td>
      <td class="whitespace-nowrap px-4 py-3.5 align-middle text-xs text-slate-500">${esc(fmtDate(link.createdAt))}</td>
      <td class="whitespace-nowrap px-5 py-3.5 text-right align-middle">
        <div class="flex items-center justify-end gap-1">
          <button type="button" data-action="copy" data-url="${esc(shortFull(link))}" class="${ICON_BTN} hover:bg-slate-100 hover:text-slate-700" aria-label="Copy ${esc(shortDisplay(link))}" title="Copy short URL">${ICON.copy}</button>
          <button type="button" data-action="delete" data-id="${esc(linkId(link))}" data-label="${esc(shortDisplay(link))}" class="${ICON_BTN} hover:bg-red-50 hover:text-red-600" aria-label="Delete ${esc(shortDisplay(link))}" title="Delete link">${ICON.trash}</button>
        </div>
      </td>
    </tr>`;
}

function cardHtml(link) {
  const clicks = Number(link.clicks) || 0;
  const dest = link.longUrl || 'No destination link found';
  return `
    <li class="space-y-3 p-4">
      <div class="flex items-start gap-2.5">
        <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">${ICON.link}</span>
        <div class="min-w-0">
          <p class="break-all text-sm font-medium leading-6 text-indigo-600">${esc(shortDisplay(link))}</p>
          <p class="truncate text-xs text-slate-500" title="${esc(dest)}">${esc(dest)}</p>
        </div>
      </div>
      <div class="flex items-center justify-between text-xs text-slate-500">
        ${clickBadge(clicks, clicks === 1 ? ' click' : ' clicks')}
        <span>${esc(fmtDate(link.createdAt))}</span>
      </div>
      <div class="flex gap-2">
        <button type="button" data-action="copy" data-url="${esc(shortFull(link))}" class="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50" aria-label="Copy ${esc(shortDisplay(link))}">${ICON.copy}<span data-label>Copy</span></button>
        <button type="button" data-action="delete" data-id="${esc(linkId(link))}" data-label="${esc(shortDisplay(link))}" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-red-100 bg-white px-3 text-sm font-medium text-red-600 transition-colors duration-150 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50" aria-label="Delete ${esc(shortDisplay(link))}">${ICON.trash}Delete</button>
      </div>
    </li>`;
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (_) { return false; }
}

function announce(msg) { const n = $('links-live'); if (n) n.textContent = msg; }

async function handleCopy(btn) {
  const ok = await copyText(btn.dataset.url);
  const label = btn.querySelector('[data-label]');
  if (!btn._orig) btn._orig = { html: btn.innerHTML, label: label && label.textContent };
  if (label) label.textContent = ok ? 'Copied' : 'Copy failed';
  else btn.innerHTML = ok ? ICON.check : ICON.alert;
  btn.classList.add(ok ? 'text-emerald-600' : 'text-red-600');
  announce(ok ? 'Short URL copied to clipboard' : 'Could not copy. Select the URL and copy it manually.');
  clearTimeout(btn._t);
  btn._t = setTimeout(() => {
    if (label) label.textContent = btn._orig.label; else btn.innerHTML = btn._orig.html;
    btn.classList.remove('text-emerald-600', 'text-red-600');
  }, 1600);
}

function openDelete(id, label) {
  pendingDelete = id;
  $('links-delete-target').textContent = label;
  show($('links-delete-error'), false);
  $('links-delete-confirm').disabled = false;
  $('links-delete-confirm').textContent = 'Delete link';
  $('links-delete-dialog').showModal();
}

async function confirmDelete() {
  const id = pendingDelete;
  const errBox = $('links-delete-error');
  const confirmBtn = $('links-delete-confirm');
  show(errBox, false);

  if (!id) {
    errBox.textContent = 'This link has no id, so it cannot be deleted.';
    return show(errBox, true);
  }
  if (typeof config.onDelete !== 'function') {
    errBox.textContent = "Deleting isn't connected to the server yet, so this link was not deleted.";
    return show(errBox, true);
  }

  confirmBtn.disabled = true; confirmBtn.textContent = 'Deleting…';
  try {
    await config.onDelete(id);
  } catch (err) {
    console.error('Delete failed:', err);
    errBox.textContent = (err && err.message) || "We couldn't delete this link. Please try again.";
    show(errBox, true);
    confirmBtn.disabled = false; confirmBtn.textContent = 'Delete link';
    return;
  }

  $('links-delete-dialog').close();
  allLinks = allLinks.filter((l) => String(linkId(l)) !== String(id));
  window.cachedLinksData = allLinks;    
  refresh();
  announce('Link deleted');
  document.dispatchEvent(new CustomEvent('links:deleted', { detail: { id } }));
}

function getFiltered() {
  const q = ($('links-search')?.value || '').toLowerCase().trim();
  const filter = $('links-filter')?.value || 'all';
  const sort = $('links-sort')?.value || 'newest';

  const items = allLinks
    .map((l, i) => ({ l, i, t: Date.parse(l.createdAt), c: Number(l.clicks) || 0 }))
    .filter(({ l, c }) => {
      if (filter === 'clicked' && c === 0) return false;
      if (filter === 'unclicked' && c > 0) return false;
      if (!q) return true;
      return shortDisplay(l).toLowerCase().includes(q) || String(l.longUrl ?? '').toLowerCase().includes(q);
    });

  const sorters = {
    newest: (a, b) => (isNaN(a.t) || isNaN(b.t) ? a.i - b.i : b.t - a.t),
    oldest: (a, b) => (isNaN(a.t) || isNaN(b.t) ? b.i - a.i : a.t - b.t),
    'clicks-desc': (a, b) => b.c - a.c || a.i - b.i,
    'clicks-asc': (a, b) => a.c - b.c || a.i - b.i,
  };
  items.sort(sorters[sort] || sorters.newest);
  return items.map((x) => x.l);
}

function updateClearVisibility() {
  const clear = $('links-clear-filters');
  if (!clear) return;
  const active = ($('links-search')?.value || '').trim() !== '' || ($('links-filter')?.value || 'all') !== 'all';
  clear.classList.toggle('hidden', !active);
  clear.classList.toggle('inline-flex', active);
}

function updateStats() {
  const box = $('links-stats');
  if (!box) return;
  $('links-stat-total').textContent = allLinks.length.toLocaleString();
  $('links-stat-clicks').textContent = allLinks.reduce((n, l) => n + (Number(l.clicks) || 0), 0).toLocaleString();
  $('links-stat-active').textContent = allLinks.filter((l) => Number(l.clicks) > 0).length.toLocaleString();
  show(box, allLinks.length > 0);
  box.classList.toggle('flex', allLinks.length > 0);
}

function refresh() {
  hideStates();
  updateStats();
  updateClearVisibility();

  if (allLinks.length === 0) { show($('links-empty'), true); return; }

  const filtered = getFiltered();
  if (filtered.length === 0) { show($('links-no-results'), true); return; }

  const pages = Math.ceil(filtered.length / PAGE_SIZE);
  page = Math.min(Math.max(page, 1), pages);
  const start = (page - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);

  show($('links-table-wrap'), true);
  show($('links-pagination'), true);

  const tbody = document.querySelector('#view-links #links-body');
  const cards = $('links-cards');
  if (tbody) tbody.innerHTML = slice.map(rowHtml).join('');
  if (cards) cards.innerHTML = slice.map(cardHtml).join('');

  const noun = filtered.length === 1 ? 'link' : 'links';
  const filteredNote = filtered.length !== allLinks.length ? ` (filtered from ${allLinks.length})` : '';
  $('links-summary').textContent = `Showing ${start + 1}–${start + slice.length} of ${filtered.length} ${noun}${filteredNote}`;
  $('links-page-label').textContent = `Page ${page} of ${pages}`;
  $('links-prev').disabled = page <= 1;
  $('links-next').disabled = page >= pages;
}

function resetFilters() {
  const search = $('links-search'), filter = $('links-filter');
  if (search) search.value = '';
  if (filter) filter.value = 'all';
  page = 1;
  refresh();
  if (search) search.focus();
}

function goCreate() {
  if (typeof config.onCreate === 'function') return config.onCreate();
  document.querySelector('[data-nav="dashboard"]')?.click();
  setTimeout(() => {
    const empty = $('state-empty');
    if (empty && !empty.classList.contains('hidden')) document.querySelector('[data-action="create-link"]')?.click();
    const input = $('longUrl');
    if (input) { input.scrollIntoView({ behavior: 'smooth', block: 'center' }); input.focus(); }
  }, 50);
}

function wireOnce() {
  if (wired) return;
  const wrap = $('links-table-wrap');
  if (!wrap) return;
  wired = true;

  const onFilterChange = () => { page = 1; refresh(); };
  $('links-search')?.addEventListener('input', onFilterChange);
  $('links-filter')?.addEventListener('change', onFilterChange);
  $('links-sort')?.addEventListener('change', onFilterChange);
  $('links-clear-filters')?.addEventListener('click', resetFilters);
  $('links-clear')?.addEventListener('click', resetFilters);

  $('links-prev')?.addEventListener('click', () => { page -= 1; refresh(); });
  $('links-next')?.addEventListener('click', () => { page += 1; refresh(); });

  $('links-create')?.addEventListener('click', goCreate);
  $('links-empty-create')?.addEventListener('click', goCreate);
  $('links-retry')?.addEventListener('click', () => { if (typeof config.onRetry === 'function') config.onRetry(); });

  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || !wrap.contains(btn)) return;
    if (btn.dataset.action === 'copy') handleCopy(btn);
    if (btn.dataset.action === 'delete') openDelete(btn.dataset.id, btn.dataset.label);
  });

  const dialog = $('links-delete-dialog');
  if (dialog) {
    $('links-delete-cancel')?.addEventListener('click', () => dialog.close());
    $('links-delete-confirm')?.addEventListener('click', confirmDelete);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => { pendingDelete = null; });
  }
}

export function configureMyLinksView(options = {}) {
  Object.assign(config, options);
}

export function showMyLinksLoading() {
  wireOnce();
  hideStates();
  show($('links-loading'), true);
}

export function showMyLinksError(message) {
  wireOnce();
  hideStates();
  const msg = $('links-error-msg');
  if (msg && message) msg.textContent = message;
  show($('links-error'), true);
}

/**
 * @param {Array} linksArray  the full list of links
 * @param {{ onDelete?: Function }} [options]
 */

export async function deleteLinkFromServer(id) {
  const token = localStorage.getItem('authToken');
  if (!token) {
    throw new Error('Your session has expired. Please log in again.');
  }
  const response = await fetch(
    `/api/delete/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Failed to delete link.');
  }
  return data;
}

export function renderMyLinksView(linksArray, options = {}) {
  if (options.onDelete) config.onDelete = options.onDelete;
  allLinks = Array.isArray(linksArray) ? linksArray : [];
  wireOnce();
  refresh();
}