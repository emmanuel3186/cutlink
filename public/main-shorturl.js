//const shortenBtn = document.getElementById('shortenForm');
export async function shortUrl(e) {
  e.preventDefault();
  const longUrlInput = document.getElementById('longUrl');
  const resultDiv = document.getElementById('result');
  const submitBtn = document.getElementById('submitBtn');
  const urlVal = longUrlInput.value.trim();
  submitBtn.disabled = true;
  submitBtn.textContent = "Shrinking...";
  try {
    const response = await fetch('http://localhost:3000/api/shorten', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ longUrl: urlVal })
    });
    const data = await response.json();
    resultDiv.classList.remove('hidden');
    if (data.success === true && data.shortUrl) {
      resultDiv.innerHTML = `
        <div class="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between w-full">
          <!-- Left Content Panel -->
          <div class="flex-1 min-w-0 pr-2">
            <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 mb-3">
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Ready to share
            </span>
            <p class="text-xs font-medium text-slate-400 truncate max-w-xs sm:max-w-md mb-1">Original: ${urlVal}</p>
            <a href="${data.shortUrl}" target="_blank" class="block text-xl font-bold tracking-tight text-indigo-600 underline decoration-indigo-200 decoration-2 underline-offset-4 hover:text-indigo-700 transition break-all">
              ${data.shortUrl.replace(/^https?:\/\//, '')}
            </a>
            <button type="button" id="copyLinkBtn" class="mt-4 flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 cursor-pointer">
              <svg id="copyIcon" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
              <span id="copyBtnText">Copy Link</span>
            </button>
          </div>
          <!-- Right QR Code Panel (Fixed padding and shadow frames) -->
          <div class="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 shrink-0 sm:self-center self-start w-full sm:w-auto">
            <div id="qrcode" class="bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-sm flex items-center justify-center"></div>
            <button type="button" id="downloadQrBtn" class="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition cursor-pointer">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16v1a2 2 0 002 2h14a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Download QR
            </button>
          </div>
        </div>
      `;
      function renderQRWhenReady() {
        if (typeof QRCode !== 'undefined') {
          const qrcodeContainer = document.getElementById("qrcode");
          const qrEngine = new QRCode(qrcodeContainer, {
            text: data.shortUrl,
            width: 120,
            height: 120,
            colorDark: "#0f172a",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
          });
          document.getElementById('downloadQrBtn').onclick = () => {
            const canvas = qrcodeContainer.querySelector('canvas');
            const img = qrcodeContainer.querySelector('img');
            const downloadLink = document.createElement('a');
            downloadLink.download = `cutlink-qr-${data.shortUrl.split('/').pop()}.png`;
            if (img && img.src && !img.src.startsWith('data:image/svg')) {
              downloadLink.href = img.src;
              downloadLink.click();
            } else if (canvas) {
              downloadLink.href = canvas.toDataURL("image/png");
              downloadLink.click();
            } else {
              setTimeout(() => {
                const retryImg = qrcodeContainer.querySelector('img');
                if (retryImg) { downloadLink.href = retryImg.src; downloadLink.click(); }
              }, 200);
            }
          };
        } else {
          setTimeout(renderQRWhenReady, 50);
        }
      }
      renderQRWhenReady();
      document.getElementById('copyLinkBtn').onclick = () => {
        navigator.clipboard.writeText(data.shortUrl);
        const copyBtn = document.getElementById('copyLinkBtn');
        const btnText = document.getElementById('copyBtnText');
        const icon = document.getElementById('copyIcon');
        copyBtn.classList.remove('border-slate-200', 'text-slate-700');
        copyBtn.classList.add('border-emerald-200', 'bg-emerald-50', 'text-emerald-700');
        btnText.textContent = "Copied!";
        icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>`;
        setTimeout(() => {
          copyBtn.classList.remove('border-emerald-200', 'bg-emerald-50', 'text-emerald-700');
          copyBtn.classList.add('border-slate-200', 'text-slate-700');
          btnText.textContent = "Copy Link";
          icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>`;
        }, 2000);
      };
      longUrlInput.value = '';
    }else {
      resultDiv.classList.remove('hidden');
      resultDiv.innerHTML = `
      <div class="flex items-center gap-2 text-red-600">
        <svg class="h-5 w-5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        <span class="text-sm font-semibold">${data.message}</span>
      </div>`;
      setTimeout(() => {
        resultDiv.classList.add('hidden');
        resultDiv.innerHTML = '';
      }, 4000);
    }
  } catch (error) {
    console.error('Error:', error);
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = `<div class="text-red-600 text-sm font-semibold">An error occurred connecting to the server.</div>`;
    setTimeout(() => { resultDiv.classList.add('hidden'); resultDiv.innerHTML = ''; }, 4000);
  }
  finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Shorten URL";
  }
}