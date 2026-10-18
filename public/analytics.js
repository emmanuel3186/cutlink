(function () {
  'use strict';
  const USE_MOCK = false;             // <- set to false once your endpoint exists
  const API_URL = '/api/analytics';  // <- ASSUMED path; change to your real route
  const UPGRADE_URL = null;          // <- where "Upgrade plan" goes (null = fires 'cutlink:upgrade')
  const LINKS_NAV_SELECTOR = '[data-nav="links"]';   // <- e.g. '[data-view="links"]' so "View All Links" clicks your sidebar item
  const STALE_AFTER_MS = 60000;      // refetch when the tab is reopened after this long
  class PlanLimitError extends Error {
    constructor(message) { super(message || "This view isn't included in your plan."); this.code = 'PLAN_LIMIT'; }
  }

  const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90, all: null };
  const byClicks = (a, b) => b.clicks - a.clicks;
  const pointList = (a) => (a || []).map((p) => ({ date: String(p.date).slice(0, 10), clicks: Number(p.clicks) || 0 }));
  const labelList = (a) => (a || []).map((x) => ({ label: String(x.label ?? x.name ?? 'Unknown'), clicks: Number(x.clicks) || 0 })).sort(byClicks);

  function normalize(raw) {
    const prev = raw.previousSeries || raw.previous || null;
    return {
      totalClicks: Number(raw.totalClicks) || 0,
      series: pointList(raw.series || raw.timeseries),
      previousSeries: prev ? pointList(prev) : null,
      sources: labelList(raw.sources),
      devices: labelList(raw.devices),
      browsers: labelList(raw.browsers),
      locations: labelList(raw.locations || raw.countries),
      topLinks: (raw.topLinks || []).map((l) => ({
        id: String(l._id || l.id || l.shortUrl),
        shortUrl: l.shortUrl || '',
        originalUrl: l.originalUrl || l.longUrl || '',
        clicks: Number(l.clicks) || 0,
      })).sort(byClicks),
    };
  }

  async function fetchFromApi({ range, linkId }) {
    const token = localStorage.getItem('authToken')
    const params = new URLSearchParams({ range });
    if (linkId) params.set('linkId', linkId);
    const res = await fetch(`${API_URL}?${params}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (res.status === 403) {
      let body = {};
      try { body = await res.json(); } catch (_) { /* not JSON */ }
      if (body.code === 'PLAN_LIMIT') throw new PlanLimitError(body.message);
    }
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return normalize(await res.json());
  }
  window.CutlinkAnalytics = {
    fetchFromApi
  };

  const stripProto = (u) => (u || '').replace(/^https?:\/\//i, '');

  const AnalyticsService = {
    getAnalytics: (query) => (USE_MOCK ? mockAnalytics(query) : fetchFromApi(query)),
    // Link choices for the filter dropdown. Reuses window.LinksService if your My Links page defines it.
    async getLinkOptions() {
      if (window.LinksService) {
        try { return (await window.LinksService.getLinks()).map((l) => ({ id: l.id, label: stripProto(l.shortUrl) })); }
        catch (_) { /* fall through */ }
      }
      return USE_MOCK ? MOCK_LINKS.map((l) => ({ id: l.id, label: stripProto(l.shortUrl) })) : [];
    },
  };

  /* =====================================================================
   * Shared helpers
   * ===================================================================== */
  function h(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text; // textContent keeps user data inert (no HTML injection)
    return n;
  }
  const nf = new Intl.NumberFormat();
  const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const shortDay = (s) => parseDay(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const longDay = (s) => parseDay(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const sum = (arr) => arr.reduce((n, x) => n + x.clicks, 0);
  const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);
  const fmtPct = (v) => (v > 0 && v < 1 ? '<1%' : `${Math.round(v)}%`);

  /* =====================================================================
   * 3. LINE CHART (small canvas renderer, no library)
   * ===================================================================== */
  function createLineChart(canvas) {
    const ctx = canvas.getContext('2d');
    const host = canvas.parentElement;
    const tip = h('div', 'pointer-events-none absolute z-10 hidden min-w-[9rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg');
    host.appendChild(tip);
    canvas.style.touchAction = 'pan-y';
    canvas.style.display = 'block';

    const M = { t: 12, r: 12, b: 26, l: 42 };
    let cfg = null, W = 0, H = 0, hover = -1;
    const plotW = () => Math.max(1, W - M.l - M.r);
    const plotH = () => Math.max(1, H - M.t - M.b);
    const xAt = (i) => M.l + (cfg.n <= 1 ? plotW() / 2 : (i / (cfg.n - 1)) * plotW());
    const yAt = (v) => M.t + plotH() - (v / cfg.max) * plotH();

    function trace(values) {
      ctx.beginPath();
      values.forEach((v, i) => (i === 0 ? ctx.moveTo(xAt(i), yAt(v)) : ctx.lineTo(xAt(i), yAt(v))));
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      if (!cfg || !W || !H) return;
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif';

      // Grid + y labels
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let i = 0; i <= 4; i++) {
        const v = (cfg.max / 4) * i, y = Math.round(yAt(v)) + 0.5;
        ctx.strokeStyle = i === 0 ? '#e2e8f0' : '#f1f5f9'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(M.l, y); ctx.lineTo(W - M.r, y); ctx.stroke();
        ctx.fillStyle = '#94a3b8'; ctx.fillText(compact.format(v), M.l - 8, y);
      }
      // x labels
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#94a3b8';
      const count = Math.min(cfg.n, W < 480 ? 4 : 6);
      for (let k = 0; k < count; k++) {
        const i = count === 1 ? 0 : Math.round((k * (cfg.n - 1)) / (count - 1));
        ctx.fillText(cfg.labels[i], xAt(i), H - M.b + 8);
      }

      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (cfg.prev) { // previous period: dashed, quiet
        ctx.setLineDash([4, 4]); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.5;
        trace(cfg.prev); ctx.stroke(); ctx.setLineDash([]);
      }
      // main series: flat faint fill + line
      trace(cfg.main);
      ctx.lineTo(xAt(cfg.n - 1), yAt(0)); ctx.lineTo(xAt(0), yAt(0)); ctx.closePath();
      ctx.fillStyle = 'rgba(79,70,229,0.06)'; ctx.fill();
      ctx.strokeStyle = '#4f46e5'; ctx.lineWidth = 2; trace(cfg.main); ctx.stroke();

      if (hover >= 0) {
        const x = Math.round(xAt(hover)) + 0.5;
        ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, M.t); ctx.lineTo(x, H - M.b); ctx.stroke();
        ctx.beginPath(); ctx.arc(xAt(hover), yAt(cfg.main[hover]), 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#4f46e5'; ctx.lineWidth = 2; ctx.stroke();
      }
    }

    function tipRow(label, value, color) {
      const r = h('div', 'mt-1 flex items-center justify-between gap-4 text-slate-600');
      const l = h('span', 'inline-flex items-center gap-1.5');
      const dot = h('span', 'h-2 w-2 rounded-full'); dot.style.background = color;
      l.append(dot, label);
      r.append(l, h('span', 'font-semibold tabular-nums text-slate-900', nf.format(value)));
      return r;
    }
    function showTip(i) {
      tip.replaceChildren(h('p', 'font-medium text-slate-900', cfg.tipLabels[i]), tipRow('Clicks', cfg.main[i], '#4f46e5'));
      if (cfg.prev) tip.append(tipRow('Previous', cfg.prev[i] ?? 0, '#cbd5e1'));
      tip.classList.remove('hidden');
      const x = xAt(i), w = tip.offsetWidth;
      tip.style.top = '8px';
      tip.style.left = `${x > W / 2 ? Math.max(4, x - w - 12) : Math.min(W - w - 4, x + 12)}px`;
    }

    function resize() {
      const r = host.getBoundingClientRect();
      W = r.width; H = r.height;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    canvas.addEventListener('pointermove', (e) => {
      if (!cfg) return;
      const x = e.clientX - canvas.getBoundingClientRect().left;
      let i = cfg.n <= 1 ? 0 : Math.round(((x - M.l) / plotW()) * (cfg.n - 1));
      i = Math.max(0, Math.min(cfg.n - 1, i));
      if (i !== hover) { hover = i; draw(); showTip(i); }
    });
    canvas.addEventListener('pointerleave', () => { hover = -1; tip.classList.add('hidden'); draw(); });
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(host);
    else window.addEventListener('resize', resize);

    return {
      update(next) { cfg = next; hover = -1; tip.classList.add('hidden'); resize(); },
    };
  }

  function niceMax(v) { // 4 even intervals with a round step (1, 2, 5, 10 x 10^n)
    const raw = Math.max(v, 1) / 4;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    const step = Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p);
    return step * 4;
  }

  /* =====================================================================
   * 4. PAGE UI
   * ===================================================================== */
  function initAnalyticsPage() {
    const section = document.getElementById('analytics');
    if (!section) { console.warn('Analytics: #analytics not found on this page.'); return; }

    const $ = (id) => document.getElementById(id);
    const el = {
      range: $('an-range'), link: $('an-link'), exportBtn: $('an-export'), banner: $('an-demo-banner'),
      status: $('an-status'), toast: $('an-toast'),
      panels: { skeleton: $('an-skeleton'), error: $('an-error'), locked: $('an-locked'), empty: $('an-empty'), content: $('an-content') },
      emptyTitle: $('an-empty-title'), emptyText: $('an-empty-text'),
      summary: $('an-summary'), compare: $('an-compare'), compareLabel: $('an-compare-label'), legendPrev: $('an-legend-prev'),
      canvas: $('an-line-chart'), lineMsg: $('an-line-msg'),
      sources: $('an-sources-body'), devices: $('an-devices-body'), browsers: $('an-browsers-body'),
      locations: $('an-locations-body'), topLinks: $('an-toplinks-body'),
    };

    const state = { range: el.range.value, linkId: '', data: null, compare: false, reqId: 0, lastLoad: 0, status: 'skeleton' };
    const chart = createLineChart(el.canvas);

    const announce = (m) => { el.status.textContent = m; };
    let toastTimer;
    function toast(message) {
      el.toast.textContent = message; el.toast.classList.remove('hidden');
      clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 3500);
    }

    function show(name) {
      Object.entries(el.panels).forEach(([k, n]) => n.classList.toggle('hidden', k !== name));
      state.status = name;
      el.exportBtn.disabled = name !== 'content';
    }

    /* ----- Summary strip ----- */
    function statCell(label, value, sub, tone) {
      const c = h('div', 'min-w-0 bg-white px-5 py-4');
      c.append(h('p', 'text-xs font-medium text-slate-500', label),
        h('p', 'mt-1 truncate text-2xl font-semibold tabular-nums tracking-tight text-slate-900', value));
      if (sub) c.append(h('p', `mt-0.5 truncate text-xs ${tone || 'text-slate-500'}`, sub));
      return c;
    }

    function renderSummary(d) {
      const total = sum(d.series);
      const days = d.series.length || 1;
      let deltaText = null, deltaTone = 'text-slate-500';
      if (d.previousSeries) {
        const prev = sum(d.previousSeries);
        if (prev > 0) {
          const change = ((total - prev) / prev) * 100;
          deltaText = `${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs previous period`;
          deltaTone = change >= 0 ? 'text-emerald-600' : 'text-red-600';
        }
      }
      const topSource = d.sources[0], topLoc = d.locations[0];
      el.summary.replaceChildren(
        statCell('Total clicks', nf.format(total), deltaText || `Across ${days} days`, deltaTone),
        statCell('Average per day', nf.format(Math.round((total / days) * 10) / 10), `Over ${days} days`),
        statCell('Top source', topSource ? topSource.label : '—', topSource ? `${fmtPct(pct(topSource.clicks, total))} of clicks` : ''),
        statCell('Top location', topLoc ? topLoc.label : '—', topLoc ? `${fmtPct(pct(topLoc.clicks, total))} of clicks` : ''),
      );
    }

    /* ----- Chart + compare ----- */
    function chartConfig(d) {
      const n = d.series.length;
      const main = d.series.map((p) => p.clicks);
      const prev = state.compare && d.previousSeries ? d.series.map((_, i) => (d.previousSeries[i] ? d.previousSeries[i].clicks : 0)) : null;
      return {
        n, main, prev,
        labels: d.series.map((p) => shortDay(p.date)),
        tipLabels: d.series.map((p) => longDay(p.date)),
        max: niceMax(Math.max(...main, ...(prev || [0]))),
      };
    }

    function renderChart(d) {
      const hasPrev = !!d.previousSeries;
      el.compare.disabled = !hasPrev;
      if (!hasPrev) { el.compare.checked = false; state.compare = false; }
      el.compareLabel.textContent = hasPrev ? 'Compare to previous period' : 'Comparison unavailable for All time';
      el.legendPrev.classList.toggle('hidden', !state.compare);
      el.legendPrev.classList.toggle('inline-flex', state.compare);

      if (d.series.length < 2) {
        el.canvas.parentElement.classList.add('hidden');
        el.lineMsg.textContent = 'Not enough data to draw a trend yet.';
        el.lineMsg.classList.remove('hidden');
        return;
      }
      el.canvas.parentElement.classList.remove('hidden');
      el.lineMsg.classList.add('hidden');
      const peak = d.series.reduce((a, b) => (b.clicks > a.clicks ? b : a));
      el.canvas.setAttribute('aria-label',
        `Line chart of daily clicks: ${nf.format(sum(d.series))} total, peaking at ${nf.format(peak.clicks)} on ${longDay(peak.date)}.`);
      chart.update(chartConfig(d));
    }

    /* ----- Breakdown lists ----- */
    const BAR_TONES = ['bg-indigo-600', 'bg-indigo-500', 'bg-indigo-400', 'bg-indigo-300', 'bg-indigo-200', 'bg-indigo-100'];
    const noData = () => h('p', 'py-6 text-sm text-slate-400', 'No data for this period.');

    function renderBars(target, items, limit = 6) {
      const total = sum(items);
      if (!total) return target.replaceChildren(noData());
      const rows = items.slice(0, limit).map((it, i) => {
        const p = pct(it.clicks, total);
        const row = h('div', 'space-y-1.5');
        const top = h('div', 'flex items-baseline justify-between gap-3 text-sm');
        const name = h('span', 'min-w-0 truncate text-slate-700', it.label); name.title = it.label;
        const nums = h('span', 'shrink-0 tabular-nums text-slate-500');
        nums.append(h('span', 'font-medium text-slate-900', nf.format(it.clicks)), ` · ${fmtPct(p)}`);
        top.append(name, nums);
        const track = h('div', 'h-1.5 overflow-hidden rounded-full bg-slate-100');
        const fill = h('div', `h-full rounded-full ${BAR_TONES[Math.min(i, BAR_TONES.length - 1)]}`);
        fill.style.width = `${Math.max(p, 1.5)}%`;
        track.append(fill); row.append(top, track);
        return row;
      });
      const list = h('div', 'space-y-3.5'); list.append(...rows);
      target.replaceChildren(list);
    }

    const SEG_TONES = ['bg-indigo-600', 'bg-indigo-400', 'bg-indigo-200', 'bg-slate-300'];
    function renderStacked(target, items) {
      const total = sum(items);
      if (!total) return target.replaceChildren(noData());
      const shown = items.slice(0, SEG_TONES.length);
      const bar = h('div', 'flex h-2 gap-0.5 overflow-hidden rounded-full');
      shown.forEach((it, i) => {
        const seg = h('div', SEG_TONES[i]); seg.style.width = `${pct(it.clicks, total)}%`; seg.title = `${it.label}: ${fmtPct(pct(it.clicks, total))}`;
        bar.append(seg);
      });
      const list = h('ul', 'mt-4 space-y-2.5');
      shown.forEach((it, i) => {
        const li = h('li', 'flex items-center justify-between gap-3 text-sm');
        const l = h('span', 'inline-flex min-w-0 items-center gap-2 text-slate-700');
        l.append(h('span', `h-2.5 w-2.5 shrink-0 rounded-sm ${SEG_TONES[i]}`), h('span', 'truncate', it.label));
        const r = h('span', 'shrink-0 tabular-nums text-slate-500');
        r.append(h('span', 'font-medium text-slate-900', nf.format(it.clicks)), ` · ${fmtPct(pct(it.clicks, total))}`);
        li.append(l, r); list.append(li);
      });
      target.replaceChildren(bar, list);
    }

    /* ----- Top links ----- */
    function displayShort(u) {
      if (/^https?:\/\//i.test(u)) return stripProto(u);
      return u.includes('/') ? u : `${window.location.host}/${u}`;
    }
    function renderTopLinks(d) {
      if (!d.topLinks.length) return el.topLinks.replaceChildren(h('p', 'px-5 py-8 text-sm text-slate-400', 'No link data for this period.'));
      const total = sum(d.series) || 1;
      const ul = h('ul', 'divide-y divide-slate-100');
      d.topLinks.slice(0, 8).forEach((l, i) => {
        const li = h('li', 'flex items-center gap-4 px-5 py-3.5 transition-colors duration-150 hover:bg-slate-50/70');
        li.append(h('span', 'w-5 shrink-0 text-xs font-medium tabular-nums text-slate-400', String(i + 1)));
        const info = h('div', 'min-w-0 flex-1');
        const s = h('p', 'truncate text-sm font-medium text-indigo-600', displayShort(l.shortUrl)); s.title = l.shortUrl;
        const o = h('p', 'truncate text-xs text-slate-500', l.originalUrl || '—'); o.title = l.originalUrl;
        info.append(s, o);
        const share = h('div', 'hidden w-28 shrink-0 sm:block');
        const track = h('div', 'h-1.5 overflow-hidden rounded-full bg-slate-100');
        const fill = h('div', 'h-full rounded-full bg-indigo-500'); fill.style.width = `${Math.min(100, pct(l.clicks, total))}%`;
        track.append(fill); share.append(track);
        const num = h('div', 'w-20 shrink-0 text-right');
        num.append(h('p', 'text-sm font-semibold tabular-nums text-slate-900', nf.format(l.clicks)),
          h('p', 'text-xs tabular-nums text-slate-500', fmtPct(pct(l.clicks, total))));
        li.append(info, share, num); ul.append(li);
      });
      el.topLinks.replaceChildren(ul);
    }

    /* ----- Locked (plan limit) state ----- */
    function renderLocked(err) {
      const icon = h('div', 'mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600');
      icon.innerHTML = '<svg class="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="9" width="12" height="8" rx="2"/><path d="M7 9V6a3 3 0 016 0v3"/></svg>';
      const actions = h('div', 'mt-5 flex flex-col justify-center gap-2 sm:flex-row');
      if (state.range !== '7d') {
        const shorter = h('button', 'h-9 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50', 'Show last 7 days');
        shorter.type = 'button';
        shorter.addEventListener('click', () => { el.range.value = '7d'; state.range = '7d'; load(); });
        actions.append(shorter);
      }
      const upgrade = h('button', 'h-9 rounded-lg bg-indigo-600 px-3.5 text-sm font-medium text-white shadow-sm transition-colors duration-150 hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2', 'Upgrade plan');
      upgrade.type = 'button';
      upgrade.addEventListener('click', () => { if (UPGRADE_URL) window.location.href = UPGRADE_URL; else document.dispatchEvent(new CustomEvent('cutlink:upgrade')); });
      actions.append(upgrade);
      el.panels.locked.replaceChildren(icon,
        h('p', 'mt-3 text-sm font-semibold text-slate-900', "This view isn't included in your plan"),
        h('p', 'mx-auto mt-1 max-w-md text-sm text-slate-500', err.message), actions);
    }

    /* ----- Load ----- */
    async function load() {
      const id = ++state.reqId; // ignore stale responses when filters change quickly
      show('skeleton'); announce('Loading analytics');
      try {
        const data = await AnalyticsService.getAnalytics({ range: state.range, linkId: state.linkId });
        if (id !== state.reqId) return;
        state.data = data; state.lastLoad = Date.now();

        if (sum(data.series) === 0) {
          const filtered = !!state.linkId;
          el.emptyTitle.textContent = filtered ? 'No clicks for this link in this period' : 'No analytics data yet';
          el.emptyText.textContent = filtered
            ? 'Try a longer date range or choose a different link.'
            : "Once people start clicking your shortened links, you'll see performance statistics here.";
          show('empty'); announce('No analytics data for this selection'); return;
        }
        show('content'); // show first so the chart can measure its container
        renderSummary(data); renderChart(data);
        renderBars(el.sources, data.sources);
        renderStacked(el.devices, data.devices);
        renderBars(el.browsers, data.browsers);
        renderBars(el.locations, data.locations);
        renderTopLinks(data);
        announce('Analytics updated');
      } catch (err) {
        if (id !== state.reqId) return;
        if (err && err.code === 'PLAN_LIMIT') { renderLocked(err); show('locked'); announce(err.message); return; }
        console.error('Analytics failed to load:', err);
        show('error'); announce("We couldn't load your analytics.");
      }
    }

    /* ----- CSV export (built in the browser from what's on screen) ----- */
    function csvCell(v) {
      let s = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // blocks spreadsheet formula injection from user-controlled labels
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }
    function exportCsv() {
      const d = state.data;
      if (!d) return;
      try {
        const rows = [['Section', 'Label', 'Clicks', 'Previous period clicks']];
        d.series.forEach((p, i) => rows.push(['Daily clicks', p.date, p.clicks, d.previousSeries && d.previousSeries[i] ? d.previousSeries[i].clicks : '']));
        [['Source', d.sources], ['Device', d.devices], ['Browser', d.browsers], ['Location', d.locations]]
          .forEach(([name, items]) => items.forEach((x) => rows.push([name, x.label, x.clicks, ''])));
        d.topLinks.forEach((l) => rows.push(['Top link', displayShort(l.shortUrl), l.clicks, '']));
        const csv = '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const a = h('a'); a.href = url;a.download = `cutlink-analytics-${state.range}-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('CSV downloaded');
      } catch (err) {
        console.error(err); toast('Could not export the CSV.');
      }
    }

    /* ----- Events ----- */
    el.range.addEventListener('change', () => { state.range = el.range.value; load(); });
    el.link.addEventListener('change', () => { state.linkId = el.link.value; load(); });
    el.compare.addEventListener('change', () => {
      state.compare = el.compare.checked;
      el.legendPrev.classList.toggle('hidden', !state.compare);
      el.legendPrev.classList.toggle('inline-flex', state.compare);
      if (state.data && state.status === 'content') chart.update(chartConfig(state.data));
    });
    el.exportBtn.addEventListener('click', exportCsv);
    section.querySelectorAll('[data-an-retry]').forEach((b) => b.addEventListener('click', load));
    section.querySelectorAll('[data-an-viewall]').forEach((b) => b.addEventListener('click', () => {
      const nav = LINKS_NAV_SELECTOR && document.querySelector(LINKS_NAV_SELECTOR);
      if (nav) nav.click(); else document.dispatchEvent(new CustomEvent('cutlink:navigate', { detail: { view: 'links' } }));
    }));

    /* ----- Init: first fetch happens when the view becomes visible ----- */
    if (USE_MOCK) { el.banner.classList.remove('hidden'); el.banner.classList.add('flex'); }

    AnalyticsService.getLinkOptions().then((opts) => {
      if (!opts.length) { el.link.parentElement.classList.add('hidden'); return; }
      opts.forEach((o) => { const opt = h('option', null, o.label); opt.value = o.id; el.link.append(opt); });
    }).catch(() => el.link.parentElement.classList.add('hidden'));

    let started = false;
    const isVisible = () => !section.classList.contains('hidden');
    function onShown() {
      if (!started) { started = true; load(); }
      else if (Date.now() - state.lastLoad > STALE_AFTER_MS) load();
    }
    if (isVisible()) onShown();
    let wasVisible = isVisible();
    new MutationObserver(() => {
      const now = isVisible();
      if (now && !wasVisible) onShown();
      wasVisible = now;
    }).observe(section, { attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAnalyticsPage);
  else initAnalyticsPage();
})();