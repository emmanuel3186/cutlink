(function () {
  'use strict';

  const USE_MOCK = false; // <- set to false once your endpoints exist

  const API = {
    list: '/api/qr-codes',    
    summary: '/api/qr-codes/summary',
    create: '/api/qr-codes', 
    remove: (id) => `/api/qr-codes/${encodeURIComponent(id)}`,
    status: (id) => `/api/qr-codes/${encodeURIComponent(id)}/status`, 
    plan: '/api/me/plan',
  };

  // Which row actions the UI may show. Turn on only when the backend supports them.
  const capabilities = { remove: true, edit: false };

  /* Normalized shape used by the UI:
   * { id, name, shortUrl, destinationUrl, scans, createdAt, status }  (status may be null) */
  
  function normalizeQR(raw) {
    return {
      id: String(raw._id ?? raw.id),
      name: (raw.name || '').trim(),
      shortUrl: raw.shortUrl || '',
      destinationUrl: raw.longUrl || raw.destinationUrl || '',
      scans: Number(raw.scans ?? raw.scanCount ?? 0),
      createdAt: raw.createdAt || null,
      status: raw.status || null,
    };
  }


  // "Active" rule: ASSUMED to be status === 'active'. Replace with your real rule.
  const isActive = (qr) => qr.status === 'active';
  function summarize(list) {
    return {
      total: list.length,
      scans: list.reduce((n, q) => n + q.scans, 0),
      active: list.filter(isActive).length,
    };
  }

  async function http(url, options = {}) {
    const token = localStorage.getItem('authToken');

    const res = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try {
        msg = (await res.json()).message || msg;
      } catch (_) {}
      throw new Error(msg);
    }

    return res.status === 204 ? null : res.json();
  }

  async function getQRCodes() {
    const data = await http(API.list);
    const list = Array.isArray(data) ? data : data.qrCodes;
    if (!Array.isArray(list)) throw new Error('Unexpected response format');
    return list.map(normalizeQR);
  }

  // Summary: use the server's numbers if the endpoint exists, else derive from the list.
  async function getQRSummary(listFallback) {
    try {
      const s = await http(API.summary);
      return { total: Number(s.total), scans: Number(s.scans), active: Number(s.active) };
    }  catch (error) {
      console.error('QR summary request failed:', error);
      return summarize(listFallback || []);
    }
  }

  async function getPlan() {
    if (USE_MOCK) return MOCK_PLAN;
    try { return await http(API.plan); } catch (_) { return { tier: 'free', maxQRCodes: null, locked: [] }; }
  }

  // Existing short links for the "Use an existing link" picker (reuses the My Links service).
  async function getLinkOptions() {
    const data = await http('/api/user/links');

    const links = Array.isArray(data) ? data : data.links;

    if (!Array.isArray(links)) {
      throw new Error('Unexpected links response format');
    }

    return links.map((l) => ({
      id: l._id ?? l.id,
      shortUrl: `https://cutlink-rho.vercel.app/${l.shortUrl}`,
      originalUrl: l.longUrl,
    }));
  }

  async function createQRCode({ name, destinationUrl, linkId, shortUrl}) {
    const data = await http(API.create,{
      method: 'POST',
      body: JSON.stringify({ name, destinationUrl, linkId }),
    });

    return normalizeQR(data.qrCodes ?? data);
  }

  async function deleteQRCode(id) {
    await http(API.remove(id), { method: 'DELETE' });
  }
  async function updateQRCodeStatus(id, status) {
    const data = await http(API.status(id), {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });

    return data;
  }

  window.QRService = {
    capabilities, getQRCodes, getQRSummary, getPlan,
    getLinkOptions, createQRCode, deleteQRCode,updateQRCodeStatus,
  };
})();

/* qr-generator.js
 * Real QR generation + PNG download. No page logic, no data fetching.
 * Requires the "qrcode-generator" library (global `qrcode`) loaded BEFORE this file.
 * Exposes window.QRGenerator = { isReady, toDataURL, download, filenameFor }
 */
(function () {
  'use strict';

  const EC_LEVEL = 'M';      // ~15% damage tolerance; good balance for URLs
  const QUIET_ZONE = 4;      // modules of white border (the QR spec minimum)
  const PREVIEW_SIZE = 512;  // px, used for on-screen images
  const DOWNLOAD_SIZE = 1024; // px, used for the PNG file

  function isReady() {
    return typeof window.qrcode === 'function';
  }

  // Let non-ASCII URLs encode correctly.
  if (isReady() && window.qrcode.stringToBytesFuncs && window.qrcode.stringToBytesFuncs['UTF-8']) {
    window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
  }

  // Draws the QR onto a canvas at a whole-number pixel size per module (crisp, scannable).
  function toCanvas(text, size) {
    if (!isReady()) throw new Error('QR library failed to load.');
    if (!text) throw new Error('Nothing to encode.');
    const qr = window.qrcode(0, EC_LEVEL); // 0 = pick the smallest version that fits
    qr.addData(text);
    qr.make();

    const modules = qr.getModuleCount();
    const total = modules + QUIET_ZONE * 2;
    const scale = Math.max(1, Math.ceil(size / total));

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = total * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        if (qr.isDark(r, c)) ctx.fillRect((c + QUIET_ZONE) * scale, (r + QUIET_ZONE) * scale, scale, scale);
      }
    }
    return canvas;
  }

  const cache = new Map();
  function toDataURL(text) {
    if (!cache.has(text)) cache.set(text, toCanvas(text, PREVIEW_SIZE).toDataURL('image/png'));
    return cache.get(text);
  }

  function filenameFor(name, fallback) {
    const slug = (name || fallback || 'qr-code')
      .toLowerCase().replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
    return `${slug || 'qr-code'}-qr.png`;
  }

  // Throws on failure so the caller can show a message.
  function download(text, filename) {
    const canvas = toCanvas(text, DOWNLOAD_SIZE);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Could not create the PNG file.'));
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        resolve();
      }, 'image/png');
    });
  }

  window.QRGenerator = { isReady, toDataURL, download, filenameFor };
})();

/* my-qr-redesign.js  (replaces my-qr.js from the first QR version)
 * Rendering + events for #view-qr. Load order on the page:
 *   1. qrcode-generator library   2. qr-service.js   3. qr-generator.js
 *   4. links-service.js (optional, powers "Use an existing link")   5. this file
 */
function initQRPage() {
  'use strict';

  const section = document.getElementById('view-qr');
  const missing = [];
  if (!section) missing.push('#view-qr (the section markup is not on this page)');
  if (!window.QRService) missing.push('window.QRService (qr-service code did not run before this)');
  if (!window.QRGenerator) missing.push('window.QRGenerator (qr-generator code did not run before this)');
  if (missing.length) {
    console.warn('QR page cannot start. Missing: ' + missing.join('; '));
    return;
  }
  const Svc = window.QRService;
  const Gen = window.QRGenerator;

  // Where "See plans" goes once you have a pricing/upgrade page.
  const UPGRADE_URL = null;

  const $ = (id) => document.getElementById(id);
  const el = {
    create: $('qr-create'), emptyCreate: $('qr-empty-create'), mockNotice: $('qr-mock-notice'),
    statTotal: $('qr-stat-total'), statScans: $('qr-stat-scans'), statActive: $('qr-stat-active'),
    search: $('qr-search'), sort: $('qr-sort'), toolbar: $('qr-toolbar'),
    loading: $('qr-loading'), error: $('qr-error'), retry: $('qr-retry'),
    empty: $('qr-empty'), noResults: $('qr-no-results'), clear: $('qr-clear'), grid: $('qr-grid'),
    toast: $('qr-toast'),
    modal: $('qr-modal'), form: $('qr-form'), name: $('qr-name'), url: $('qr-url'), link: $('qr-link'),
    srcTabs: $('qr-source-tabs'), srcUrl: $('qr-source-url'), srcLink: $('qr-source-link'),
    fieldErr: $('qr-field-error'), formErr: $('qr-form-error'),
    live: $('qr-live'), liveImg: $('qr-live-img'), liveText: $('qr-live-text'),
    submit: $('qr-submit'), spinner: $('qr-submit-spinner'), submitLabel: $('qr-submit-label'),
    viewModal: $('qr-view-modal'), viewTitle: $('qr-view-title'), viewImg: $('qr-view-img'),
    viewUrl: $('qr-view-url'), viewDl: $('qr-view-download'),
    delDialog: $('qr-delete-dialog'), delTarget: $('qr-delete-target'), delErr: $('qr-delete-error'),
    delCancel: $('qr-delete-cancel'), delConfirm: $('qr-delete-confirm'),
    upModal: $('qr-upgrade-modal'), upMsg: $('qr-upgrade-msg'), upGo: $('qr-upgrade-go'),
  };

  const state = {
    all: [], query: '', sort: 'newest', status: 'loading',
    plan: { tier: 'free', maxQRCodes: null, locked: [] },
    source: 'url', linkOptions: [], submitting: false, viewing: null, pendingDelete: null,
  };

  /* ---------- Helpers ---------- */
  function h(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text; // textContent keeps user data inert (no HTML injection)
    return n;
  }
  const strip = (u) => (u || '').replace(/^https?:\/\//i, '');
  const dateFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const fmtDate = (iso) => (iso && !isNaN(new Date(iso)) ? dateFmt.format(new Date(iso)) : '—');
  const displayName = (qr) => qr.name || `QR for ${strip(qr.shortUrl || qr.longUrl) || 'link'}`;
  const encodedUrl = (qr) => { 
    const baseUrl = window.location.origin;
    return `${baseUrl}/qr/${qr.id}`;
  };
  const openDlg = (d) => { if (!d.open) d.showModal(); };
  const closeDlg = (d) => { if (d.open) d.close(); };
  const setFlex = (n, on) => { n.classList.toggle('hidden', !on); n.classList.toggle('flex', on); };

  const svg = (inner, cls = 'h-4 w-4') =>
    `<svg class="${cls}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const ICON = {
    link: svg('<path d="M8.5 11.5a3.5 3.5 0 005 0l2.5-2.5a3.5 3.5 0 00-5-5l-1 1"/><path d="M11.5 8.5a3.5 3.5 0 00-5 0L4 11a3.5 3.5 0 005 5l1-1"/>', 'h-3.5 w-3.5'),
    scan: svg('<path d="M4 7V5.5A1.5 1.5 0 015.5 4H7M13 4h1.5A1.5 1.5 0 0116 5.5V7M16 13v1.5a1.5 1.5 0 01-1.5 1.5H13M7 16H5.5A1.5 1.5 0 014 14.5V13M3.5 10h13"/>', 'h-3.5 w-3.5'),
    dots: '<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 6a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM11.5 16a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/></svg>',
  };

  let toastTimer;
  function toast(message, ok = true) {
    el.toast.textContent = message;
    el.toast.className = 'pointer-events-none fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-sm rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ' +
      (ok ? 'bg-slate-900' : 'bg-red-600');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 3500);
  }

  function qrImage(text, cls) {
    const img = h('img', cls);
    img.alt = `QR code for ${text}`;
    img.style.imageRendering = 'pixelated'; // keeps module edges sharp when scaled
    img.src = Gen.toDataURL(text);
    return img;
  }

  /* ---------- Plan gating (display only; your backend must enforce real limits) ---------- */
  const isLocked = (feature) => state.plan.locked.includes(feature);
  const atLimit = () => state.plan.maxQRCodes != null && state.all.length >= state.plan.maxQRCodes;
  function showUpgrade(message) { el.upMsg.textContent = message; openDlg(el.upModal); }

  /* ---------- Search + sort ---------- */
  function visible() {
    const term = state.query.trim().toLowerCase();
    const list = state.all.filter((x) =>
      !term || [x.name, x.shortUrl, x.longUrl].some((v) => (v || '').toLowerCase().includes(term)));
    const t = (x) => (x.createdAt ? new Date(x.createdAt).getTime() : 0);
    const sorters = {
      newest: (a, b) => t(b) - t(a), oldest: (a, b) => t(a) - t(b),
      'scans-desc': (a, b) => b.scans - a.scans, 'scans-asc': (a, b) => a.scans - b.scans,
    };
    return list.sort(sorters[state.sort]);
  }

  /* ---------- Rendering ---------- */
  function showPanels(...names) {
    ['loading', 'error', 'empty', 'noResults', 'grid'].forEach((k) => {
      const on = names.includes(k);
      el[k].classList.toggle('hidden', !on);
      if (k === 'loading' || k === 'grid') el[k].classList.toggle('grid', on);
    });
    setFlex(el.toolbar, state.status === 'ready' && state.all.length > 0);
  }

  function renderSummary(summary) {
    const set = (node, v) => { node.textContent = v == null ? '–' : Number(v).toLocaleString(); };
    set(el.statTotal, summary && summary.total);
    set(el.statScans, summary && summary.scans);
    set(el.statActive, summary && summary.active);
  }

  function statusBadge(status) {
    const tone = {
      active: ['bg-emerald-50 text-emerald-700 ring-emerald-600/20', 'bg-emerald-500'],
      paused: ['bg-amber-50 text-amber-700 ring-amber-600/20', 'bg-amber-500'],
    }[status] || ['bg-slate-50 text-slate-600 ring-slate-500/20', 'bg-slate-400'];
    const b = h('span', `inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone[0]}`);
    b.append(h('span', `h-1.5 w-1.5 rounded-full ${tone[1]}`), status.charAt(0).toUpperCase() + status.slice(1));
    return b;
  }

  function menuItem(label, onClick, opts = {}) {
    const b = h('button', `flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors duration-100 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none ${opts.danger ? 'text-red-600' : 'text-slate-700'}`);
    b.type = 'button'; b.setAttribute('role', 'menuitem');
    b.append(h('span', null, label));
    if (opts.badge) b.append(h('span', 'rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600', opts.badge));
    b.addEventListener('click', () => { closeMenus(); onClick(); });
    return b;
  }

  function buildMenu(qr) {
    const wrap = h('div', 'relative');
    const btn = h('button', 'rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-white hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', `Actions for ${displayName(qr)}`);
    btn.innerHTML = ICON.dots;

    const menu = h('div', 'absolute right-0 z-20 mt-1 hidden w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg');
    menu.setAttribute('role', 'menu'); menu.dataset.qrMenu = '';
    menu.append(menuItem('View QR Code', () => openView(qr)));
    menu.append(menuItem('Download PNG', () => downloadQR(qr)));
    if (qr.shortUrl) menu.append(menuItem('Copy Short URL', () => copyText(qr.shortUrl)));
    const isInactive = qr.status === 'inactive';
    menu.append(
      menuItem(
        isInactive ? 'Reactivate QR Code' : 'Deactivate QR Code',
        async () => {
          const newStatus = isInactive ? 'active' : 'inactive';

          try {
            await Svc.updateQRCodeStatus(qr.id, newStatus);
            await load();
          } catch (error) {
            alert(error.message || 'Failed to update QR code status.');
          }
        },
        { danger: !isInactive }
      )
    );
    if (isLocked('scanAnalytics')) {
      menu.append(menuItem('Scan analytics', () => showUpgrade('Detailed scan reports are part of the Premium plan.'), { badge: 'Premium' }));
    }
    if (Svc.capabilities.remove) {
      menu.append(h('div', 'my-1 border-t border-slate-100'));
      menu.append(menuItem('Delete', () => openDelete(qr), { danger: true }));
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = menu.classList.contains('hidden');
      closeMenus();
      if (willOpen) { menu.classList.remove('hidden'); btn.setAttribute('aria-expanded', 'true'); }
    });
    wrap.append(btn, menu);
    return wrap;
  }

  function closeMenus() {
    section.querySelectorAll('[data-qr-menu]').forEach((m) => m.classList.add('hidden'));
    section.querySelectorAll('[aria-haspopup="menu"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }

  function buildCard(qr) {
    const card = h('article', 'flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow duration-150 hover:shadow-md');

    // Tinted preview panel: status top-left, menu top-right, QR centered
    const panel = h('div', 'relative flex items-center justify-center rounded-t-xl border-b border-slate-100 bg-slate-50 px-4 py-6');
    if (qr.status) {
      const s = h('div', 'absolute left-3 top-3'); s.append(statusBadge(qr.status)); panel.append(s);
    }
    const m = h('div', 'absolute right-2 top-2'); m.append(buildMenu(qr)); panel.append(m);

    const previewBtn = h('button', 'rounded-lg bg-white p-1.5 shadow-sm ring-1 ring-slate-200 transition-shadow duration-150 hover:ring-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500');
    previewBtn.type = 'button';
    previewBtn.setAttribute('aria-label', `View ${displayName(qr)}`);
    try { previewBtn.append(qrImage(encodedUrl(qr), 'h-32 w-32')); }
    catch (_) { previewBtn.append(h('div', 'flex h-32 w-32 items-center justify-center text-xs text-red-600', 'Preview unavailable')); }
    previewBtn.addEventListener('click', () => openView(qr));
    panel.append(previewBtn);

    // Body
    const body = h('div', 'flex-1 space-y-1.5 p-4');
    const title = h('h3', 'truncate text-sm font-semibold text-slate-900', displayName(qr));
    title.title = displayName(qr);
    body.append(title);
    if (qr.shortUrl) {
      const row = h('div', 'flex min-w-0 items-center gap-1.5 text-sm font-medium text-indigo-600');
      row.insertAdjacentHTML('beforeend', ICON.link);
      const fullShortUrl = qr.shortUrl.startsWith('http')
        ? qr.shortUrl
        : `https://cutlink-rho.vercel.app/${qr.shortUrl}`;

      const t = h('span', 'truncate', fullShortUrl);
      t.title = fullShortUrl;
      row.append(t);
      body.append(row);
    }
    const dest = h('p', 'truncate text-xs text-slate-500', strip(qr.destinationUrl) || '—');
    dest.title = qr.destinationUrl;
    body.append(dest);

    // Footer
    const foot = h('div', 'flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500');
    const scans = h('span', 'inline-flex items-center gap-1.5');
    scans.insertAdjacentHTML('beforeend', ICON.scan);
    scans.append(h('span', 'font-semibold tabular-nums text-slate-900', qr.scans.toLocaleString()), qr.scans === 1 ? 'scan' : 'scans');
    foot.append(scans, h('span', null, fmtDate(qr.createdAt)));

    card.append(panel, body, foot);
    return card;
  }

  function render() {
    if (state.status === 'loading') return showPanels('loading');
    if (state.status === 'error') return showPanels('error');
    if (state.all.length === 0) return showPanels('empty');
    const list = visible();
    if (list.length === 0) return showPanels('noResults');
    el.grid.replaceChildren(...list.map(buildCard));
    showPanels('grid');
  }

  /* ---------- Loading ---------- */
  async function load() {
    state.status = 'loading'; render(); renderSummary(null);
    try {
      const [list, plan] = await Promise.all([Svc.getQRCodes(), Svc.getPlan()]);
      state.all = list; state.plan = plan; state.status = 'ready';
      renderSummary(await Svc.getQRSummary(list));
    } catch (err) {
      console.error('Failed to load QR codes:', err);
      state.status = 'error';
    }
    render();
  }

  /* ---------- Actions ---------- */
  async function copyText(text) {
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); ok = true; }
    } catch (_) { /* try the fallback */ }
    if (!ok) {
      const ta = h('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (__) { ok = false; }
      ta.remove();
    }
    toast(ok ? 'Short URL copied' : 'Could not copy. Select the URL and copy it manually.', ok);
  }

  async function downloadQR(qr) {
    try {
      await Gen.download(encodedUrl(qr), Gen.filenameFor(qr.name, qr.shortUrl || qr.longUrl));
      toast('QR code downloaded');
    } catch (err) {
      console.error(err);
      toast(`Download failed: ${err.message}`, false);
    }
  }

  function openView(qr) {
    state.viewing = qr;
    el.viewTitle.textContent = displayName(qr);
    el.viewUrl.textContent = encodedUrl(qr);
    el.viewImg.replaceChildren();
    try { el.viewImg.append(qrImage(encodedUrl(qr), 'h-full w-full')); }
    catch (_) { el.viewImg.append(h('p', 'p-4 text-sm text-red-600', 'Could not generate this QR code.')); }
    openDlg(el.viewModal);
  }

  /* ---------- Delete: confirm, wait for the server, only then update the UI ---------- */
  function openDelete(qr) {
    state.pendingDelete = qr;
    el.delTarget.textContent = displayName(qr);
    el.delErr.classList.add('hidden');
    el.delConfirm.disabled = false; el.delConfirm.textContent = 'Delete QR code';
    openDlg(el.delDialog);
  }

  async function confirmDelete() {
    const qr = state.pendingDelete;
    if (!qr) return;
    el.delErr.classList.add('hidden');
    el.delConfirm.disabled = true; el.delConfirm.textContent = 'Deleting…';
    try {
      await Svc.deleteQRCode(qr.id); // must reject if the server did not confirm
    } catch (err) {
      console.error(err);
      el.delErr.textContent = (err && err.message) || "We couldn't delete this QR code. Please try again.";
      el.delErr.classList.remove('hidden');
      el.delConfirm.disabled = false; el.delConfirm.textContent = 'Delete QR code';
      return;
    }
    state.all = state.all.filter((x) => x.id !== qr.id);
    closeDlg(el.delDialog);
    renderSummary(await Svc.getQRSummary(state.all));
    render(); toast('QR code deleted');
  }

  /* ---------- Create dialog ---------- */
  function setSource(source) {
    state.source = source;
    el.srcUrl.classList.toggle('hidden', source !== 'url');
    el.srcLink.classList.toggle('hidden', source !== 'link');
    el.srcTabs.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.source === source;
      b.className = 'rounded-md px-3 py-1.5 transition-colors duration-150 ' + (on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700');
    });
    clearErrors(); updateLivePreview();
  }

  function clearErrors() {
    el.fieldErr.classList.add('hidden'); el.formErr.classList.add('hidden');
    el.url.classList.remove('border-red-400'); el.link.classList.remove('border-red-400');
  }
  function fieldError(msg, input) {
    el.fieldErr.textContent = msg; el.fieldErr.classList.remove('hidden');
    input.classList.add('border-red-400'); input.focus();
  }
  function isValidHttpUrl(value) {
    try { const u = new URL(value); return u.protocol === 'http:' || u.protocol === 'https:'; }
    catch (_) { return false; }
  }

  // What will be encoded, or null while the input is incomplete/invalid.
  function currentTarget() {
    if (state.source === 'link') {
      const opt = state.linkOptions.find(
        (o) => o.id === el.link.value
      );
      return opt? {encoded: opt.shortUrl,destinationUrl: opt.originalUrl,linkId: opt.id,shortUrl: opt.shortUrl,
      }: null;
    }
    const v = el.url.value.trim();
    return isValidHttpUrl(v) ? { encoded: v, destinationUrl: v } : null;
  }

  function updateLivePreview() {
    const t = currentTarget();
    if (!t || !Gen.isReady()) return setFlex(el.live, false);
    try {
      el.liveImg.replaceChildren(qrImage(t.encoded, 'h-full w-full'));
      el.liveText.textContent = t.encoded;
      setFlex(el.live, true);
    } catch (_) { setFlex(el.live, false); }
  }

  async function openCreate() {
    if (atLimit()) {
      return showUpgrade(`You've reached the limit of ${state.plan.maxQRCodes} QR codes on your plan. Upgrade to create more.`);
    }
    el.form.reset(); clearErrors(); setFlex(el.live, false); setSource('url');
    openDlg(el.modal); el.name.focus();
    try { 
      state.linkOptions = await Svc.getLinkOptions(); 
    } catch (_) { 
      state.linkOptions = []; 
    }
    el.srcTabs.querySelector('[data-source="link"]').classList.toggle('hidden', state.linkOptions.length === 0);
    const placeholder = h('option', null, 'Select a link…'); placeholder.value = '';
    el.link.replaceChildren(placeholder, ...state.linkOptions.map((o) => {
      const opt = h('option', null, `${strip(o.shortUrl)} → ${strip(o.originalUrl)}`); 
      opt.value = o.id; 
      return opt;
    }));
  }

  function setSubmitting(on) {
    state.submitting = on; el.submit.disabled = on;
    el.spinner.classList.toggle('hidden', !on);
    el.submitLabel.textContent = on ? 'Generating…' : 'Generate QR Code';
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (state.submitting) return;
    clearErrors();

    if (state.source === 'url') {
      const v = el.url.value.trim();
      if (!v) return fieldError('Enter a destination URL.', el.url);
      if (!isValidHttpUrl(v)) return fieldError('Enter a valid URL starting with http:// or https://', el.url);
    } else if (!el.link.value) {
      return fieldError('Select one of your shortened links.', el.link);
    }
    if (!Gen.isReady()) {
      el.formErr.textContent = 'The QR code library did not load. Check your connection and reload the page.';
      return el.formErr.classList.remove('hidden');
    }

    const t = currentTarget();
    setSubmitting(true);
    try {
      Gen.toDataURL(t.encoded);
      const created = await Svc.createQRCode({
        name: el.name.value.trim(), destinationUrl: t.destinationUrl, linkId: t.linkId, shortUrl: t.shortUrl,
      });
      state.all = [created, ...state.all];
      renderSummary(await Svc.getQRSummary(state.all));
      closeDlg(el.modal); render();
      toast(Svc.USE_MOCK ? 'QR code created (preview only, not saved)' : 'QR code created');
    } catch (err) {
      console.error(err);
      el.formErr.textContent = `We couldn't create the QR code. ${err.message || 'Please try again.'}`;
      el.formErr.classList.remove('hidden');
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------- Events ---------- */
  el.create.addEventListener('click', openCreate);
  el.emptyCreate.addEventListener('click', openCreate);
  el.retry.addEventListener('click', load);
  el.form.addEventListener('submit', onSubmit);
  el.url.addEventListener('input', () => { clearErrors(); updateLivePreview(); });
  el.link.addEventListener('change', () => { clearErrors(); updateLivePreview(); });
  el.srcTabs.addEventListener('click', (e) => { const b = e.target.closest('button[data-source]'); if (b) setSource(b.dataset.source); });

  let searchTimer;
  el.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = el.search.value; render(); }, 150);
  });
  el.sort.addEventListener('change', () => { state.sort = el.sort.value; render(); });
  el.clear.addEventListener('click', () => { el.search.value = ''; state.query = ''; render(); });

  section.querySelectorAll('[data-qr-close]').forEach((b) => b.addEventListener('click', () => closeDlg(el.modal)));
  section.querySelectorAll('[data-qr-view-close]').forEach((b) => b.addEventListener('click', () => closeDlg(el.viewModal)));
  section.querySelectorAll('[data-qr-upgrade-close]').forEach((b) => b.addEventListener('click', () => closeDlg(el.upModal)));
  el.delCancel.addEventListener('click', () => closeDlg(el.delDialog));
  el.delConfirm.addEventListener('click', confirmDelete);
  el.viewDl.addEventListener('click', () => state.viewing && downloadQR(state.viewing));
  el.upGo.addEventListener('click', () => { if (UPGRADE_URL) window.location.href = UPGRADE_URL; else closeDlg(el.upModal); });

  // Native <dialog> already handles Escape + focus trapping; add click-on-backdrop to close.
  [el.modal, el.viewModal, el.delDialog, el.upModal].forEach((d) =>
    d.addEventListener('click', (e) => { if (e.target === d) closeDlg(d); }));
  document.addEventListener('click', closeMenus);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });

  /* ---------- Init: fetch the first time the view becomes visible ---------- */
  let started = false;
  const startOnce = () => { if (!started) { started = true; load(); } };
  if (!section.classList.contains('hidden')) startOnce();
  new MutationObserver(() => { if (!section.classList.contains('hidden')) startOnce(); })
    .observe(section, { attributes: true, attributeFilter: ['class'] });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initQRPage);
} else {
  initQRPage();
}