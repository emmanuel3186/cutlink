
/* ---------- Helpers ---------- */
function h(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text; // textContent: dynamic values can never inject HTML
  return n;
}
const nf = new Intl.NumberFormat();
const fmtDate = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' });
};
const stripProto = (u) => (u || '').replace(/^https?:\/\//i, '');
const shortDisplay = (u) => (/^https?:\/\//i.test(u) ? stripProto(u) : (u || '').includes('/') ? u : `${window.location.host}/${u}`);
const shortFull = (u) => (/^https?:\/\//i.test(u) ? u : `${window.location.protocol}//${shortDisplay(u)}`);

const svg = (inner, cls = 'h-4 w-4') =>
  `<svg class="${cls}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICON = {
  link: svg('<path d="M8.5 11.5a3.5 3.5 0 005 0l2.5-2.5a3.5 3.5 0 00-5-5l-1 1"/><path d="M11.5 8.5a3.5 3.5 0 00-5 0L4 11a3.5 3.5 0 005 5l1-1"/>'),
  copy: svg('<rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M13 7V5.5A1.5 1.5 0 0011.5 4h-6A1.5 1.5 0 004 5.5v6A1.5 1.5 0 005.5 13H7"/>'),
  check: svg('<path d="M4 10.5l4 4 8-9"/>'),
  alert: svg('<circle cx="10" cy="10" r="7.5"/><path d="M10 6v4.5M10 13.5h.01"/>'),
  chart: svg('<path d="M3.5 16.5h13M6 14V9m4 5V5m4 9v-3.5"/>'),
};

function normalize(raw) {
  return {
    id: String(raw.id ?? raw._id ?? ''),
    name: String(raw.name ?? '').trim(),
    shortUrl: String(raw.shortUrl ?? ''),
    source: String(raw.source ?? ''),
    medium: String(raw.medium ?? ''),
    clicks: Number(raw.clicks) || 0,
    sources: Array.isArray(raw.sources) ? raw.sources : [],
    links: Array.isArray(raw.links) ? raw.links : [],
    createdAt: raw.createdAt ?? null,
    status: raw.status != null ? String(raw.status) : null,
  };
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch (_) { /* fall back below */ }
  try {
    const ta = h('textarea'); ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch (_) { return false; }
}

/* ---------- Form logic (pure, no DOM) ---------- */
const UTM_VALUE = /^[A-Za-z0-9._~-]+$/;

function validate(v) {
  const e = {};
  if (!v.name) e.name = 'Enter a campaign name.';
  else if (v.name.length > 80) e.name = 'Use 80 characters or fewer.';

  if (!v.url) e.url = 'Enter a destination URL.';
  else {
    let ok = false;
    try { const u = new URL(v.url); ok = u.protocol === 'http:' || u.protocol === 'https:'; } catch (_) { /* invalid */ }
    if (!ok) e.url = 'Enter a full URL starting with http:// or https://';
  }
  [['source', 'a UTM source', 'instagram'], ['medium', 'a UTM medium', 'social'], ['campaign', 'a campaign identifier', 'black-friday-2026']]
    .forEach(([key, what, example]) => {
      if (!v[key]) e[key] = `Enter ${what}, for example "${example}".`;
      else if (!UTM_VALUE.test(v[key])) e[key] = 'Use letters, numbers, hyphens or underscores only (no spaces).';
    });
  return e;
}

function buildTaggedUrl(v) {
  const u = new URL(v.url);
  const replaced = ['utm_source', 'utm_medium', 'utm_campaign'].some((k) => u.searchParams.has(k));
  u.searchParams.set('utm_source', v.source);
  u.searchParams.set('utm_medium', v.medium);
  u.searchParams.set('utm_campaign', v.campaign);
  return { taggedUrl: u.toString(), replaced };
}

/* ---------- Init ---------- */
export function initCampaignsTab(options = {}) {
  const { getCampaigns, createCampaign, onViewAnalytics } = options;

  const section = document.getElementById('campaigns');
  if (!section) { console.warn('Campaigns: #campaigns not found on this page.'); return; }
  if (section.dataset.cmReady) return; // safe to call twice
  section.dataset.cmReady = '1';

  const $ = (id) => document.getElementById(id);
  const el = {
    create: $('cm-create'), emptyCreate: $('cm-empty-create'), notice: $('cm-notice'), status: $('cm-status'), toast: $('cm-toast'),
    statTotal: $('cm-stat-total'), statClicks: $('cm-stat-clicks'), statActive: $('cm-stat-active'), statActiveSub: $('cm-stat-active-sub'),
    loading: $('cm-loading'), error: $('cm-error'), errorMsg: $('cm-error-msg'), retry: $('cm-retry'),
    empty: $('cm-empty'), tableWrap: $('cm-table-wrap'), body: $('cm-body'), cards: $('cm-cards'),
    dialog: $('cm-dialog'), form: $('cm-form'), submit: $('cm-submit'), spinner: $('cm-spinner'), submitLabel: $('cm-submit-label'),
    formError: $('cm-form-error'), result: $('cm-result'), resultUrl: $('cm-result-url'), resultCopy: $('cm-result-copy'), resultReplaced: $('cm-result-replaced'),
    fields: { name: $('cm-name'), url: $('cm-url'), source: $('cm-source'), medium: $('cm-medium'), campaign: $('cm-campaign') },
    errors: { name: $('cm-name-error'), url: $('cm-url-error'), source: $('cm-source-error'), medium: $('cm-medium-error'), campaign: $('cm-campaign-error') },
  };

  const state = { all: [], status: 'loading', submitting: false };
  const announce = (m) => { el.status.textContent = m; };

  let toastTimer;
  function toast(message, ok = true) {
    el.toast.textContent = message;
    el.toast.className = `pointer-events-none fixed inset-x-4 bottom-4 z-60 mx-auto max-w-sm rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${ok ? 'bg-slate-900' : 'bg-red-600'}`;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 3500);
  }

  /* ----- Rendering ----- */
  function showPanel(name) {
    [['loading', el.loading], ['error', el.error], ['empty', el.empty], ['ready', el.tableWrap]]
      .forEach(([k, n]) => n.classList.toggle('hidden', k !== name));
    state.status = name;
  }

  function renderSummary(list) {
    if (!list) { // data source not connected: say so, never show zeros
      [el.statTotal, el.statClicks, el.statActive].forEach((n) => { n.textContent = '—'; });
      el.statActiveSub.textContent = ''; return;
    }
    el.statTotal.textContent = nf.format(list.length);
    el.statClicks.textContent = nf.format(list.reduce((n, c) => n + c.clicks, 0));
    // "Active" depends on a status your data must provide; without one we don't guess.
    if (list.some((c) => c.status)) {
      el.statActive.textContent = nf.format(list.filter((c) => (c.status || '').toLowerCase() === 'active').length);
      el.statActiveSub.textContent = '';
    } else {
      el.statActive.textContent = '—'; el.statActiveSub.textContent = list.length ? 'No status provided' : '';
    }
  }

  const ICON_BTN = 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500/50';
  const LIST_BTN = 'inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500/50';
  const displayName = (c) => c.name || 'Untitled campaign';

  function srcMedium(c) {
    const s = h('span', 'text-sm text-slate-600');
    s.append(c.source || '—', h('span', 'px-1 text-slate-300', '/'), c.medium || '—');
    return s;
  }

  function renderSourceBreakdown(c) {
    const wrap = h('div', 'min-w-0 space-y-1');

    if (!c.sources.length) {
      wrap.append(
        h('p', 'text-xs text-slate-400', 'No source data yet')
      );
      return wrap;
    }

    c.sources.forEach(item => {
      const row = h(
        'div',
        'flex items-center justify-between gap-3 text-xs'
      );
      const count = Number(item.clicks) || 0;
      row.append(
        h(
          'span',
          'truncate text-slate-500',
          item.source || 'Unknown'
        ),
        h(
          'span',
          'shrink-0 font-medium tabular-nums text-slate-700',
          `${count} ${count === 1 ? 'click' : 'clicks'}`
        )
      );

      wrap.append(row);
    });

    return wrap;
  }

  function actionButtons(c, mobile) {
    const out = [];
    const copy = h('button', mobile ? LIST_BTN : ICON_BTN);
    copy.type = 'button'; copy.dataset.action = 'copy'; copy.dataset.id = c.id;
    copy.setAttribute('aria-label', `Copy short link for ${displayName(c)}`);
    if (!mobile) copy.title = 'Copy short link';
    copy.innerHTML = mobile ? `${ICON.copy}<span data-label>Copy link</span>` : ICON.copy;
    out.push(copy);
    if (typeof onViewAnalytics === 'function') {
      const a = h('button', mobile ? LIST_BTN : ICON_BTN);
      a.type = 'button'; a.dataset.action = 'analytics'; a.dataset.id = c.id;
      a.setAttribute('aria-label', `View analytics for ${displayName(c)}`);
      if (!mobile) a.title = 'View analytics';
      a.innerHTML = mobile ? `${ICON.chart}Analytics` : ICON.chart;
      out.push(a);
    }
    return out;
  }

  function renderCampaignLinks(c) {
    const wrap = h('div', 'space-y-2');

    const links = c.links.length
      ? c.links
      : [{
          shortUrl: c.shortUrl,
          source: c.source,
          medium: c.medium,
          clicks: c.clicks
        }];

    links.forEach(link => {
      const item = h('div', 'min-w-0');

      const shortLink = h(
        'a',
        'block break-all text-sm font-medium text-indigo-600 hover:text-indigo-800',
        shortDisplay(link.shortUrl)
      );

      shortLink.href = link.shortUrl;
      shortLink.target = '_blank';
      shortLink.rel = 'noopener noreferrer';

      const details = h(
        'p',
        'mt-0.5 text-xs text-slate-500',
        `${link.source || 'Unknown'} / ${link.medium || '—'} · ${nf.format(Number(link.clicks) || 0)} ${(Number(link.clicks) || 0) === 1 ? 'click' : 'clicks'}`
      );

      item.append(shortLink, details);
      wrap.append(item);
    });

    return wrap;
  }

  function buildRow(c) {
    const tr = h(
      'tr',
      'transition-colors duration-150 hover:bg-slate-50/70'
    );

    const name = h('td', 'max-w-[16rem] px-5 py-3.5 align-middle');
    const nm = h(
      'div',
      'truncate text-sm font-medium text-slate-900',
      displayName(c)
    );
    nm.title = displayName(c);
    name.append(nm);

    const link = h('td', 'min-w-[14rem] px-4 py-3.5 align-middle');
    link.append(renderCampaignLinks(c));

    const sm = h(
      'td',
      'hidden min-w-[10rem] px-4 py-3.5 align-middle md:table-cell'
    );
    const sourceContent = h('div', 'min-w-0 space-y-1');
    sourceContent.append(renderSourceBreakdown(c));
    sm.append(sourceContent);

    const clicks = h(
      'td',
      'whitespace-nowrap px-4 py-3.5 text-right align-middle text-sm font-semibold tabular-nums text-slate-900',
      nf.format(c.clicks)
    );

    const date = h(
      'td',
      'hidden whitespace-nowrap px-4 py-3.5 align-middle text-xs text-slate-500 lg:table-cell',
      fmtDate(c.createdAt)
    );

    const act = h('td', 'whitespace-nowrap px-5 py-3.5 text-right align-middle');
    const wrap = h('div', 'flex items-center justify-end gap-1');
    wrap.append(...actionButtons(c, false));
    act.append(wrap);

    tr.append(name, link, sm, clicks, date, act);

    return tr;
  }

  function buildCard(c) {
    const li = h('li', 'space-y-3 p-4');

    const top = h('div', 'flex items-start justify-between gap-3');
    const info = h('div', 'min-w-0');

    info.append(
      h('p', 'truncate text-sm font-semibold text-slate-900', displayName(c))
    );

    const clicks = h('div', 'shrink-0 text-right');
    clicks.append(
      h(
        'p',
        'text-sm font-semibold tabular-nums text-slate-900',
        nf.format(c.clicks)
      ),
      h(
        'p',
        'text-xs text-slate-500',
        c.clicks === 1 ? 'click' : 'clicks'
      )
    );

    top.append(info, clicks);

    const linksSection = h('div', 'rounded-lg border border-slate-200 p-3');
    linksSection.append(
      h(
        'p',
        'mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500',
        'Campaign links'
      ),
      renderCampaignLinks(c)
    );

    const breakdownSection = h('div', 'rounded-lg bg-slate-50 p-3');
    breakdownSection.append(
      h(
        'p',
        'mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500',
        'Clicks by source'
      ),
      renderSourceBreakdown(c)
    );

    const date = h(
      'p',
      'text-xs text-slate-500',
      `Created ${fmtDate(c.createdAt)}`
    );

    const acts = h('div', 'flex flex-wrap gap-2');
    acts.append(...actionButtons(c, true));

    li.append(top, linksSection, breakdownSection, date, acts);

    return li;
  }

  function render() {
    renderSummary(state.status === 'ready' || state.status === 'empty' ? state.all : null);
    if (state.status !== 'ready') return;
    el.body.replaceChildren(...state.all.map(buildRow));
    el.cards.replaceChildren(...state.all.map(buildCard));
  }

  /* ----- Loading ----- */
  async function load() {
    if (typeof getCampaigns !== 'function') { // not connected: no data, and we say so
      el.notice.classList.remove('hidden'); el.notice.classList.add('flex');
      state.all = []; showPanel('empty'); renderSummary(null); return;
    }
    showPanel('loading'); renderSummary(null); announce('Loading campaigns');
    try {
      const list = await getCampaigns();
      if (!Array.isArray(list)) throw new Error('getCampaigns must resolve an array');
      state.all = list.map(normalize);
      showPanel(state.all.length ? 'ready' : 'empty');
      render(); announce(`${state.all.length} campaigns loaded`);
    } catch (err) {
      console.error('Campaigns failed to load:', err);
      el.errorMsg.textContent = 'Check your connection and try again.';
      showPanel('error'); renderSummary(null); announce("We couldn't load your campaigns");
    }
  }

  /* ----- Copy (table, cards, and the generated URL in the dialog) ----- */
  async function flashCopy(btn, ok) {
    const label = btn.querySelector('[data-label]');
    if (!btn._orig) btn._orig = { html: btn.innerHTML, text: label ? label.textContent : btn.textContent };
    const tone = ok ? 'text-emerald-600' : 'text-red-600';
    if (label) label.textContent = ok ? 'Copied' : 'Copy failed';
    else if (btn.dataset.action === 'copy') btn.innerHTML = ok ? ICON.check : ICON.alert;
    else btn.textContent = ok ? 'Copied' : 'Copy failed';
    btn.classList.add(tone);
    clearTimeout(btn._t);
    btn._t = setTimeout(() => {
      if (label) label.textContent = btn._orig.text;
      else if (btn.dataset.action === 'copy') btn.innerHTML = btn._orig.html;
      else btn.textContent = btn._orig.text;
      btn.classList.remove('text-emerald-600', 'text-red-600');
    }, 1600);
  }
  async function copyWithFeedback(btn, text) {
    const ok = await copyText(text);
    flashCopy(btn, ok);
    toast(ok ? 'Copied to clipboard' : 'Could not copy. Select the text and copy it manually.', ok);
  }

  el.tableWrap.addEventListener('click', (e) => { // one delegated listener for table + cards
    const btn = e.target.closest('[data-action]');
    if (!btn || !el.tableWrap.contains(btn)) return;
    const c = state.all.find((x) => x.id === btn.dataset.id);
    if (!c) return;
    if (btn.dataset.action === 'copy') {
      if (!c.shortUrl) return toast('This campaign has no short link yet.', false);
      copyWithFeedback(btn, shortFull(c.shortUrl));
    }
    if (btn.dataset.action === 'analytics' && typeof onViewAnalytics === 'function') onViewAnalytics(c);
  });

  /* ----- Create dialog ----- */
  const values = () => Object.fromEntries(Object.entries(el.fields).map(([k, n]) => [k, n.value.trim()]));

  function showErrors(errors) {
    Object.keys(el.fields).forEach((k) => {
      const msg = errors[k], input = el.fields[k], p = el.errors[k];
      p.textContent = msg || ''; p.classList.toggle('hidden', !msg);
      input.classList.toggle('border-red-400', !!msg);
      if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    });
  }

  function setView(view) {
    el.form.classList.toggle('hidden', view !== 'form');
    el.result.classList.toggle('hidden', view !== 'result');
    el.result.classList.toggle('flex', view === 'result');
  }

  function setSubmitting(on) {
    state.submitting = on; el.submit.disabled = on;
    el.spinner.classList.toggle('hidden', !on);
    el.submitLabel.textContent = on ? 'Generating…' : 'Generate campaign link';
  }

  function openCreate() {
    el.form.reset(); showErrors({}); el.formError.classList.add('hidden');
    setSubmitting(false); setView('form');
    if (!el.dialog.open) el.dialog.showModal();
    el.fields.name.focus();
  }
  const closeDialog = () => { if (el.dialog.open) el.dialog.close(); };

  async function onSubmit(e) {
    e.preventDefault();
    if (state.submitting) return;
    el.formError.classList.add('hidden');
    const v = values();
    const errors = validate(v);
    showErrors(errors);
    const firstBad = Object.keys(el.fields).find((k) => errors[k]);
    if (firstBad) return el.fields[firstBad].focus();

    const { taggedUrl, replaced } = buildTaggedUrl(v);
    const token = localStorage.getItem('authToken');
    if (!token) {
      el.formError.textContent = 'Your session has expired. Please log in again.';
      el.formError.classList.remove('hidden');
      return;
    }

    if (typeof createCampaign !== 'function') { // saving isn't connected: show what we can really produce
      el.resultUrl.value = taggedUrl;
      el.resultReplaced.classList.toggle('hidden', !replaced);
      setView('result'); return;
    }
    setSubmitting(true);
    try {
      await createCampaign({ name: v.name, destinationUrl: v.url, utmSource: v.source, utmMedium: v.medium, utmCampaign: v.campaign, taggedUrl });
      closeDialog(); toast('Campaign created');
      await load(); // the list always comes from the server, never from the form
    } catch (err) {
      console.error('Create campaign failed:', err);
      el.formError.textContent = `We couldn't create the campaign. ${(err && err.message) || 'Please try again.'}`;
      el.formError.classList.remove('hidden');
    } finally {
      setSubmitting(false);
    }
  }

  /* ----- Events (all scoped to this section; nothing global) ----- */
  el.create.addEventListener('click', openCreate);
  el.emptyCreate.addEventListener('click', openCreate);
  el.retry.addEventListener('click', load);
  el.form.addEventListener('submit', onSubmit);
  Object.entries(el.fields).forEach(([k, input]) => input.addEventListener('input', () => { // clear a field's error as soon as the user edits it
    if (!el.errors[k].textContent) return;
    el.errors[k].textContent = ''; el.errors[k].classList.add('hidden');
    input.classList.remove('border-red-400'); input.removeAttribute('aria-invalid');
  }));
  el.resultCopy.addEventListener('click', () => copyWithFeedback(el.resultCopy, el.resultUrl.value));
  section.querySelectorAll('[data-cm-close]').forEach((b) => b.addEventListener('click', closeDialog));
  el.dialog.addEventListener('click', (e) => { if (e.target === el.dialog) closeDialog(); }); // backdrop click

  /* ----- First load when the tab becomes visible ----- */
  const isVisible = () => !section.classList.contains('hidden');
  let started = false;
  const onShown = () => { if (!started) { started = true; load(); } };
  if (isVisible()) onShown();
  let wasVisible = isVisible();
  new MutationObserver(() => {
    const now = isVisible();
    if (now && !wasVisible) onShown();
    wasVisible = now;
  }).observe(section, { attributes: true, attributeFilter: ['class'] });
}

if (typeof window !== 'undefined') window.initCampaignsTab = initCampaignsTab;