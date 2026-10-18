const DEFAULT_ENDPOINT = '/api/analytics';
const RANGES = ['7d', '30d', '90d', 'all']; // values the backend accepts

/* ---------- Helpers ---------- */
function h(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text; // textContent: dynamic values can never inject HTML
  return n;
}
const nf = new Intl.NumberFormat();
const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);
const fmtPct = (v) => (v > 0 && v < 1 ? '<1%' : `${Math.round(v)}%`);
const sum = (items) => items.reduce((n, x) => n + x.clicks, 0);
const isUnknownLabel = (l) => /^(unknown|other|xx|n\/a|none|)$/i.test(String(l).trim());

let regionNames = null;
try { regionNames = new Intl.DisplayNames(undefined, { type: 'region' }); } catch (_) { /* older browsers: show labels as-is */ }

// "NG" -> { name: "Nigeria", code: "NG" }; anything else is shown exactly as the API sent it.
function countryDisplay(label) {
  const code = /^[A-Za-z]{2}$/.test(label) && !isUnknownLabel(label) ? label.toUpperCase() : null;
  if (code && regionNames) {
    try { const name = regionNames.of(code); if (name && name !== code) return { name, code }; } catch (_) { /* invalid code */ }
  }
  return { name: label, code };
}

/* ---------- Response handling ---------- */
async function unwrap(result) {
  // Works whether your helper returns parsed JSON or a fetch Response.
  if (result && typeof result.json === 'function' && 'ok' in result) {
    if (!result.ok) throw new Error(`Request failed (${result.status})`);
    return result.json();
  }
  return result;
}

function cleanList(list, name) {
  if (!Array.isArray(list)) throw new Error(`Unexpected response: "${name}" is not a list`);
  return list
    .map((x) => ({ label: String(x && x.label != null ? x.label : 'Unknown'), clicks: Number(x && x.clicks) }))
    .filter((x) => Number.isFinite(x.clicks) && x.clicks > 0)
    .sort((a, b) => b.clicks - a.clicks);
}

function parseResponse(body) {
  if (!body || typeof body !== 'object' || body.success === false) {
    throw new Error((body && body.message) || 'The server reported a problem.');
  }
  const total = Number(body.totalClicks);
  if (!Number.isFinite(total)) throw new Error('Unexpected response: "totalClicks" is missing');
  return {
    total,
    devices: cleanList(body.devices, 'devices'),
    browsers: cleanList(body.browsers, 'browsers'),
    locations: cleanList(body.locations, 'locations'),
  };
}

/* ---------- Init ---------- */
export function initAudienceTab(options = {}) {
  const { request, getLinks, endpoint = DEFAULT_ENDPOINT } = options;

  const section = document.getElementById('audiences');
  if (!section) { console.warn('Audience: #audiences not found on this page.'); return; }
  if (section.dataset.auReady) return; // safe to call twice
  section.dataset.auReady = '1';

  const $ = (id) => document.getElementById(id);
  const el = {
    range: $('au-range'), link: $('au-link'), linkWrap: $('au-link-wrap'), status: $('au-status'),
    panels: { skeleton: $('au-skeleton'), error: $('au-error'), empty: $('au-empty'), content: $('au-content') },
    errorMsg: $('au-error-msg'), retry: $('au-retry'), emptyTitle: $('au-empty-title'), emptyText: $('au-empty-text'),
    countries: $('au-countries-body'), devices: $('au-devices-body'), browsers: $('au-browsers-body'), insights: $('au-insights-body'),
  };
  const kpi = (name) => ({ value: $(`au-kpi-${name}`), sub: $(`au-kpi-${name}-sub`) });
  const K = { clicks: kpi('clicks'), countries: kpi('countries'), mobile: kpi('mobile'), desktop: kpi('desktop') };

  const state = { range: RANGES.includes(el.range.value) ? el.range.value : '30d', linkId: '', reqId: 0, lastLoad: 0 };
  const announce = (m) => { el.status.textContent = m; };

  function show(name) {
    Object.entries(el.panels).forEach(([k, n]) => n.classList.toggle('hidden', k !== name));
  }

  /* ----- Data ----- */
  async function fetchAudience() {
    const data = await window.CutlinkAnalytics.fetchFromApi({
      range: state.range,
      linkId: state.linkId
    });

    return parseResponse(data);
  }

  /* ----- Rendering ----- */
  const clickWord = (n) => (n === 1 ? 'click' : 'clicks');
  const noData = (msg) => h('p', 'py-8 text-sm text-slate-400', msg);

  function coverageNote(items, total, what) {
    const missing = total - sum(items);
    if (missing <= 0) return null;
    return h('p', 'mt-4 text-xs text-slate-400', `${what} isn't available for ${nf.format(missing)} ${clickWord(missing)}.`);
  }

  function renderBars(target, items, total, { limit, labelOf, noDataMsg, what }) {
    if (!items.length) return target.replaceChildren(noData(noDataMsg));
    const list = h('ul', 'space-y-3.5');
    items.slice(0, limit).forEach((it, i) => {
      const p = pct(it.clicks, total);
      const li = h('li', 'space-y-1.5');
      const top = h('div', 'flex items-baseline justify-between gap-3 text-sm');
      const name = h('span', 'flex min-w-0 items-baseline gap-1.5 text-slate-700');
      const d = labelOf ? labelOf(it.label) : { name: it.label, code: null };
      const nm = h('span', 'truncate', d.name); nm.title = d.name;
      name.append(h('span', 'w-4 shrink-0 text-xs tabular-nums text-slate-400', String(i + 1)), nm);
      if (d.code) name.append(h('span', 'shrink-0 text-xs text-slate-400', d.code));
      const nums = h('span', 'shrink-0 tabular-nums text-slate-500');
      nums.append(h('span', 'font-medium text-slate-900', nf.format(it.clicks)), ` · ${fmtPct(p)}`);
      top.append(name, nums);
      const track = h('div', 'h-1.5 overflow-hidden rounded-full bg-slate-100'); track.setAttribute('aria-hidden', 'true');
      const fill = h('div', 'h-full rounded-full bg-indigo-600'); fill.style.width = `${Math.min(100, Math.max(p, 1.5))}%`;
      track.append(fill); li.append(top, track); list.append(li);
    });
    const kids = [list];
    const more = items.length - limit;
    if (more > 0) kids.push(h('p', 'mt-3 text-xs text-slate-400', `+ ${nf.format(more)} more not shown`));
    const note = coverageNote(items, total, what); if (note) kids.push(note);
    target.replaceChildren(...kids);
  }

  // Segments are separated by gaps, and every device is also written out with its count and
  // percentage, so the chart never relies on color alone.
  const SEG = ['bg-indigo-700', 'bg-indigo-500', 'bg-indigo-300', 'bg-slate-400', 'bg-slate-300', 'bg-slate-200'];
  function renderDevices(items, total) {
    if (!items.length) return el.devices.replaceChildren(noData('No device data for this period.'));
    const shown = items.slice(0, SEG.length);
    const bar = h('div', 'flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-slate-100');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', 'Share of clicks by device: ' + shown.map((x) => `${x.label} ${fmtPct(pct(x.clicks, total))}`).join(', '));
    shown.forEach((it, i) => {
      const seg = h('div', `h-full ${SEG[i]}`); seg.style.width = `${Math.min(100, pct(it.clicks, total))}%`; bar.append(seg);
    });
    const list = h('ul', 'mt-4 space-y-2.5');
    shown.forEach((it, i) => {
      const li = h('li', 'flex items-center justify-between gap-3 text-sm');
      const l = h('span', 'inline-flex min-w-0 items-center gap-2 text-slate-700');
      l.append(h('span', `h-2.5 w-2.5 shrink-0 rounded-sm ${SEG[i]}`), h('span', 'truncate', it.label));
      const r = h('span', 'shrink-0 tabular-nums text-slate-500');
      r.append(h('span', 'font-medium text-slate-900', nf.format(it.clicks)), ` · ${fmtPct(pct(it.clicks, total))}`);
      li.append(l, r); list.append(li);
    });
    const kids = [bar, list];
    const note = coverageNote(items, total, 'Device type'); if (note) kids.push(note);
    el.devices.replaceChildren(...kids);
  }

  const findClicks = (items, name) => {
    const hit = items.find((x) => x.label.trim().toLowerCase() === name);
    return hit ? hit.clicks : 0;
  };

  function renderKpis(d) {
    K.clicks.value.textContent = nf.format(d.total);
    K.clicks.sub.textContent = 'In the selected period';

    const countries = d.locations.filter((x) => !isUnknownLabel(x.label)).length;
    if (d.locations.length === 0) {
      K.countries.value.textContent = '—'; K.countries.sub.textContent = 'No location data';
    } else {
      K.countries.value.textContent = nf.format(countries);
      K.countries.sub.textContent = 'With at least one click';
    }

    [['mobile', 'mobile'], ['desktop', 'desktop']].forEach(([key, label]) => {
      const n = findClicks(d.devices, label);
      K[key].value.textContent = nf.format(n);
      K[key].sub.textContent = `${fmtPct(pct(n, d.total))} of all clicks`;
    });
  }

  // Only statements that follow directly from the returned numbers.
  function buildInsights(d) {
    const out = [];
    const top = (items, labelOf) => {
      const hit = items.find((x) => !isUnknownLabel(x.label));
      return hit ? { ...hit, text: labelOf ? labelOf(hit.label).name : hit.label } : null;
    };
    const c = top(d.locations, countryDisplay);
    if (c) out.push(`${c.text} is the top country, with ${nf.format(c.clicks)} ${clickWord(c.clicks)} (${fmtPct(pct(c.clicks, d.total))} of all clicks).`);
    const dev = top(d.devices);
    if (dev) out.push(`${dev.text} is the most common device type at ${fmtPct(pct(dev.clicks, d.total))} of all clicks.`);
    const br = top(d.browsers);
    if (br) out.push(`${br.text} is the most used browser at ${fmtPct(pct(br.clicks, d.total))} of all clicks.`);
    [['country', d.locations], ['device', d.devices], ['browser', d.browsers]].forEach(([what, items]) => {
      const missing = d.total - sum(items);
      if (missing > 0) out.push(`${nf.format(missing)} ${clickWord(missing)} (${fmtPct(pct(missing, d.total))}) have no ${what} information recorded.`);
    });
    return out;
  }

  function renderInsights(d) {
    const items = buildInsights(d);
    if (!items.length) return el.insights.replaceChildren(h('li', 'text-sm text-slate-400', 'Not enough data for observations yet.'));
    el.insights.replaceChildren(...items.map((t) => h('li', 'border-l-2 border-indigo-200 pl-3 text-sm leading-6 text-slate-600', t)));
  }

  /* ----- Load ----- */
  async function load() {
    const id = ++state.reqId; // a late response from an old selection is ignored
    show('skeleton'); announce('Loading audience data');
    try {
      const d = await fetchAudience();
      if (id !== state.reqId) return;
      state.lastLoad = Date.now();

      if (d.total === 0) {
        const filtered = !!state.linkId;
        el.emptyTitle.textContent = filtered ? 'No clicks for this link in this period' : 'No audience data yet';
        el.emptyText.textContent = filtered
          ? 'Try a longer date range or choose a different link.'
          : "Once your links receive clicks in this period, you'll see where they come from and what devices and browsers people use.";
        show('empty'); announce('No audience data for this selection'); return;
      }
      renderKpis(d);
      renderBars(el.countries, d.locations, d.total, { limit: 10, labelOf: countryDisplay, noDataMsg: 'No location data for this period.', what: 'Location' });
      renderDevices(d.devices, d.total);
      renderBars(el.browsers, d.browsers, d.total, { limit: 8, noDataMsg: 'No browser data for this period.', what: 'Browser' });
      renderInsights(d);
      show('content'); announce('Audience data updated');
    } catch (err) {
      if (id !== state.reqId) return;
      console.error('Audience failed to load:', err);
      el.errorMsg.textContent = typeof request !== 'function'
        ? "The Audience tab isn't connected to your API helper yet."
        : 'Check your connection and try again.';
      show('error'); announce("We couldn't load your audience data.");
    }
  }

  /* ----- Link filter (options come from YOUR existing links list) ----- */
  if (typeof getLinks === 'function') {
    Promise.resolve(getLinks()).then((links) => {
      if (!Array.isArray(links) || !links.length) return;
      links.forEach((l) => { const o = h('option', null, l.label); o.value = String(l.id); el.link.append(o); });
      el.linkWrap.classList.remove('hidden');
    }).catch((err) => console.error('Audience: could not load links for the filter', err));
  }

  /* ----- Events ----- */
  el.range.addEventListener('change', () => { if (RANGES.includes(el.range.value)) { state.range = el.range.value; load(); } });
  el.link.addEventListener('change', () => { state.linkId = el.link.value; load(); });
  el.retry.addEventListener('click', load);

  /* ----- First load when the tab becomes visible; refresh if reopened after a minute ----- */
  const isVisible = () => !section.classList.contains('hidden');
  let started = false;
  const onShown = () => {
    if (!started) { started = true; load(); }
    else if (Date.now() - state.lastLoad > 60000) load();
  };
  if (isVisible()) onShown();
  let wasVisible = isVisible();
  new MutationObserver(() => {
    const now = isVisible();
    if (now && !wasVisible) onShown();
    wasVisible = now;
  }).observe(section, { attributes: true, attributeFilter: ['class'] });
}

if (typeof window !== 'undefined') window.initAudienceTab = initAudienceTab;