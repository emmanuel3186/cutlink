export async function handleCodeVerification(email) {
  const codeInput = document.getElementById('verifyCodeInput');
  const verifyError = document.getElementById('verifyError');
  const code = codeInput.value.trim();
  const confirmVerifyBtn = document.getElementById('confirmVerifyBtn');

  if (verifyError) verifyError.classList.add('hidden');

  if (!code || code.length !== 6) {
    verifyError.textContent = "Please enter a valid 6-digit code.";
    verifyError.classList.remove('hidden');
    return;
  }
  confirmVerifyBtn.disabled = true;
  confirmVerifyBtn.textContent = "Processing verification...";

  try {
    const response = await fetch('http://localhost:3000/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, code })
    });

    const data = await response.json();

    if (data.success === true) {
      const successMessage = document.getElementById('success-message');
      if (successMessage) {
        successMessage.textContent = data.message;
        successMessage.classList.remove('hidden');
      }
      window.location.href = '/login';
    } else {
      verifyError.textContent = data.message;
      verifyError.classList.remove('hidden');
    }
  } catch (error) {
    console.error(error);
  }
}

export async function handleResendCode(email) {
  resendCodeBtn.textContent = "Sending code...";
  resendCodeBtn.style.pointerEvents = "none"; 
  try {
    const response = await fetch('http://localhost:3000/api/auth/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email })
    });
    const data = await response.json();
    const verifyError = document.getElementById('verifyError');
    if (data.success === true) {
      if (verifyError) {
        verifyError.textContent = data.message;
        verifyError.classList.remove('hidden', 'text-red-600');
        verifyError.classList.add('text-emerald-600'); 
      }
    } 
    else {
      if (verifyError) {
        verifyError.textContent = data.message;
        verifyError.classList.remove('hidden', 'text-emerald-600');
        verifyError.classList.add('text-red-600');
     }
    }
  } catch (err) {
    console.error("Resend network error:", err);
  } finally {
    setTimeout(() => {
      resendCodeBtn.textContent = "Resend code";
      resendCodeBtn.style.pointerEvents = "auto";
    }, 5000);
  }
};