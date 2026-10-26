import {shortUrl} from './main-shorturl.js';
import { initCampaignsTab } from './campaigns.js';
import { initTagsTab } from './tags.js';
import { initDomainsTab } from "./domain.js";
import {handleDashboardShortenSubmit} from './dashboard-shorturl.js'
import { tryRenderGoogleButton, handleGoogleSignIn } from './googleBtn.js';
import { registeredEmail, handleSignIn, showFieldError, resetFieldError } from './signup.js';
import { handleCodeVerification, handleResendCode } from './codeVerify.js';
import { handleLogin } from './login.js';
import { handleForgotPasswordSubmit, handlePasswordResetSubmit } from './password.js';
import {renderMyLinksView, deleteLinkFromServer} from './links-view.js';

document.addEventListener("DOMContentLoaded", function() {
  const currentPath = window.location.pathname;
  const shortenForm = document.getElementById('shortenForm');
  if (shortenForm) {
    shortenForm.addEventListener('submit', shortUrl);
  }
  if(currentPath === '/home'){
    document.getElementById('homeQrView').innerHTML = '';
    new QRCode(document.getElementById('homeQrView'), {
      text: "https://cutlink.link", 
      width: 56, 
      height: 56,
      colorDark: "#0f172a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  }
  if (currentPath === '/dashboard') {
    if (!setupDashboardRoute({ handleDashboardShortenSubmit, fetchUserProfile, renderMyLinksView })) return;
  }
  if (currentPath === '/login') {
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    if (emailInput) {
      emailInput.addEventListener('input', () => { if (emailInput.value.trim() !== "") resetFieldError(emailInput, emailError); });
    }
    if (passwordInput) {
      passwordInput.addEventListener('input', () => { if (passwordInput.value !== "") resetFieldError(passwordInput, passwordError); });
    }
    const togglePasswordBtn = document.getElementById('togglePasswordBtn');
    const eyeIcon = document.getElementById('eyeIcon');
    if (togglePasswordBtn && passwordInput && eyeIcon) {
      togglePasswordBtn.addEventListener('click', function () {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        eyeIcon.innerHTML = type === 'text' 
          ? `<path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />`
          : `<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />`;
      });
    }
    if (loginForm) {
      loginForm.addEventListener('submit', handleLogin);
    }
    tryRenderGoogleButton();
  }
  if (currentPath === '/signup') {
    const registerForm = document.getElementById('registerForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    const togglePasswordBtn = document.getElementById('togglePasswordBtn');
    const eyeIcon = document.getElementById('eyeIcon');
    if (togglePasswordBtn && passwordInput) {
      togglePasswordBtn.addEventListener('click', function () {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        if (type === 'text') {
          eyeIcon.innerHTML = `
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
          `;
        } else {
          eyeIcon.innerHTML = `
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          `;
        }
      });
    }
    if (emailInput) {
      emailInput.addEventListener('input', function() {
        if (emailInput.value.trim() !== "") {
          resetFieldError(emailInput, emailError);
        }
      });
    }
    if (passwordInput) {
      passwordInput.addEventListener('input', function() {
        if (passwordInput.value !== "") {
          resetFieldError(passwordInput, passwordError);
        }
      });
    }
    if (registerForm) {
      registerForm.addEventListener('submit', handleSignIn);
    }
    tryRenderGoogleButton();
  }
  if (currentPath === '/verify') {
    const urlParams = new URLSearchParams(window.location.search);
    const targetEmail = urlParams.get('email');
    if (!targetEmail) {
      window.location.href = '/signup';
      return;
    }
    const confirmVerifyBtn = document.getElementById('confirmVerifyBtn');
    if (confirmVerifyBtn) {
      confirmVerifyBtn.addEventListener('click', () => handleCodeVerification(targetEmail));
    }
    const resendCodeBtn = document.getElementById('resendCodeBtn');
    if (resendCodeBtn) {
      resendCodeBtn.addEventListener('click', () => handleResendCode(targetEmail));
    }
  }
  if (currentPath === '/forgot_password') {
    const forgotForm = document.getElementById('forgotPasswordForm');
    const emailInput = document.getElementById('email');
    const emailError = document.getElementById('emailError');
    if (emailInput) {
      emailInput.addEventListener('input', () => { 
        if (emailInput.value.trim() !== "") resetFieldError(emailInput, emailError); 
      });
    }
    if (forgotForm) {
      forgotForm.addEventListener('submit', handleForgotPasswordSubmit);
    }
  }
  if (currentPath === '/reset_password') {
    const resetForm = document.getElementById('resetPasswordForm');
    const passwordInput = document.getElementById('password');
    const passwordError = document.getElementById('passwordError');
    const togglePasswordBtn = document.getElementById('togglePasswordBtn');
    const eyeIcon = document.getElementById('eyeIcon');
    const urlParams = new URLSearchParams(window.location.search);
    const resetToken = urlParams.get('token');
    if (!resetToken) {
      window.location.href = '/login';
      return;
    }
    if (passwordInput) {
      passwordInput.addEventListener('input', () => { 
        if (passwordInput.value !== "") resetFieldError(passwordInput, passwordError); 
      });
    }
    if (togglePasswordBtn && passwordInput && eyeIcon) {
      togglePasswordBtn.addEventListener('click', function () {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        eyeIcon.innerHTML = type === 'text' 
          ? `<path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />`
          : `<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />`;
      });
    }
    if (resetForm) {
      resetForm.addEventListener('submit', (e) => handlePasswordResetSubmit(e, resetToken));
    }
  }
})

const API_BASE = 'https://cutlink-rho.vercel.app';

async function fetchUserProfile(token) {
  try {
    const response = await fetch('/api/user/profile', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    if (data.success === true) {
      document.getElementById('userWorkspaceEmail').textContent = data.user.email;
    } else {
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
  } catch (error) {
    console.error('Error loading dashboard profile data:', error);
  }
}

const htmlEscape = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const num = (v) => Number(v) || 0;
  const $id = (id) => document.getElementById(id);
  const setHidden = (el, hidden) => { if (el) el.classList.toggle('hidden', hidden); };
  const getRange = () => document.querySelector('[data-bind="range"]')?.value || 30;
  const toast = (msg, type = 'error') => {
    if (typeof showToast === 'function') showToast(msg, type);
    else console.warn(msg);
  };
  const getCtr = (l) => {
  if (l.ctr != null && !Number.isNaN(Number(l.ctr))) return Number(l.ctr);
  const clicks = num(l.clicks);
  return clicks > 0 ? Number(((num(l.uniqueVisitors) / clicks) * 100).toFixed(1)) : 0;
};
const getGrowth = (l) => {
  const value = l.percentageChange !== undefined ? l.percentageChange : l.growth;
  if (value === undefined || value === null) return null;
  return Number(value);
};
export function setDashboardView(view) {
  window.dashboardView = view;
  if (window.dashboardActive === false) return;
  setHidden($id('state-loading'), view !== 'loading');
  setHidden($id('state-empty'), view !== 'empty');
  setHidden($id('state-error'), view !== 'error');
  setHidden($id('dashboard-content'), view !== 'content');
}
function applyCompareVisibility() {
  const on = !!window.compareOn;
  setHidden(document.querySelector('[data-slot="period-previous"]')?.parentElement, !on);
  setHidden(document.querySelector('[data-slot="period-change"]'), !on);
  const legend = $id('chart-legend');
  if (legend) {
    legend.classList.toggle('hidden', !on);
    legend.classList.toggle('flex', on);
  }
  const btn = document.querySelector('[data-action="compare"]');
  if (btn) {
    if (on) { btn.classList.remove('bg-white'); btn.classList.add('bg-indigo-50', 'border-indigo-200', 'text-indigo-600'); }
    else { btn.classList.add('bg-white'); btn.classList.remove('bg-indigo-50', 'border-indigo-200', 'text-indigo-600'); }
  }
}
export async function initDashboard(token) {
  token = token || localStorage.getItem('authToken'); 
  if (!token) { window.location.href = '/login'; return; }
  const dashboardContent = $id('dashboard-content');
  const linksBody =
    $id('dashboard-links-body') ||
    document.querySelector('#dashboard-content #links-body');
    const wasViewingContent = dashboardContent && !dashboardContent.classList.contains('hidden');
    const retryBtn = document.querySelector('[data-action="retry"]');
    if (retryBtn) {
      retryBtn.onclick = (e) => { e.preventDefault(); initDashboard(token); };
    }
    const createLinkBtn = document.querySelector('[data-action="create-link"]');
    if (createLinkBtn) {
      createLinkBtn.onclick = () => setDashboardView('content');
    }

    if (!wasViewingContent) setDashboardView('loading');
    try {
    const res = await fetch(`/api/user/links`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) {
      localStorage.removeItem('authToken');
      window.location.href = '/login';
      return;
    }
    const data = await res.json();
    if (!res.ok || !data.success || !Array.isArray(data.links)) {
      setDashboardView('error');
      return;
    }
    const allLinks = data.links;
    window.cachedLinksData = allLinks;
    applyCompareVisibility();
    if (allLinks.length === 0 && !wasViewingContent) {
      setDashboardView('empty');
      return;
    }
    setDashboardView('content');
    const setKpi = (kpi, text) => {
      const el = document.querySelector(`[data-kpi="${kpi}"] [data-slot="value"]`);
      if (el) el.textContent = text;
    };
    const totalClicks = allLinks.reduce((n, l) => n + num(l.clicks), 0);
    const totalUnique = num(data.uniqueVisitors);
    const averageCtr = totalClicks > 0 ? (totalUnique / totalClicks) * 100 : 0;
    setKpi('linksCreated', allLinks.length);
    setKpi('totalClicks', totalClicks);
    setKpi('uniqueVisitors', totalUnique);
    setKpi('averageCtr', `${averageCtr.toFixed(1)}%`);
    const renderTable = (list) => {
      if (!linksBody) return;
      const info = $id('pagination-info');
      if (info) info.textContent = `Showing ${list.length} of ${allLinks.length} links`;
      if (list.length === 0) {
        const msg = allLinks.length === 0
          ? 'Your new link will populate here on refresh.'
          : 'No links matched your search or filter.';
        linksBody.innerHTML = `
          <tr>
            <td colspan="8" class="px-6 py-14 text-center">
              <div class="mx-auto grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-400">
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              </div>
               <p class="mt-3 text-sm text-slate-500">${msg}</p>
            </td>
          </tr>`;
        return;
      }
      linksBody.innerHTML = list.map((link) => {
        const growth = getGrowth(link);
        const diff = Number(link.clickDifference || 0); 
        let trend;
        if (growth === 100 && diff > 0) {
          trend = `<span class="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">New</span>`;
        }
        else if (growth > 0) {
          trend = `<span class="inline-flex items-center text-xs font-semibold text-emerald-600 tabular-nums">+${growth}%</span>`;
        }
        else if (growth < 0) {
          trend = `<span class="inline-flex items-center text-xs font-semibold text-red-600 tabular-nums">${growth}%</span>`;
        }
        else {
          trend = `<span class="text-xs font-medium text-slate-400">—</span>`;
        }
        const campaignCell = link.campaign
          ? `<span class="inline-flex max-w-40 items-center truncate rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-100">${htmlEscape(link.campaign)}</span>`
          : `<span class="text-xs text-slate-400">None</span>`;
          return `
          <tr class="border-b border-slate-100 text-slate-700 transition-colors last:border-b-0 hover:bg-slate-50">
            <td class="px-5 py-4 font-semibold text-indigo-600 break-all">${htmlEscape(window.location.host)}/${htmlEscape(link.shortUrl)}</td>
            <td class="px-3 py-4"><span class="block max-w-xs truncate text-slate-500" title="${htmlEscape(link.longUrl)}">${htmlEscape(link.longUrl)}</span></td>
            <td class="whitespace-nowrap px-3 py-4">${campaignCell}</td>
            <td class="px-3 py-4 text-right font-semibold tabular-nums text-slate-900">${num(link.clicks)}</td>
            <td class="px-3 py-4 text-right tabular-nums text-slate-500">${num(link.uniqueVisitors)}</td>
            <td class="px-3 py-4 text-right tabular-nums text-slate-500">${getCtr(link)}%</td>
            <td class="whitespace-nowrap px-3 py-4 text-right font-medium text-slate-500">${trend}</td>
            <td class="px-5 py-4 text-right">
              <button type="button" data-short="${htmlEscape(link.shortUrl)}" aria-label="Manage ${htmlEscape(link.shortUrl)}" class="inline-flex h-8 cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600/40">Manage</button>
            </td>
          </tr>`;
      }).join('');
    };
    if (linksBody) {
      linksBody.onclick = (e) => {
        const btn = e.target.closest('button[data-short]');
        if (!btn) return;
        e.stopPropagation();
        loadLinkDetailsToDashboard(btn.dataset.short, token, getRange());
      };
    }
    const searchInput = document.querySelector('[data-bind="links-search"]');
    const campaignSelect = document.querySelector('[data-bind="links-campaign"]');
    const sortSelect = document.querySelector('[data-bind="links-sort"]');
    if (campaignSelect) {
      const previous = campaignSelect.value;
      const campaigns = [...new Set(allLinks.map((l) => l.campaign).filter(Boolean))].sort();
      campaignSelect.innerHTML =
        '<option value="all">All campaigns</option>' +
        campaigns.map((c) => `<option value="${htmlEscape(c)}">${htmlEscape(c)}</option>`).join('');
      campaignSelect.value = campaigns.includes(previous) ? previous : 'all';
    }
    const sorters = {
      clicks: (a, b) => num(b.clicks) - num(a.clicks),
      uniqueVisitors: (a, b) => num(b.uniqueVisitors) - num(a.uniqueVisitors),
      ctr: (a, b) => getCtr(b) - getCtr(a),
      growth: (a, b) => getGrowth(b) - getGrowth(a)
    };
    const applyView = () => {
      const q = (searchInput?.value || '').toLowerCase().trim();
      const campaign = campaignSelect?.value || 'all';
      const sortKey = sortSelect?.value || 'clicks';

      const list = allLinks.filter((l) => {
        if (campaign !== 'all' && l.campaign !== campaign) return false;
        if (!q) return true;
        return (
          `${window.location.host}`/`${l.shortUrl}`.toLowerCase().includes(q) ||
          String(l.longUrl ?? '').toLowerCase().includes(q) ||
          String(l.campaign ?? '').toLowerCase().includes(q)
        );
      });
      list.sort(sorters[sortKey] || sorters.clicks);
      renderTable(list);
    };
    if (searchInput) searchInput.oninput = applyView;
    if (campaignSelect) campaignSelect.onchange = applyView;
    if (sortSelect) sortSelect.onchange = applyView;
    applyView();
    const exportBtn = document.querySelector('[data-action="export"]');
    if (exportBtn) {
      exportBtn.onclick = async (e) => {
        e.preventDefault();
        if (allLinks.length === 0) {
          toast('There are no active link analytics available to export.', 'error');
          return;
        }
        const originalHTML = exportBtn.innerHTML;
        exportBtn.disabled = true;
        exportBtn.textContent = 'Generating PDF...';
        try {
          const response = await fetch(`/export-pdf`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ links: allLinks })
          });
          if (!response.ok) throw new Error('Generation failure response.');
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `link_analytics_${new Date().toISOString().split('T')[0]}.pdf`
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        } catch (err) {
          console.error('PDF Export Process Failed:', err);
          toast('Failed to download PDF analytics report. Please try again.', 'error');
        } finally {
          exportBtn.disabled = false;
          exportBtn.innerHTML = originalHTML;
        }
      };
    }
    const compareBtn = document.querySelector('[data-action="compare"]');
    if (compareBtn) {
      compareBtn.onclick = (e) => {
        e.preventDefault();
        window.compareOn = !window.compareOn;
        applyCompareVisibility();
      };
    }
     if (allLinks.length > 0) {
      loadLinkDetailsToDashboard(allLinks[0].shortUrl, token, getRange());
    }
  } catch (err) {
    console.error('Dashboard error handler caught exception:', err);
    setDashboardView('error');
  }
}

export async function loadLinkDetailsToDashboard(shortCode, token, range = 30) {
  if (!shortCode) return;
  token = token || localStorage.getItem('authToken');
  window.currentActiveShortCode = shortCode;

  try {
    const res = await fetch(
      `/api/analytics/${encodeURIComponent(shortCode)}?range=${encodeURIComponent(range)}`,
      { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } }
    );
    const data = await res.json();
    if (window.currentActiveShortCode !== shortCode) return;
    if (!res.ok || !data.success) {
      console.error('Analytics request failed:', data);
      return;
    }
    const timeline = data.timeline || {};
    const referrers = data.topReferrers || {};
    const totalClicks = num(data.totalClicks);
    const rangeDays = num(data.rangeDays) || Number(range) || 30;
    const clickDifference = num(data.clickDifference);
    const percentageChange = num(data.percentageChange);
    setHidden($id('analyticsInspectCard'), false);
    setHidden($id('performanceTrendCard'), false);
    const currentSlot = document.querySelector('[data-slot="period-current"]');
    const previousSlot = document.querySelector('[data-slot="period-previous"]');
    const changeSlot = document.querySelector('[data-slot="period-change"]');
    if (currentSlot) currentSlot.textContent = `${totalClicks} clicks`;
    if (previousSlot) previousSlot.textContent = `${num(data.previousPeriodClicks)} clicks`;
    if (changeSlot) {
      if (clickDifference > 0) {
        changeSlot.className = 'pb-1 text-xs font-bold text-emerald-600';
        if (percentageChange === 100 && data.currentPeriodClicks === clickDifference) {
          changeSlot.textContent = `▲ New (+${clickDifference})`;
        } else {
          changeSlot.textContent = `▲ +${percentageChange}% (+${clickDifference})`;
        }
      } else if (clickDifference < 0) {
        changeSlot.className = 'pb-1 text-xs font-bold text-red-600';
        changeSlot.textContent = `▼ ${percentageChange}% (${clickDifference})`;
        
      } else {
        changeSlot.className = 'pb-1 text-xs font-bold text-slate-400';
        changeSlot.textContent = '0% change';
      }
    }
    applyCompareVisibility();
    const chartContainer = $id('performance-chart');
    const xAxisContainer = $id('chart-x-axis');
    if (chartContainer && xAxisContainer) {
      const days = [];
      for (let i = rangeDays - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().split('T')[0]);
      }
      const maxClicks = Math.max(...days.map((d) => num(timeline[d])), 1);
      const labelConfig = rangeDays > 30 ? { day: 'numeric' } : { month: 'short', day: 'numeric' };
      const step = Math.max(1, Math.round(rangeDays / 7));

      let bars = '';
      let labels = '';
      days.forEach((day, i) => {
        const count = num(timeline[day]);
        const heightPct = (count / maxClicks) * 100;
        const label = new Date(`${day}T00:00:00Z`).toLocaleDateString('en-NG', { ...labelConfig, timeZone: 'UTC' });
        bars += `
          <div class="flex-1 flex flex-col items-center h-full justify-end group relative">
          <div class="absolute bottom-full mb-2 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded hidden group-hover:block pointer-events-none z-30 whitespace-nowrap shadow-md">
              ${count} ${count === 1 ? 'click' : 'clicks'}
            </div>
            <div class="w-full max-w-6 bg-indigo-600 dark:bg-indigo-500 rounded-t transition-all duration-300 hover:bg-indigo-500 min-h-1" style="height: ${heightPct}%"></div>
          </div>`;

        labels += (rangeDays <= 7 || i % step === 0)
          ? `<span class="flex-1 text-center text-[10px] font-medium text-slate-400">${label}</span>`
          : `<span class="flex-1"></span>`;
      });
      chartContainer.innerHTML = bars; 
      xAxisContainer.innerHTML = labels;
    }
    const TRAFFIC_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#a78bfa', '#94a3b8'];
    const trafficColor = (i) => TRAFFIC_COLORS[i % TRAFFIC_COLORS.length];
    const sources = Object.entries(referrers).map(([name, count]) => [name, num(count)]);
    const referrerSum = sources.reduce((s, [, c]) => s + c, 0);
    const totalBaseline = Math.max(totalClicks, referrerSum, 1);
    const donutContainer = $id('traffic-donut');
    if (donutContainer) {
      const radius = 46;
      const circumference = 2 * Math.PI * radius;
      let runningOffset = 0;
      const segments = sources.map(([, count], index) => {
        const segmentLength = (count / totalBaseline) * circumference;
        const dashArc = segmentLength >= circumference - 0.01 ? segmentLength : Math.max(segmentLength - 2, 0);
        const svg = count > 0
          ? `<circle cx="60" cy="60" r="${radius}" fill="none" stroke="${trafficColor(index)}" stroke-width="14" stroke-dasharray="${dashArc} ${circumference - dashArc}" stroke-dashoffset="${-runningOffset}"/>`
          : '';
        runningOffset += segmentLength;
        return svg;
      }).join('');
      donutContainer.innerHTML = `
        <svg viewBox="0 0 120 120" class="h-full w-full -rotate-90" role="img" aria-label="Traffic channels breakdown">
          <circle cx="60" cy="60" r="${radius}" fill="none" stroke="#f1f5f9" stroke-width="14"/>
          ${segments}
        </svg>`;
    }
    const totalSlot = document.querySelector('[data-slot="traffic-total"]');
    if (totalSlot) totalSlot.textContent = totalClicks;
    const legend = $id('traffic-legend');
    if (legend) {
      legend.innerHTML = sources.length === 0
        ? `<li class="text-sm text-slate-400">No traffic data yet</li>`
        : sources.map(([source, count], index) => {
            const pct = Math.round((count / totalBaseline) * 100);
            return `
              <li class="flex items-center justify-between gap-3 text-sm">
                <span class="flex min-w-0 items-center gap-2.5">
                  <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background-color: ${trafficColor(index)}"></span>
                  <span class="truncate font-medium capitalize text-slate-700">${htmlEscape(source.replace('www.', ''))}</span>
                  <span class="shrink-0 text-xs text-slate-500">${pct}%</span>
                </span>
                <span class="shrink-0 font-semibold tabular-nums text-slate-900">${count}</span>
              </li>`;
          }).join('');
    }
  } catch (error) {
    console.error('Failed loading link inspector details:', error);
  }
}

export function setupDashboardRoute({ handleDashboardShortenSubmit, fetchUserProfile, renderMyLinksView }) {
  const token = localStorage.getItem('authToken');
  if (!token) {
    window.location.href = '/login';
    return false;
  }
  window.dashboardActive = true;
  const dashForm = $id('dashboardShortenForm');
  if (dashForm && typeof handleDashboardShortenSubmit === 'function') {
    dashForm.onsubmit = handleDashboardShortenSubmit;
  }
  const rangeSelect = document.querySelector('[data-bind="range"]');
  if (rangeSelect) {
    rangeSelect.onchange = function () {
      const activeToken = localStorage.getItem('authToken');
      const code = window.currentActiveShortCode;
      if (code && activeToken) loadLinkDetailsToDashboard(code, activeToken, this.value);
    };
  }
  initDashboard(token);
  if (typeof fetchUserProfile === 'function') fetchUserProfile(token);
  
  initCampaignsTab({
    getCampaigns: async () => {
      const token = localStorage.getItem('authToken');

      const response = await fetch('/api/campaigns', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || 'Failed to load campaigns.'
        );
      }

      return data.campaigns;
    },
    createCampaign: async (payload) => {
      const token = localStorage.getItem('authToken');

      const response = await fetch('/api/shorten', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          longUrl: payload.taggedUrl,
          campaign: payload.name
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to create campaign link.');
      }

      return data;
    }
  });

  if (typeof window.initTagsTab === 'function') {
    window.initTagsTab({
      api: {
        listTags: async () => {
          const token = localStorage.getItem('authToken');

          const response = await fetch('/api/tags', {
            headers: {
              Authorization: `Bearer ${token}`
            }
          });

          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to load tags.');
          }

          return {
            tags: data.tags.map(tag => ({
              ...tag,
              id: tag._id
            })),
            taggedLinks: data.taggedLinks
          };
        },

        createTag: async ({ name, color }) => {
          const token = localStorage.getItem('authToken');

          const response = await fetch('/api/tags', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ name, color })
          });

          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to create tag.');
          }

          return {
            ...data.tag,
            id: data.tag._id
          };
        },
        deleteTag: async (id) => {
          const token = localStorage.getItem('authToken');

          const response = await fetch(
            `/api/tags/${encodeURIComponent(id)}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${token}`
              }
            }
          );

          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to delete tag.');
          }

          return data;
        },
        listLinks: async () => {
          const token = localStorage.getItem('authToken');

          const response = await fetch('/api/tags/links', {
            headers: {
              Authorization: `Bearer ${token}`
            }
          });

          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to load links.');
          }

          return data.links.map(link => ({
            id: String(link._id),
            label: link.shortUrl || link.longUrl,
            originalUrl: link.longUrl
          }));
        },
        getTagLinks: async (tagId) => {
          const token = localStorage.getItem('authToken');

          const response = await fetch(`/api/tags/${encodeURIComponent(tagId)}/links`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to load tagged links.');
          }

          return data.links.map(link => link._id);
        },
        setTagLinks: async (tagId, linkIds) => {
          const token = localStorage.getItem('authToken');

          const response = await fetch(`/api/tags/${encodeURIComponent(tagId)}/links`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ linkIds })
          });

          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to save tag assignments.');
          }

          return data;
        },
        updateTag: async (id, { name, color }) => {
          const token = localStorage.getItem('authToken');

          const response = await fetch(
            `/api/tags/${encodeURIComponent(id)}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ name, color })
            }
          );

          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to update tag.');
          }

          return {
            ...data.tag,
            id: data.tag._id
          };
        }
      }
    });
  } else {
    console.error('Tags: initTagsTab is not available.');
  }

  initDomainsTab({
    api: {
      listDomains: async () => {
        const token = localStorage.getItem('authToken');

        const response = await fetch('/api/domains', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to load domains.');
        }

        return data;
      },

      addDomain: async ({ domain }) => {
        const token = localStorage.getItem('authToken');

        const response = await fetch('/api/domains', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ domain })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to add domain.');
        }

        return data;
      },

      getDomain: async (id) => {
        const token = localStorage.getItem('authToken');

        const response = await fetch(
          `/api/domains/${encodeURIComponent(id)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to load domain.');
        }

        return data;
      },

      verifyDomain: async (id) => {
        const token = localStorage.getItem('authToken');

        const response = await fetch(
          `/api/domains/${encodeURIComponent(id)}/verify`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to verify domain.');
        }

        return data;
      },

      deleteDomain: async (id) => {
        const token = localStorage.getItem('authToken');

        const response = await fetch(
          `/api/domains/${encodeURIComponent(id)}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to delete domain.');
        }

        return data;
      }
    }
  });

  const sidebar = $id('sidebar');
  const overlay = $id('overlay');
  const openDrawer = () => {
    if (sidebar) { sidebar.classList.remove('-translate-x-full'); sidebar.classList.add('translate-x-0'); }
    setHidden(overlay, false);
  };
  const closeDrawer = () => {
    if (sidebar) { sidebar.classList.add('-translate-x-full'); sidebar.classList.remove('translate-x-0'); }
    setHidden(overlay, true);
  };
  document.querySelectorAll('[data-action="menu"]').forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      if (sidebar && sidebar.classList.contains('translate-x-0')) closeDrawer();
      else openDrawer();
    };
  });
  if (overlay) overlay.onclick = closeDrawer;
  const NAV_VIEWS = {
    dashboard: 'dashboard-content',
    links: 'view-links',
    qr: 'view-qr',
    analytics: 'analytics',
    audiences: 'audiences',
    domains: 'custom-domains',
    campaigns: 'campaigns',
    tags: 'tags-label',
    upgrade: 'upgrade-premium',
    settings: 'view-settings'
  };
  const ACTIVE_SOLID = ['bg-indigo-600', 'text-white'];
  const ACTIVE_SOFT = ['bg-indigo-50', 'text-indigo-600'];
  const INACTIVE = ['text-slate-600', 'hover:bg-slate-100'];
  function hideAllViews() {
    window.dashboardActive = false;
    Object.values(NAV_VIEWS).forEach((id) => setHidden($id(id), true));
    ['state-loading', 'state-empty', 'state-error'].forEach((id) => setHidden($id(id), true));
    document.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.classList.remove(...ACTIVE_SOLID, ...ACTIVE_SOFT);
      btn.classList.add(...INACTIVE);
    });
  }
   function setActive(btn, solid) {
    btn.classList.remove(...INACTIVE);
    btn.classList.add(...(solid ? ACTIVE_SOLID : ACTIVE_SOFT));
  }
  Object.entries(NAV_VIEWS).forEach(([name, viewId]) => {
    const btn = document.querySelector(`[data-nav="${name}"]`);
    if (!btn) return;
    btn.onclick = (e) => {
      e.preventDefault();
      hideAllViews();
      setActive(btn, name === 'dashboard');
      closeDrawer();
      if (name === 'dashboard') {
        window.dashboardActive = true;
        setDashboardView(window.dashboardView || 'loading');
        if (!window.cachedLinksData && window.dashboardView !== 'loading') initDashboard(token);
        return;
      }
      setHidden($id(viewId), false);
      if (name === 'links') {
        if (window.cachedLinksData && typeof renderMyLinksView === 'function') {
          renderMyLinksView(window.cachedLinksData, { onDelete: deleteLinkFromServer});
        } else {
          setHidden($id('links-loading'), false);
        }
      }
      if (name === 'audiences') {
        if (typeof window.initAudienceTab === 'function') {
          window.initAudienceTab({
            request: async (url) => {
              const params = new URL(url, window.location.origin).searchParams;
              return window.CutlinkAnalytics.fetchFromApi({
                range: params.get('range') || '30d',
                linkId: params.get('linkId') || ''
              });
            }
          });
        } else {
          console.error('Audience: initAudienceTab is not available.');
        }
      }
    };
  });
  return true;
}
