import { showFieldError, resetFieldError } from "./signup.js";
export async function handleForgotPasswordSubmit(e) {
  e.preventDefault();
  const emailInput = document.getElementById('email');
  const emailError = document.getElementById('emailError');
  const submitBtn = document.getElementById('submitBtn');
  const successMessage = document.getElementById('success-message');
  resetFieldError(emailInput, emailError);
  if (successMessage) successMessage.classList.add('hidden');
  const email = emailInput.value.trim();
  if (!email) {
    showFieldError(emailInput, emailError, "Please enter your email address.");
    return;
  }
  submitBtn.disabled = true;
  submitBtn.textContent = "Sending link...";
  try {
    const response = await fetch('http://localhost:3000/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    if (data.success === true) {
      emailInput.value = '';
      if (successMessage) {
        successMessage.textContent = data.message;
        setTimeout(() => {
          successMessage.classList.add('hidden');
        }, 5000);
        successMessage.classList.remove('hidden');
      }
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Reset Link";
    } else {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Reset Link";
      showFieldError(emailInput, emailError, data.message);
    }
  } catch (error) {
    console.error('Forgot password submission network error:', error);
    submitBtn.disabled = false;
    submitBtn.textContent = "Send Reset Link";
    showFieldError(emailInput, emailError, "Cannot connect to server. Please try again.");
  }
}

export async function handlePasswordResetSubmit(e, token) {
  e.preventDefault();
  const passwordInput = document.getElementById('password');
  const passwordError = document.getElementById('passwordError');
  const submitBtn = document.getElementById('submitBtn');
  const successMessage = document.getElementById('success-message');
  resetFieldError(passwordInput, passwordError);
  if (successMessage) successMessage.classList.add('hidden');
  const newPassword = passwordInput.value;
  if (!newPassword) {
    showFieldError(passwordInput, passwordError, "Please enter a new password.");
    return;
  } else if (newPassword.length < 6) {
    showFieldError(passwordInput, passwordError, "Password must be at least 6 characters long.");
    return;
  }
  submitBtn.disabled = true;
  submitBtn.textContent = "Updating password...";
  try {
    const response = await fetch('http://localhost:3000/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, newPassword: newPassword })
    });
    const data = await response.json();
    if (data.success === true) {
      passwordInput.value = '';
      if (successMessage) {
        successMessage.textContent = data.message
        successMessage.classList.remove('hidden');
      }
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    } else {
      submitBtn.disabled = false;
      submitBtn.textContent = "Update Password";
      showFieldError(passwordInput, passwordError, data.message);
    }
  } catch (error) {
    console.error('Password reset transmission failure error:', error);
    submitBtn.disabled = false;
    submitBtn.textContent = "Update Password";
    showFieldError(passwordInput, passwordError, "Cannot connect to server. Please try again.");
  }
}