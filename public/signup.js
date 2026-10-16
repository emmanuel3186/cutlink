export let registeredEmail = ""; 

export async function handleSignIn(e) {
  e.preventDefault();
  try {
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    const submitBtn = document.getElementById('submitBtn');
    const successMessage = document.getElementById('success-message');
    resetFieldError(emailInput, emailError);
    resetFieldError(passwordInput, passwordError);
    if (successMessage) successMessage.classList.add('hidden');
    registeredEmail = emailInput.value.trim();
    const password = passwordInput.value;
    let isValid = true;
    if (!registeredEmail) {
      showFieldError(emailInput, emailError, "Please enter your email address.");
      isValid = false;
    }
    if (!password) {
      showFieldError(passwordInput, passwordError, "Please enter your password.");
      isValid = false;
    } else if (password.length < 6) { 
      showFieldError(passwordInput, passwordError, "Password must be at least 6 characters.");
      isValid = false;
    }
    if (!isValid) return;
    submitBtn.disabled = true;
    submitBtn.textContent = "Processing registration...";
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: registeredEmail, password })
    });
    const data = await response.json();
    if(data.success === true) {
      if (successMessage) {
        successMessage.textContent = data.message;
        successMessage.classList.remove('hidden');
      }
      setTimeout(() => {
        window.location.href = `/verify?email=${encodeURIComponent(registeredEmail)}`;
      }, 1500);
    } else {
      showFieldError(emailInput, emailError, data.message);
      submitBtn.disabled = false;
      submitBtn.textContent = "Create free account";
    }
  } catch (error) {
    console.error('Network Error:', error);
    submitBtn.disabled = false;
    submitBtn.textContent = "Create free account";
    showFieldError(emailInput, emailError, "Cannot connect to server. Please try again later.");
  }
}
export function showFieldError(inputElement, errorElement, message) {
  inputElement.classList.remove('border-slate-300', 'border-slate-200', 'border-gray-300');
  inputElement.classList.add('border-red-500', 'focus:ring-red-500', 'focus:border-red-500');
  errorElement.textContent = message;
  errorElement.classList.remove('hidden');
}
export function resetFieldError(inputElement, errorElement) {
  inputElement.classList.remove('border-red-500', 'focus:ring-red-500', 'focus:border-red-500');
  inputElement.classList.add('border-slate-300');

  errorElement.textContent = "";
  errorElement.classList.add('hidden');
}