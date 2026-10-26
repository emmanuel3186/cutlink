const UI_IDS = [
  'dm-add', 'dm-notice', 'dm-notice-text', 'dm-status',
  'dm-stat-total', 'dm-stat-total-sub', 'dm-stat-verified', 'dm-stat-pending',
  'dm-loading', 'dm-error', 'dm-error-msg', 'dm-retry', 'dm-empty', 'dm-empty-add',
  'dm-list-wrap', 'dm-body', 'dm-cards', 'dm-toast',
  'dm-add-dialog', 'dm-add-form', 'dm-domain', 'dm-domain-error', 'dm-add-error',
  'dm-add-submit', 'dm-add-spinner', 'dm-add-submit-label',
  'dm-dns-dialog', 'dm-dns-domain', 'dm-dns-status', 'dm-dns-loading', 'dm-dns-empty',
  'dm-dns-fail', 'dm-dns-records', 'dm-dns-error', 'dm-dns-result',
  'dm-dns-verify', 'dm-dns-spinner', 'dm-dns-verify-label',
  'dm-delete-dialog', 'dm-delete-name', 'dm-delete-detail', 'dm-delete-error',
  'dm-delete-cancel', 'dm-delete-confirm',
];

const API_METHODS = ['listDomains', 'addDomain', 'getDomain', 'verifyDomain', 'deleteDomain'];
const STALE_MS = 30000;

const TONES = {
  neutral: ['bg-slate-50', 'text-slate-700'],
  success: ['bg-emerald-50', 'text-emerald-800'],
  error: ['bg-red-50', 'text-red-700'],
};
const ALL_TONE_CLASSES = [...new Set(Object.values(TONES).flat())];

const BTN =
  'inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 ' +
  'transition-colors duration-150 hover:bg-slate-50 focus-visible:outline-hidden focus-visible:ring-2 ' +
  'focus-visible:ring-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-60';
const BTN_DANGER = BTN.replace('text-slate-700', 'text-red-600').replace('hover:bg-slate-50', 'hover:bg-red-50');

/** Errors whose message is safe and meant to be shown to the user. */
class UiError extends Error {}

const str = (v) => (v == null ? '' : String(v));

/** Safe element builder: text goes through textContent / text nodes only. */
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child != null && child !== false) node.append(child);
  }
  return node;
}

function formatDate(value) {
  const t = Date.parse(value);
  if (Number.isNaN(t)) return '\u2014';
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(t);
}

function errorMessage(err, fallback) {
  if (err instanceof UiError || (err && err.status && err.message)) return err.message;
  return fallback || 'Something went wrong. Check your connection and try again.';
}

/** Validate and normalize user input. Returns { value } or { error }. */
function normalizeDomainInput(raw) {
  let v = str(raw).trim().toLowerCase();
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/\/+$/, '').replace(/\.$/, '');

  if (!v) return { error: 'Enter a domain name, like go.example.com.' };
  if (/[\s/?#:@\\]/.test(v)) {
    return { error: 'Enter only the domain name, without a path, port, or spaces.' };
  }

  let host;
  try {
    host = new URL('http://' + v).hostname; // also converts IDNs to punycode
  } catch (e) {
    return { error: "That doesn't look like a valid domain name." };
  }

  if (!host || host.length > 253) return { error: 'That domain name is too long.' };
  const labels = host.split('.');
  if (labels.length < 2) return { error: 'Include the full domain, like go.example.com.' };
  if (!labels.every((l) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l))) {
    return { error: "That doesn't look like a valid domain name." };
  }
  if (/^\d+$/.test(labels[labels.length - 1])) {
    return { error: "IP addresses aren't supported. Use a domain name." };
  }
  return { value: host };
}

/* ------------------------------------------------------------------ */
/* API response parsing (the only place raw API shapes are touched)    */
/* ------------------------------------------------------------------ */

function parseDomain(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id ?? raw._id;
  const name = typeof raw.domain === 'string' ? raw.domain : raw.name;
  if (id == null || typeof name !== 'string' || !name) return null;
  const s = str(raw.status).toLowerCase();
  const status = s === 'verified' || s === 'failed' ? s : 'pending';
  return {
    id: String(id),
    domain: name,
    status,
    createdAt: raw.createdAt ?? null,
    // Only a verified domain can be "ready", and only if the backend says so.
    ready: status === 'verified' && raw.ready === true,
  };
}

function extractDomain(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.domain && typeof payload.domain === 'object') return parseDomain(payload.domain);
  if (typeof payload.domain === 'string') return parseDomain(payload);
  return null;
}

function parseList(payload) {
  const list = Array.isArray(payload) ? payload : payload && payload.domains;
  if (!Array.isArray(list)) throw new UiError('Unexpected response from the server.');
  return list.map(parseDomain).filter(Boolean);
}

function parseRecords(payload) {
  const list = (payload && payload.dns && payload.dns.records) ?? (payload && payload.records);
  if (!Array.isArray(list)) return [];
  return list
    .map((r) => ({
      type: str(r && r.type),
      name: str(r && r.name),
      value: str(r && r.value),
      ttl: str(r && r.ttl),
      purpose: str(r && r.purpose),
    }))
    .filter((r) => r.type && r.value);
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

let controller = null;

export function initDomainsTab({ api } = {}) {
  const section = document.getElementById('custom-domains');
  if (!section) {
    console.warn('[domains] #custom-domains not found; skipping init.');
    return null;
  }
  if (controller && section.dataset.dmReady === '1') return controller; // never bind twice

  // Collect elements: 'dm-dns-verify-label' -> els.dnsVerifyLabel, 'dm-domain' -> els.domain
  const els = {};
  const missingIds = [];
  for (const id of UI_IDS) {
    const node = document.getElementById(id);
    if (!node) missingIds.push(id);
    els[id.replace(/^dm-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = node;
  }
  if (missingIds.length) {
    console.error('[domains] Missing expected elements:', missingIds.join(', '));
    return null;
  }

  const state = {
    domains: [],
    loaded: false,
    loadSeq: 0,
    lastLoadAt: 0,
    adding: false,
    deleting: false,
    deleteId: null,
    dnsId: null,
    dnsSeq: 0,
    verifying: new Set(),
  };

  /* ---------- tiny UI utilities ---------- */

  const show = (el, on = true) => el.classList.toggle('hidden', !on);

  function setTone(el, tone) {
    el.classList.remove(...ALL_TONE_CLASSES);
    el.classList.add(...TONES[tone]);
  }

  function announce(message) {
    els.status.textContent = message;
  }

  let toastTimer = null;
  function toast(message, tone = 'neutral') {
    // Note: dialogs live in the browser top layer and cover this toast,
    // so in-dialog feedback is shown inline instead.
    els.toast.textContent = message;
    els.toast.classList.remove('bg-slate-900', 'bg-red-600');
    els.toast.classList.add(tone === 'error' ? 'bg-red-600' : 'bg-slate-900');
    show(els.toast, true);
    announce(message);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => show(els.toast, false), 3500);
  }

  function setNotice(message) {
    if (!message) {
      els.notice.classList.add('hidden');
      els.notice.classList.remove('flex');
      return;
    }
    els.noticeText.textContent = message;
    els.notice.classList.remove('hidden');
    els.notice.classList.add('flex');
  }

  function showView(name) {
    show(els.loading, name === 'loading');
    show(els.error, name === 'error');
    show(els.empty, name === 'empty');
    show(els.listWrap, name === 'list');
  }

  const findDomain = (id) => state.domains.find((d) => d.id === id) || null;

  function mergeDomain(updated) {
    const i = state.domains.findIndex((d) => d.id === updated.id);
    if (i >= 0) state.domains[i] = updated;
    else state.domains.push(updated);
  }

  /* ---------- rendering ---------- */

  function statusBadge(d) {
    const map = {
      verified: d.ready
        ? ['Active', 'bg-emerald-50 text-emerald-700']
        : ['DNS verified', 'bg-emerald-50 text-emerald-700'],
      pending: ['Pending verification', 'bg-amber-50 text-amber-700'],
      failed: ['Verification failed', 'bg-red-50 text-red-700'],
    };
    const [label, tone] = map[d.status];
    return h(
      'span',
      { class: `inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}` },
      h('span', { class: 'h-1.5 w-1.5 rounded-full bg-current', 'aria-hidden': 'true' }),
      label
    );
  }

  function statusBlock(d) {
    return h(
      'div',
      {},
      statusBadge(d),
      d.status === 'verified' && !d.ready
        ? h('p', { class: 'mt-1 text-xs text-slate-500', text: 'Routing and HTTPS not confirmed yet' })
        : null
    );
  }

  function actionButtons(d) {
    const verifying = state.verifying.has(d.id);
    return [
      h('button', {
        type: 'button', class: BTN, text: 'DNS setup',
        'aria-label': `DNS setup for ${d.domain}`,
        dataset: { dmAction: 'dns', dmId: d.id },
      }),
      d.status !== 'verified'
        ? h('button', {
            type: 'button', class: BTN, text: verifying ? 'Checking\u2026' : 'Verify',
            'aria-label': `Verify ${d.domain}`, disabled: verifying,
            dataset: { dmAction: 'verify', dmId: d.id },
          })
        : null,
      h('button', {
        type: 'button', class: BTN_DANGER, text: 'Remove',
        'aria-label': `Remove ${d.domain}`,
        dataset: { dmAction: 'delete', dmId: d.id },
      }),
    ];
  }

  function tableRow(d) {
    return h(
      'tr', {},
      h('td', { class: 'px-5 py-3.5 align-top' }, h('span', { class: 'break-all font-medium text-slate-900', text: d.domain })),
      h('td', { class: 'px-4 py-3.5 align-top' }, statusBlock(d)),
      h('td', { class: 'whitespace-nowrap px-4 py-3.5 align-top text-slate-500', text: formatDate(d.createdAt) }),
      h('td', { class: 'px-5 py-3.5 align-top' }, h('div', { class: 'flex justify-end gap-1.5' }, actionButtons(d)))
    );
  }

  function cardItem(d) {
    return h(
      'li', { class: 'space-y-3 px-4 py-4' },
      h('p', { class: 'break-all text-sm font-medium text-slate-900', text: d.domain }),
      h('div', { class: 'flex flex-wrap items-start justify-between gap-2' },
        statusBlock(d),
        h('span', { class: 'text-xs text-slate-500', text: `Added ${formatDate(d.createdAt)}` })
      ),
      h('div', { class: 'flex flex-wrap gap-1.5' }, actionButtons(d))
    );
  }

  function renderStats() {
    if (!state.loaded) {
      els.statTotal.textContent = '\u2013';
      els.statVerified.textContent = '\u2013';
      els.statPending.textContent = '\u2013';
      els.statTotalSub.textContent = '';
      return;
    }
    const total = state.domains.length;
    const verified = state.domains.filter((d) => d.status === 'verified').length;
    const pending = total - verified;
    els.statTotal.textContent = String(total);
    els.statVerified.textContent = String(verified);
    els.statPending.textContent = String(pending);
    els.statTotalSub.textContent =
      total === 0 ? '' : pending > 0 ? `${pending} awaiting DNS verification` : 'All domains DNS-verified';
  }

  function render() {
    renderStats();
    if (!state.loaded) return;
    if (!state.domains.length) {
      showView('empty');
      return;
    }
    const sorted = [...state.domains].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
    els.body.replaceChildren(...sorted.map(tableRow));
    els.cards.replaceChildren(...sorted.map(cardItem));
    showView('list');
    syncVerifyButton();
  }

  function focusRowAction(id, action) {
    const candidates = els.listWrap.querySelectorAll(`[data-dm-action="${action}"]`);
    for (const el of candidates) {
      if (el.dataset.dmId === id && el.offsetParent !== null) {
        el.focus();
        return;
      }
    }
  }

  /* ---------- loading ---------- */

  async function load({ silent = false } = {}) {
    const seq = ++state.loadSeq;
    if (!silent && !state.loaded) showView('loading');
    try {
      const payload = await api.listDomains();
      if (seq !== state.loadSeq) return;
      state.domains = parseList(payload);
      state.loaded = true;
      state.lastLoadAt = Date.now();
      setNotice('');
      render();
    } catch (err) {
      if (seq !== state.loadSeq) return;
      if (state.loaded) {
        if (!silent) toast(errorMessage(err, "Couldn't refresh your domains."), 'error');
        return;
      }
      if (err && err.status === 404) {
        setNotice("The domains API wasn't found on the server (GET /api/domains). Add the endpoints to server.js, then try again.");
      }
      els.errorMsg.textContent = errorMessage(err, 'Check your connection and try again.');
      renderStats();
      showView('error');
    }
  }

  /* ---------- add domain ---------- */

  function clearAddErrors() {
    show(els.domainError, false);
    els.domainError.textContent = '';
    els.domain.removeAttribute('aria-invalid');
    show(els.addError, false);
    els.addError.textContent = '';
  }

  function showFieldError(message) {
    els.domainError.textContent = message;
    show(els.domainError, true);
    els.domain.setAttribute('aria-invalid', 'true');
  }

  function setAdding(on) {
    state.adding = on;
    els.addSubmit.disabled = on;
    els.domain.readOnly = on;
    show(els.addSpinner, on);
    els.addSubmitLabel.textContent = on ? 'Adding\u2026' : 'Add domain';
  }

  function openAdd() {
    if (els.addDialog.open) return;
    els.addForm.reset();
    clearAddErrors();
    setAdding(false);
    els.addDialog.showModal();
    els.domain.focus();
  }

  async function onAddSubmit(event) {
    event.preventDefault();
    if (state.adding) return;
    clearAddErrors();

    const result = normalizeDomainInput(els.domain.value);
    if (result.error) {
      showFieldError(result.error);
      els.domain.focus();
      return;
    }
    const value = result.value;
    els.domain.value = value;

    if (state.domains.some((d) => d.domain.toLowerCase() === value)) {
      showFieldError("You've already added this domain.");
      els.domain.focus();
      return;
    }

    setAdding(true);
    try {
      const payload = await api.addDomain({ domain: value });
      const created = extractDomain(payload);
      if (!created) throw new UiError('Unexpected response from the server.');
      mergeDomain(created);
      if (state.loaded) render();
      else load({ silent: true });

      setAdding(false);
      els.addDialog.close();
      announce(`${created.domain} added. DNS setup instructions are open.`);
      openDns(created.id, parseRecords(payload));
    } catch (err) {
      setAdding(false);
      els.addError.textContent = errorMessage(err, "We couldn't add this domain. Check your connection and try again.");
      show(els.addError, true);
    }
  }

  /* ---------- DNS dialog ---------- */

  function resetDnsMessages() {
    for (const el of [els.dnsLoading, els.dnsEmpty, els.dnsFail, els.dnsError, els.dnsResult]) {
      show(el, false);
      el.textContent = el.id === 'dm-dns-loading' || el.id === 'dm-dns-empty' ? el.textContent : '';
    }
  }

  function renderDnsStatus(d) {
    els.dnsStatus.replaceChildren(statusBadge(d));
  }

  function syncVerifyButton() {
    const busy = state.dnsId != null && state.verifying.has(state.dnsId);
    els.dnsVerify.disabled = busy || state.dnsId == null;
    show(els.dnsSpinner, busy);
    els.dnsVerifyLabel.textContent = busy ? 'Checking\u2026' : 'Check verification';
  }

  function recordField(label, value, copyable) {
    return h(
      'div', { class: 'flex items-start gap-2' },
      h('div', { class: 'min-w-0 flex-1' },
        h('p', { class: 'text-xs font-medium text-slate-500', text: label }),
        h('code', { class: 'mt-1 block break-all rounded-md bg-slate-50 px-2.5 py-2 font-mono text-xs text-slate-800', text: value })
      ),
      copyable
        ? h('button', {
            type: 'button', class: `${BTN} mt-5 shrink-0`, 'aria-label': `Copy ${label.toLowerCase()}`,
            dataset: { dmCopy: value },
          }, h('span', { text: 'Copy' }))
        : null
    );
  }

  function renderRecords(records) {
    els.dnsRecords.replaceChildren(
      ...records.map((r) =>
        h(
          'div', { class: 'space-y-3 rounded-lg border border-slate-200 p-3.5' },
          r.purpose ? h('p', { class: 'text-xs font-semibold text-slate-700', text: r.purpose }) : null,
          recordField('Type', r.type, false),
          recordField('Name / Host', r.name, true),
          recordField('Value', r.value, true),
          r.ttl ? recordField('TTL', r.ttl, false) : null
        )
      )
    );
  }

  async function openDns(id, preloadedRecords) {
    const d = findDomain(id);
    if (!d) return;
    state.dnsId = id;
    const seq = ++state.dnsSeq;

    els.dnsDomain.textContent = d.domain;
    renderDnsStatus(d);
    resetDnsMessages();
    els.dnsRecords.replaceChildren();
    syncVerifyButton();
    if (!els.dnsDialog.open) els.dnsDialog.showModal();

    if (preloadedRecords && preloadedRecords.length) {
      renderRecords(preloadedRecords);
      return;
    }

    show(els.dnsLoading, true);
    try {
      const payload = await api.getDomain(id);
      if (seq !== state.dnsSeq) return;
      const fresh = extractDomain(payload);
      if (fresh) {
        mergeDomain(fresh);
        render();
        renderDnsStatus(fresh);
      }
      const records = parseRecords(payload);
      if (records.length) renderRecords(records);
      else show(els.dnsEmpty, true);
    } catch (err) {
      if (seq !== state.dnsSeq) return;
      els.dnsFail.textContent = errorMessage(err, "We couldn't load the DNS instructions. Close this and try again.");
      show(els.dnsFail, true);
    } finally {
      if (seq === state.dnsSeq) show(els.dnsLoading, false);
    }
  }

  async function copyText(text, container) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      /* fall through to legacy path */
    }
    try {
      const ta = h('textarea', { 'aria-hidden': 'true', readonly: true, style: 'position:fixed;opacity:0;top:0;left:0' });
      ta.value = text;
      (container || document.body).append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  async function onCopyClick(btn) {
    const ok = await copyText(btn.dataset.dmCopy, btn.closest('dialog'));
    const label = btn.querySelector('span');
    if (!label) return;
    label.textContent = ok ? 'Copied' : 'Copy failed';
    announce(ok ? 'Copied to clipboard' : 'Copy failed. Select the text and copy it manually.');
    clearTimeout(btn._dmTimer);
    btn._dmTimer = setTimeout(() => { label.textContent = 'Copy'; }, 1600);
  }

  /* ---------- verification (status only ever comes from the API) ---------- */

  async function runVerify(id) {
    if (state.verifying.has(id)) return;
    const before = findDomain(id);
    if (!before) return;

    state.verifying.add(id);
    const dialogOpenForId = () => els.dnsDialog.open && state.dnsId === id;
    if (dialogOpenForId()) {
      show(els.dnsError, false);
      show(els.dnsResult, false);
    }
    render();

    let outcome; // { tone, message }
    try {
      const payload = await api.verifyDomain(id);
      let updated = extractDomain(payload);
      if (!updated) updated = extractDomain(await api.getDomain(id));
      if (!updated) throw new UiError('Unexpected response from the server.');
      mergeDomain(updated);

      if (updated.status === 'verified') {
        outcome = {
          tone: 'success',
          message: updated.ready
            ? 'DNS record found. This domain is verified and ready for short links.'
            : "DNS record found. This domain is verified. Short links won't work on it until routing and HTTPS are set up for it.",
        };
      } else {
        const serverMsg = payload && typeof payload.message === 'string' ? payload.message.trim() : '';
        outcome = {
          tone: 'neutral',
          message:
            serverMsg ||
            "We couldn't find the DNS record yet. DNS changes can take up to 48 hours to propagate, so try again later.",
        };
      }
    } catch (err) {
      outcome = { tone: 'error', message: errorMessage(err, "We couldn't check verification. Check your connection and try again.") };
    } finally {
      state.verifying.delete(id);
    }

    render();
    const current = findDomain(id);
    if (dialogOpenForId()) {
      if (current) renderDnsStatus(current);
      if (outcome.tone === 'error') {
        els.dnsError.textContent = outcome.message;
        show(els.dnsError, true);
      } else {
        els.dnsResult.textContent = outcome.message;
        setTone(els.dnsResult, outcome.tone);
        show(els.dnsResult, true);
      }
      announce(outcome.message);
    } else {
      toast(outcome.message, outcome.tone === 'error' ? 'error' : 'neutral');
      focusRowAction(id, 'verify');
    }
    syncVerifyButton();
  }

  /* ---------- delete ---------- */

  function setDeleting(on) {
    state.deleting = on;
    els.deleteConfirm.disabled = on;
    els.deleteCancel.disabled = on;
    els.deleteConfirm.textContent = on ? 'Removing\u2026' : 'Remove domain';
  }

  function openDelete(id) {
    const d = findDomain(id);
    if (!d) return;
    state.deleteId = id;
    els.deleteName.textContent = d.domain;
    els.deleteDetail.textContent = "Short links that use this domain may stop working. This can't be undone.";
    els.deleteError.textContent = '';
    show(els.deleteError, false);
    setDeleting(false);
    els.deleteDialog.showModal();
  }

  async function confirmDelete() {
    if (state.deleting || !state.deleteId) return;
    const id = state.deleteId;
    const d = findDomain(id);
    setDeleting(true);
    show(els.deleteError, false);
    try {
      await api.deleteDomain(id);
    } catch (err) {
      if (!(err && err.status === 404)) { // 404 = already gone, treat as removed
        setDeleting(false);
        els.deleteError.textContent = errorMessage(err, "We couldn't remove this domain. Check your connection and try again.");
        show(els.deleteError, true);
        return;
      }
    }
    state.domains = state.domains.filter((x) => x.id !== id);
    state.verifying.delete(id);
    setDeleting(false);
    els.deleteDialog.close();
    render();
    toast(d ? `${d.domain} removed` : 'Domain removed');
  }

  /* ---------- dialog plumbing ---------- */

  function bindBackdropClose(dialog, isBusy) {
    let downOnBackdrop = false;
    dialog.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === dialog; });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog && downOnBackdrop && !isBusy()) dialog.close();
    });
    dialog.addEventListener('cancel', (e) => { if (isBusy()) e.preventDefault(); }); // Esc key
  }

  bindBackdropClose(els.addDialog, () => state.adding);
  bindBackdropClose(els.dnsDialog, () => false);
  bindBackdropClose(els.deleteDialog, () => state.deleting);

  els.addDialog.addEventListener('close', () => {
    els.addForm.reset();
    clearAddErrors();
  });
  els.dnsDialog.addEventListener('close', () => {
    state.dnsSeq += 1; // ignore any in-flight getDomain for this dialog
    state.dnsId = null;
    els.dnsRecords.replaceChildren();
    resetDnsMessages();
    syncVerifyButton();
  });
  els.deleteDialog.addEventListener('close', () => { state.deleteId = null; });

  /* ---------- events (bound once, delegated where it makes sense) ---------- */

  els.add.addEventListener('click', openAdd);
  els.emptyAdd.addEventListener('click', openAdd);
  els.retry.addEventListener('click', () => load());
  els.addForm.addEventListener('submit', onAddSubmit);
  els.domain.addEventListener('input', clearAddErrors);
  els.dnsVerify.addEventListener('click', () => { if (state.dnsId) runVerify(state.dnsId); });
  els.deleteCancel.addEventListener('click', () => { if (!state.deleting) els.deleteDialog.close(); });
  els.deleteConfirm.addEventListener('click', confirmDelete);

  // Close buttons (add + DNS dialogs)
  section.addEventListener('click', (e) => {
    if (e.target.closest('[data-dm-close-add]') && !state.adding) els.addDialog.close();
    if (e.target.closest('[data-dm-close-dns]')) els.dnsDialog.close();
  });

  // Row/card actions (table + mobile cards share one listener)
  els.listWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-dm-action]');
    if (!btn || btn.disabled || !els.listWrap.contains(btn)) return;
    const { dmAction: action, dmId: id } = btn.dataset;
    if (action === 'dns') openDns(id);
    else if (action === 'verify') runVerify(id);
    else if (action === 'delete') openDelete(id);
  });

  // Copy buttons inside the DNS dialog
  els.dnsRecords.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-dm-copy]');
    if (btn && els.dnsRecords.contains(btn)) onCopyClick(btn);
  });

  // Refresh when the dashboard navigation re-shows this section
  let wasVisible = !section.classList.contains('hidden');
  new MutationObserver(() => {
    const visible = !section.classList.contains('hidden');
    if (visible && !wasVisible && (!state.loaded || Date.now() - state.lastLoadAt > STALE_MS)) {
      load({ silent: state.loaded });
    }
    wasVisible = visible;
  }).observe(section, { attributes: true, attributeFilter: ['class'] });

  /* ---------- start ---------- */

  const missingMethods = API_METHODS.filter((m) => typeof (api && api[m]) !== 'function');
  if (missingMethods.length) {
    setNotice(`The domains API isn't connected (missing: ${missingMethods.join(', ')}).`);
    els.errorMsg.textContent = "The domains API isn't connected yet.";
    show(els.retry, false);
    els.add.disabled = true;
    els.add.classList.add('opacity-60', 'cursor-not-allowed');
    renderStats();
    showView('error');
    return null;
  }

  section.dataset.dmReady = '1';
  controller = { refresh: () => load({ silent: state.loaded }) };
  renderStats();
  load();
  return controller;
}