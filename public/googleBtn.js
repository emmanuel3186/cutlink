export async function tryRenderGoogleButton() {
  if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
  const googleContainer = document.getElementById('googleSignInContainer');
  if (googleContainer) {
    const res = await fetch('/api/config/google-client-id');
    const config = await res.json();
    google.accounts.id.initialize({
      client_id: config.clientId,
      callback: handleGoogleSignIn 
    });
    google.accounts.id.renderButton(
      googleContainer,
      { 
        theme: "outline", 
        size: "large", 
        text: "continue_with", 
        shape: "rectangular", 
        width: "340" 
      }
    );
  } else {
      setTimeout(() => { tryRenderGoogleButton(); }, 50);
    }
  } else {
    setTimeout(() => { tryRenderGoogleButton(); }, 100);
  }
}

export async function handleGoogleSignIn(response) {
  const id_token = response.credential; 
  const errorElement = document.getElementById('googleAuthError');
  if (errorElement) errorElement.classList.add('hidden');
  try {
    const response = await fetch('/api/auth/google', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token: id_token })
    });
    const data = await response.json();
    if (data.success === true && data.token) {
      localStorage.setItem('authToken', data.token);
      window.location.href = '/dashboard';
    } else {
      if (errorElement) {
        errorElement.textContent = data.message || 'Google authentication rejected. Please try again.';
        errorElement.classList.remove('hidden');
      }
    }
  } catch (error) {
    console.error('Google Auth Error:', error);
    if (errorElement) {
      errorElement.textContent = 'Cannot connect to server. Please verify your internet connection.';
      errorElement.classList.remove('hidden');
    }
  }
}