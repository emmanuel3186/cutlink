import { showFieldError, resetFieldError } from "./signup.js";

export async function handleLogin(e) {
  e.preventDefault()
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const emailError = document.getElementById('emailError');
  const passwordError = document.getElementById('passwordError');
  const submitBtn = document.getElementById('submitBtn');
  const successMessage = document.getElementById('success-message');
  const rememberMeChecked = document.getElementById('rememberMe').checked;
  resetFieldError(emailInput, emailError);
  resetFieldError(passwordInput, passwordError);
  if (successMessage) successMessage.classList.add('hidden');
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  let isValid = true;
  if (!email) {
    showFieldError(emailInput, emailError, "Please enter your email address.");
    isValid = false;
  }
  if (!password) {
    showFieldError(passwordInput, passwordError, "Please enter your password.");
    isValid = false;
  }
  if (!isValid) return;
  submitBtn.disabled = true;
  submitBtn.textContent = "Verifying credentials...";
  try {
    const res = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, rememberMe: rememberMeChecked })
    });
    const data = await res.json();
    if (data.success === true && data.token) {
      if (successMessage) {
        successMessage.textContent = "Welcome back! Redirecting to dashboard...";
        successMessage.classList.remove('hidden');
      }
      localStorage.setItem('authToken', data.token);
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1500);
    } else {
      submitBtn.disabled = false;
      submitBtn.textContent = "Log in";
      showFieldError(passwordInput, passwordError, data.message);
    }
  } catch (err) {
    console.error('Login error:', err);
    submitBtn.disabled = false;
    submitBtn.textContent = "Log in";
    showFieldError(emailInput, emailError, "Cannot connect to server. Please try again later.");
  }
}