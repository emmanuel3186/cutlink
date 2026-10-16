import {initDashboard} from './index.js'
export async function handleDashboardShortenSubmit(e) {
  e.preventDefault();
  const token = localStorage.getItem('authToken');
  const longUrlInput = document.getElementById('longUrl');
  const resultDiv = document.getElementById('dashboardResult');
  const submitBtn = document.getElementById('dashboardSubmitBtn');
  const errorMsg = document.getElementById('dashboardFormError');
  const urlVal = longUrlInput.value.trim();
  if (errorMsg) errorMsg.classList.add('hidden');
  submitBtn.disabled = true;
  submitBtn.textContent = "Shrinking...";
  try {
    const response = await fetch('http://localhost:3000/api/shorten', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ longUrl: urlVal })
    });
    const data = await response.json();
    if (data.success === true && data.shortUrl) {
      resultDiv.classList.remove('hidden');
      resultDiv.innerHTML = `
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div class="min-w-0 flex-1">
            <span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
              Ready
            </span>
            <a href="${data.shortUrl}" target="_blank" rel="noopener noreferrer" class="mt-2 block break-all rounded text-lg font-semibold text-indigo-600 underline-offset-2 hover:text-indigo-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">${data.shortUrl.replace(/^https?:\/\//, '')}</a>
            <p class="mt-1 truncate text-xs text-slate-500">Original: ${urlVal}</p>
          </div>
          <button type="button" id="copyLinkBtn" class="group inline-flex h-10 w-full min-w-30 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-px hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 sm:w-auto">
            <svg class="h-4 w-4 text-slate-400 transition group-hover:text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy Link
          </button>
        </div>
      `;
      document.getElementById('copyLinkBtn').onclick = () => {
        navigator.clipboard.writeText(data.shortUrl);
        document.getElementById('copyLinkBtn').textContent = "Copied!";
        document.getElementById('copyLinkBtn').classList.add('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
      };
      longUrlInput.value = ''; 
      initDashboard(token);
    } else {
      if (errorMsg) {
        errorMsg.textContent = data.message || "Invalid URL format.";
        errorMsg.classList.remove('hidden');
      }
    }
  } catch (error) {
    console.error(error);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Shorten Link";
  }
}