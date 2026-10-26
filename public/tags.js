const MAX_NAME = 30;
const STALE_MS = 60000;

const PALETTE = [
  { key: 'indigo', label: 'Indigo', swatch: 'bg-indigo-500', soft: 'bg-indigo-50 text-indigo-600' },
  { key: 'sky', label: 'Sky', swatch: 'bg-sky-500', soft: 'bg-sky-50 text-sky-600' },
  { key: 'emerald', label: 'Emerald', swatch: 'bg-emerald-500', soft: 'bg-emerald-50 text-emerald-600' },
  { key: 'amber', label: 'Amber', swatch: 'bg-amber-500', soft: 'bg-amber-50 text-amber-600' },
  { key: 'orange', label: 'Orange', swatch: 'bg-orange-500', soft: 'bg-orange-50 text-orange-600' },
  { key: 'rose', label: 'Rose', swatch: 'bg-rose-500', soft: 'bg-rose-50 text-rose-600' },
  { key: 'violet', label: 'Violet', swatch: 'bg-violet-500', soft: 'bg-violet-50 text-violet-600' },
  { key: 'slate', label: 'Slate', swatch: 'bg-slate-500', soft: 'bg-slate-100 text-slate-600' },
];
const colorOf = (key) => PALETTE.find((c) => c.key === key) || PALETTE[PALETTE.length - 1];

/* =====================================================================
 * Pure helpers (no DOM)
 * ===================================================================== */
const normalizeName = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
const nameKey = (s) => normalizeName(s).toLocaleLowerCase();

function normalizeTag(raw) {
  return {
    id: String(raw.id ?? raw._id ?? ''),
    name: normalizeName(raw.name),
    color: PALETTE.some((c) => c.key === raw.color) ? raw.color : 'slate',
    linkCount: Number(raw.linkCount) || 0,
  };
}

function findDuplicate(tags, name, excludeId) {
  const key = nameKey(name);
  return tags.find((t) => t.id !== excludeId && nameKey(t.name) === key) || null;
}

// Returns { name?, color? } with a message per invalid field. Empty object = valid.
function validateTag(input, tags, editingId) {
  const errors = {};
  const name = normalizeName(input.name);
  if (!name) errors.name = 'Enter a tag name.';
  else if (name.length > MAX_NAME) errors.name = `Use ${MAX_NAME} characters or fewer.`;
  else if (findDuplicate(tags, name, editingId)) errors.name = `You already have a tag called "${findDuplicate(tags, name, editingId).name}". Names are not case-sensitive.`;
  if (!PALETTE.some((c) => c.key === input.color)) errors.color = 'Choose a color.';
  return errors;
}

/* Optional development adapter: keeps tags in memory only. Nothing is saved anywhere and
 * everything is lost on refresh; the page shows a notice while it is used.
 *   initTagsTab({ api: createSessionOnlyTagsApi() })   // remove once your real api exists */
export function createSessionOnlyTagsApi() {
  let tags = []; let n = 0;
  const dup = (name, exceptId) => tags.some((t) => t.id !== exceptId && nameKey(t.name) === nameKey(name));
  const fail = () => Object.assign(new Error('You already have a tag with that name.'), { code: 'DUPLICATE_TAG' });
  return {
    sessionOnly: true,
    async listTags() { return tags.map((t) => ({ ...t })); },
    async createTag({ name, color }) { if (dup(name)) throw fail(); tags.push({ id: `session-${++n}`, name: normalizeName(name), color, linkCount: 0 }); },
    async updateTag(id, { name, color }) { if (dup(name, id)) throw fail(); tags = tags.map((t) => (t.id === id ? { ...t, name: normalizeName(name), color } : t)); },
    async deleteTag(id) { tags = tags.filter((t) => t.id !== id); },
  };
}

/* =====================================================================
 * DOM helpers
 * ===================================================================== */
function h(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text; // textContent: tag names can never inject HTML
  return node;
}
const svg = (inner, cls = 'h-4 w-4') =>
  `<svg class="${cls}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICON = {
  tag: svg('<path d="M3 10.2V4.5A1.5 1.5 0 014.5 3h5.7a1.5 1.5 0 011.06.44l6.3 6.3a1.5 1.5 0 010 2.12l-5.7 5.7a1.5 1.5 0 01-2.12 0l-6.3-6.3A1.5 1.5 0 013 10.2z"/><circle cx="7" cy="7" r="1" fill="currentColor"/>', 'h-4.5 w-4.5'),
  edit: svg('<path d="M12.5 4.5l3 3M4 16l.7-3.1L13.6 4a1.4 1.4 0 012 0l.4.4a1.4 1.4 0 010 2L7.1 15.3 4 16z"/>'),
  trash: svg('<path d="M4 6h12M8 6V4.5A1.5 1.5 0 019.5 3h1A1.5 1.5 0 0112 4.5V6m2 0v9.5a1.5 1.5 0 01-1.5 1.5h-5A1.5 1.5 0 016 15.5V6"/>'),
  link: svg('<path d="M8.5 11.5a3.5 3.5 0 005 0l2.5-2.5a3.5 3.5 0 00-5-5l-1 1"/><path d="M11.5 8.5a3.5 3.5 0 00-5 0L4 11a3.5 3.5 0 005 5l1-1"/>'),
  check: svg('<path d="M4.5 10.5l3.5 3.5 7.5-8"/>', 'h-4 w-4'),
};
const nf = new Intl.NumberFormat();

/* =====================================================================
 * Init
 * ===================================================================== */
export function initTagsTab(options = {}) {
  const api = options.api || {};
  const sectionId = options.sectionId || 'tags-label';
  const section = document.getElementById(sectionId);
  if (!section) { console.warn(`Tags: #${sectionId} not found on this page.`); return null; }

  // Safe to call from your navigation every time: later calls just refresh if the data is old.
  if (section.dataset.tgReady) return section._tagsController;
  section.dataset.tgReady = '1';

  const $ = (id) => document.getElementById(id);
  const el = {
    create: $('tg-create'), emptyCreate: $('tg-empty-create'), notice: $('tg-notice'), noticeText: $('tg-notice-text'),
    status: $('tg-status'), toast: $('tg-toast'),
    summary: $('tg-summary'), statTags: $('tg-stat-tags'), statTagsLabel: $('tg-stat-tags-label'), statLinked: $('tg-stat-linked'),
    loading: $('tg-loading'), error: $('tg-error'), retry: $('tg-retry'), empty: $('tg-empty'), grid: $('tg-grid'),
    formDialog: $('tg-form-dialog'), form: $('tg-form'), formTitle: $('tg-form-title'), name: $('tg-name'), nameError: $('tg-name-error'),
    colors: $('tg-colors'), colorError: $('tg-color-error'), formError: $('tg-form-error'),
    submit: $('tg-submit'), spinner: $('tg-spinner'), submitLabel: $('tg-submit-label'),
    delDialog: $('tg-delete-dialog'), delName: $('tg-delete-name'), delDetail: $('tg-delete-detail'), delError: $('tg-delete-error'),
    delCancel: $('tg-delete-cancel'), delConfirm: $('tg-delete-confirm'),
    asDialog: $('tg-assign-dialog'), asSub: $('tg-assign-sub'), asSearch: $('tg-assign-search'), asMsg: $('tg-assign-msg'),
    asList: $('tg-assign-list'), asCount: $('tg-assign-count'), asSave: $('tg-assign-save'),
  };

  const canAssign = ['listLinks', 'getTagLinks', 'setTagLinks'].every((f) => typeof api[f] === 'function');
  const state = {
    tags: [], taggedLinks: null, status: 'loading', lastLoad: 0,
    editingId: null, color: PALETTE[0].key, submitting: false,
    deleting: null, assign: null,
  };

  const announce = (m) => { el.status.textContent = m; };
  let toastTimer;
  function toast(message, ok = true) {
    el.toast.textContent = message;
    el.toast.className = `pointer-events-none fixed inset-x-4 bottom-4 z-60 mx-auto max-w-sm rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${ok ? 'bg-slate-900' : 'bg-red-600'}`;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 3500);
  }
  const open = (d) => { if (!d.open) d.showModal(); };
  const close = (d) => { if (d.open) d.close(); };
  const setHidden = (n, hidden) => n.classList.toggle('hidden', hidden);
  const plural = (n, one, many) => (n === 1 ? one : many);

  /* ----- Notice about persistence ----- */
  function renderNotice() {
    let msg = '';
    if (typeof api.listTags !== 'function' || typeof api.createTag !== 'function') msg = "Tags aren't connected to your backend yet, so tags can't be loaded or saved.";
    else if (api.sessionOnly) msg = 'Session-only mode: tags are kept in this browser tab and are not saved to your account.';
    el.noticeText.textContent = msg;
    el.notice.classList.toggle('hidden', !msg); el.notice.classList.toggle('flex', !!msg);
  }

  /* ----- Rendering ----- */
  function showPanel(name) {
    [['loading', el.loading], ['error', el.error], ['empty', el.empty], ['ready', el.grid]].forEach(([k, n]) => {
      const on = k === name; setHidden(n, !on);
      if (k === 'loading' || k === 'ready') n.classList.toggle('grid', on);
    });
    state.status = name;
    const showSummary = name === 'ready';
    setHidden(el.summary, !showSummary); el.summary.classList.toggle('flex', showSummary);
  }

  function renderSummary() {
    el.statTags.textContent = nf.format(state.tags.length);
    el.statTagsLabel.textContent = plural(state.tags.length, 'tag', 'tags');
    el.statLinked.textContent = state.taggedLinks == null ? '—' : nf.format(state.taggedLinks); // not guessed if the API doesn't say
  }

  const CARD_BTN = 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500/50';
  function actionButton(action, id, label, iconHtml, extra = '') {
    const b = h('button', `${CARD_BTN} ${extra}`);
    b.type = 'button'; b.dataset.action = action; b.dataset.id = id;
    b.setAttribute('aria-label', label); b.title = label.split(' ')[0] === 'Assign' ? 'Assign links' : label.split(' ')[0];
    b.innerHTML = iconHtml;
    return b;
  }

  function buildCard(tag) {
    const c = colorOf(tag.color);
    const card = h('article', 'flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow duration-150 hover:shadow-md');
    const badge = h('span', `flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${c.soft}`);
    badge.title = `Color: ${c.label}`; badge.innerHTML = ICON.tag;

    const info = h('div', 'min-w-0 flex-1');
    const name = h('p', 'truncate text-sm font-semibold text-slate-900', tag.name); name.title = tag.name;
    const count = h('p', 'mt-0.5 text-xs text-slate-500');
    count.append(h('span', 'tabular-nums font-medium text-slate-700', nf.format(tag.linkCount)), ` ${plural(tag.linkCount, 'link', 'links')}`);
    info.append(name, count);

    const actions = h('div', 'flex shrink-0 items-center gap-0.5');
    if (canAssign) actions.append(actionButton('assign', tag.id, `Assign links to ${tag.name}`, ICON.link));
    actions.append(
      actionButton('edit', tag.id, `Edit ${tag.name}`, ICON.edit),
      actionButton('delete', tag.id, `Delete ${tag.name}`, ICON.trash, 'hover:bg-red-50 hover:text-red-600'),
    );
    card.append(badge, info, actions);
    return card;
  }

  function render() {
    if (state.status !== 'ready') return;
    el.grid.replaceChildren(...state.tags.map(buildCard));
    renderSummary();
  }

  /* ----- Loading ----- */
  async function load() {
    renderNotice();
    if (typeof api.listTags !== 'function') { state.tags = []; state.taggedLinks = null; showPanel('empty'); return; }
    showPanel('loading'); announce('Loading tags');
    try {
      const result = await api.listTags();
      const list = Array.isArray(result) ? result : result && result.tags;
      if (!Array.isArray(list)) throw new Error('listTags must resolve an array (or { tags })');
      state.tags = list.map(normalizeTag).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      state.taggedLinks = !Array.isArray(result) && Number.isFinite(Number(result.taggedLinks)) ? Number(result.taggedLinks) : null;
      state.lastLoad = Date.now();
      showPanel(state.tags.length ? 'ready' : 'empty'); render();
      announce(`${state.tags.length} ${plural(state.tags.length, 'tag', 'tags')} loaded`);
    } catch (err) {
      console.error('Tags failed to load:', err);
      showPanel('error'); announce("We couldn't load your tags");
    }
  }

  /* ----- Create / edit form ----- */
  function buildColorPicker() {
    el.colors.replaceChildren(...PALETTE.map((c) => {
      const label = h('label', 'relative cursor-pointer');
      const input = h('input', 'peer sr-only'); input.type = 'radio'; input.name = 'tg-color'; input.value = c.key;
      input.setAttribute('aria-label', c.label);
      const dot = h('span', `block h-8 w-8 rounded-full ${c.swatch} ring-offset-2 transition-shadow duration-150 peer-checked:ring-2 peer-checked:ring-slate-900 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-600`);
      const mark = h('span', 'pointer-events-none absolute inset-0 flex items-center justify-center text-white opacity-0 peer-checked:opacity-100');
      mark.innerHTML = ICON.check; // static icon markup, no user data
      label.append(input, dot, mark);
      input.addEventListener('change', () => { state.color = c.key; showFieldError('color', ''); });
      return label;
    }));
  }
  const selectColor = (key) => {
    state.color = key;
    el.colors.querySelectorAll('input').forEach((i) => { i.checked = i.value === key; });
  };

  function showFieldError(field, msg) {
    const [node, input] = field === 'name' ? [el.nameError, el.name] : [el.colorError, null];
    node.textContent = msg; setHidden(node, !msg);
    if (input) { input.classList.toggle('border-red-400', !!msg); if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
  }
  function setSubmitting(on) {
    state.submitting = on; el.submit.disabled = on; setHidden(el.spinner, !on);
    el.submitLabel.textContent = on ? 'Saving…' : (state.editingId ? 'Save changes' : 'Create tag');
  }

  function openForm(tag) {
    state.editingId = tag ? tag.id : null;
    el.formTitle.textContent = tag ? 'Edit tag' : 'Create tag';
    el.name.value = tag ? tag.name : '';
    selectColor(tag ? tag.color : PALETTE[0].key);
    showFieldError('name', ''); showFieldError('color', ''); setHidden(el.formError, true);
    setSubmitting(false); open(el.formDialog); 
    if (window.matchMedia('(min-width: 640px)').matches) {
      el.name.focus();
    }
  }

  async function submitForm(e) {
    e.preventDefault();
    if (state.submitting) return;
    setHidden(el.formError, true);
    const input = { name: el.name.value, color: state.color };
    const errors = validateTag(input, state.tags, state.editingId);
    showFieldError('name', errors.name || ''); showFieldError('color', errors.color || '');
    if (errors.name) return el.name.focus();
    if (errors.color) return;

    const fn = state.editingId ? api.updateTag : api.createTag;
    if (typeof fn !== 'function') {
      el.formError.textContent = "Tags aren't connected to your backend yet, so this couldn't be saved.";
      return setHidden(el.formError, false);
    }
    const payload = { name: normalizeName(input.name), color: input.color };
    setSubmitting(true);
    try {
      if (state.editingId) await api.updateTag(state.editingId, payload); else await api.createTag(payload);
      close(el.formDialog);
      toast(state.editingId ? `Saved "${payload.name}"` : `Tag "${payload.name}" created`);
      await load(); // the list always comes from the server, never from the form
    } catch (err) {
      if (err && err.code === 'DUPLICATE_TAG') showFieldError('name', err.message || 'You already have a tag with that name.');
      else { console.error('Saving tag failed:', err); el.formError.textContent = `We couldn't save the tag. ${(err && err.message) || 'Please try again.'}`; setHidden(el.formError, false); }
    } finally { setSubmitting(false); }
  }

  /* ----- Delete ----- */
  function openDelete(tag) {
    state.deleting = tag;
    el.delName.textContent = tag.name;
    el.delDetail.textContent = tag.linkCount > 0
      ? `It will be removed from ${nf.format(tag.linkCount)} ${plural(tag.linkCount, 'link', 'links')}. The links themselves won't be deleted.`
      : "No links use this tag. This can't be undone.";
    setHidden(el.delError, true); el.delConfirm.disabled = false; el.delConfirm.textContent = 'Delete tag';
    open(el.delDialog);
  }

  async function confirmDelete() {
    const tag = state.deleting;
    if (!tag) return;
    setHidden(el.delError, true);
    if (typeof api.deleteTag !== 'function') {
      el.delError.textContent = "Tags aren't connected to your backend yet, so nothing was deleted."; return setHidden(el.delError, false);
    }
    el.delConfirm.disabled = true; el.delConfirm.textContent = 'Deleting…';
    try {
      await api.deleteTag(tag.id); // only after the server confirms do we touch the UI
      close(el.delDialog); toast(`Deleted "${tag.name}"`); await load();
    } catch (err) {
      console.error('Delete tag failed:', err);
      el.delError.textContent = (err && err.message) || "We couldn't delete this tag. Please try again.";
      setHidden(el.delError, false); el.delConfirm.disabled = false; el.delConfirm.textContent = 'Delete tag';
    }
  }

  /* ----- Assign links (works once listLinks / getTagLinks / setTagLinks are provided) ----- */
  function setAssignMessage(msg) { el.asMsg.textContent = msg || ''; setHidden(el.asMsg, !msg); }
  function updateAssignCount() {
    const n = state.assign ? state.assign.selected.size : 0;
    el.asCount.textContent = `${nf.format(n)} ${plural(n, 'link', 'links')} selected`;
  }

  function renderAssignList() {
    const a = state.assign; if (!a) return;
    const q = el.asSearch.value.trim().toLowerCase();
    const visible = a.links.filter((l) => !q || `${l.label} ${l.originalUrl || ''}`.toLowerCase().includes(q));
    setAssignMessage(visible.length ? '' : (a.links.length ? 'No links match your search.' : "You don't have any links yet."));
    el.asList.replaceChildren(...visible.map((l, i) => {
      const li = h('li');
      const label = h('label', 'flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors duration-150 hover:bg-slate-50');
      const box = h('input', 'h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600');
      box.type = 'checkbox'; box.checked = a.selected.has(l.id); box.id = `tg-assign-${i}`;
      box.addEventListener('change', () => { if (box.checked) a.selected.add(l.id); else a.selected.delete(l.id); updateAssignCount(); });
      const text = h('span', 'min-w-0 flex-1');
      text.append(h('span', 'block truncate text-sm font-medium text-slate-900', l.label));
      if (l.originalUrl) text.append(h('span', 'block truncate text-xs text-slate-500', l.originalUrl));
      label.append(box, text); li.append(label); return li;
    }));
  }

  async function openAssign(tag) {
    state.assign = { tag, links: [], selected: new Set() };
    el.asSub.textContent = tag.name; el.asSearch.value = '';
    el.asList.replaceChildren(); setAssignMessage('Loading your links…'); el.asSave.disabled = true; updateAssignCount();
    open(el.asDialog);
    try {
      const [links, ids] = await Promise.all([api.listLinks(), api.getTagLinks(tag.id)]);
      if (!state.assign || state.assign.tag.id !== tag.id) return;
      state.assign.links = (links || []).map((l) => ({ id: String(l.id), label: String(l.label ?? ''), originalUrl: l.originalUrl ? String(l.originalUrl) : '' }));
      state.assign.selected = new Set((ids || []).map(String));
      el.asSave.disabled = false; renderAssignList(); updateAssignCount();
    } catch (err) {
      console.error('Loading links for tag failed:', err); setAssignMessage("We couldn't load your links. Close this and try again.");
    }
  }

  async function saveAssign() {
    const a = state.assign; if (!a) return;
    el.asSave.disabled = true; el.asSave.textContent = 'Saving…';
    try {
      await api.setTagLinks(a.tag.id, [...a.selected]);
      close(el.asDialog); toast(`Updated links for "${a.tag.name}"`); await load();
    } catch (err) {
      console.error('Saving tag links failed:', err); toast(`We couldn't save the links. ${(err && err.message) || ''}`.trim(), false);
    } finally { el.asSave.disabled = false; el.asSave.textContent = 'Save'; }
  }

  /* ----- Events (all scoped to this section) ----- */
  el.create.addEventListener('click', () => openForm(null));
  document.querySelectorAll('#tg-form input, #tg-form select').forEach((el) => {
    el.addEventListener('focus', () => {
      setTimeout(() => {
        el.scrollIntoView({
          block: 'center',
          behavior: 'smooth'
        });
      }, 300);
    });
  });
  el.emptyCreate.addEventListener('click', () => openForm(null));
  el.retry.addEventListener('click', load);
  el.form.addEventListener('submit', submitForm);
  el.name.addEventListener('input', () => { if (!el.nameError.classList.contains('hidden')) showFieldError('name', ''); });
  section.querySelectorAll('[data-tg-close]').forEach((b) => b.addEventListener('click', () => close(el.formDialog)));
  section.querySelectorAll('[data-tg-assign-close]').forEach((b) => b.addEventListener('click', () => close(el.asDialog)));
  el.delCancel.addEventListener('click', () => close(el.delDialog));
  el.delConfirm.addEventListener('click', confirmDelete);
  el.asSearch.addEventListener('input', renderAssignList);
  el.asSave.addEventListener('click', saveAssign);
  [el.formDialog, el.delDialog, el.asDialog].forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) close(d); })); // backdrop click

  el.grid.addEventListener('click', (e) => { // one delegated listener for every card button
    const btn = e.target.closest('[data-action]');
    if (!btn || !el.grid.contains(btn)) return;
    const tag = state.tags.find((t) => t.id === btn.dataset.id);
    if (!tag) return;
    if (btn.dataset.action === 'edit') openForm(tag);
    if (btn.dataset.action === 'delete') openDelete(tag);
    if (btn.dataset.action === 'assign') openAssign(tag);
  });

  /* ----- Start: load when the tab is first shown, refresh if reopened after a minute ----- */
  buildColorPicker(); selectColor(PALETTE[0].key); renderNotice();
  const isVisible = () => !section.classList.contains('hidden');
  let started = false;
  const refresh = () => {
    if (!started) { started = true; load(); }
    else if (Date.now() - state.lastLoad > STALE_MS) load();
  };
  if (isVisible()) refresh();
  let wasVisible = isVisible();
  new MutationObserver(() => {
    const now = isVisible();
    if (now && !wasVisible) refresh();
    wasVisible = now;
  }).observe(section, { attributes: true, attributeFilter: ['class'] });

  const controller = { reload: load, refresh };
  section._tagsController = controller;
  return controller;
}

if (typeof window !== 'undefined') {
  window.initTagsTab = initTagsTab;
  window.createSessionOnlyTagsApi = createSessionOnlyTagsApi;
}