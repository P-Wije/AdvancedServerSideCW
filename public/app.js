const state = {
  csrfToken: '',
  profile: null,
};

const flash = document.getElementById('flash');
const sessionSummary = document.getElementById('sessionSummary');
const profilePreview = document.getElementById('profilePreview');
const bidOverview = document.getElementById('bidOverview');
const bidHistory = document.getElementById('bidHistory');
const apiKeyOutput = document.getElementById('apiKeyOutput');

function showMessage(message, isError = false) {
  flash.textContent = message;
  flash.className = `flash${isError ? ' error' : ''}`;
  setTimeout(() => {
    flash.className = 'flash hidden';
  }, 4000);
}

async function parseResponsePayload(response) {
  const rawBody = await response.text();
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    console.error('Failed to parse response payload:', error);
    return {};
  }
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.csrfToken && !url.startsWith('/api/public/')) {
    headers.set('x-csrf-token', state.csrfToken);
  }

  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers,
  });

  const payload = await parseResponsePayload(response);
  if (!response.ok) {
    throw new Error(payload.message || 'Request failed.');
  }

  return payload;
}

async function refreshSession() {
  const session = await apiFetch('/auth/session');
  state.csrfToken = session.csrfToken || '';
  sessionSummary.textContent = JSON.stringify(session, null, 2);
}

async function refreshProfile() {
  try {
    const payload = await apiFetch('/profile/me');
    state.profile = payload.profile;
    profilePreview.textContent = JSON.stringify(payload.profile, null, 2);
  } catch (error) {
    console.error('Failed to refresh profile:', error);
    profilePreview.textContent = 'Sign in and verify your email to load your profile.';
  }
}

async function refreshBids() {
  try {
    const overview = await apiFetch('/bids/overview');
    bidOverview.textContent = JSON.stringify(overview, null, 2);
    const history = await apiFetch('/bids/history');
    bidHistory.textContent = JSON.stringify(history, null, 2);
  } catch (error) {
    console.error('Failed to refresh bids:', error);
    bidOverview.textContent = 'Sign in and verify your email to manage bidding.';
    bidHistory.textContent = 'No bidding data available.';
  }
}

async function refreshApiKeys() {
  try {
    const payload = await apiFetch('/developer/api-keys');
    apiKeyOutput.textContent = JSON.stringify(payload, null, 2);
  } catch (error) {
    console.error('Failed to refresh API keys:', error);
    apiKeyOutput.textContent = 'Sign in and verify your email to manage API keys.';
  }
}

function bindSimpleJsonForm(formId, url, onSuccess) {
  const form = document.getElementById(formId);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const payload = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      showMessage(payload.message || 'Request complete.');
      form.reset();
      if (onSuccess) {
        await onSuccess(payload);
      }
    } catch (error) {
      showMessage(error.message, true);
    }
  });
}

document.getElementById('profileForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  try {
    const payload = await apiFetch('/profile/me', {
      method: 'POST',
      body: formData,
    });
    profilePreview.textContent = JSON.stringify(payload.profile, null, 2);
    showMessage(payload.message || 'Profile saved.');
  } catch (error) {
    showMessage(error.message, true);
  }
});

document.getElementById('bidForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const amount = event.currentTarget.amount.value;
  try {
    const payload = await apiFetch('/bids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });
    bidOverview.textContent = JSON.stringify(payload, null, 2);
    await refreshBids();
    showMessage(payload.message || 'Bid saved.');
  } catch (error) {
    showMessage(error.message, true);
  }
});

document.getElementById('apiKeyForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = event.currentTarget.name.value;
  try {
    const payload = await apiFetch('/developer/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    apiKeyOutput.textContent = JSON.stringify(payload, null, 2);
    showMessage(payload.message || 'API key created.');
    await refreshApiKeys();
  } catch (error) {
    showMessage(error.message, true);
  }
});

document.getElementById('logoutButton').addEventListener('click', async () => {
  try {
    const payload = await apiFetch('/auth/logout', { method: 'POST' });
    showMessage(payload.message || 'Logged out.');
    await refreshSession();
    await refreshProfile();
    await refreshBids();
    await refreshApiKeys();
  } catch (error) {
    showMessage(error.message, true);
  }
});

bindSimpleJsonForm('registerForm', '/auth/register', refreshSession);
bindSimpleJsonForm('loginForm', '/auth/login', async () => {
  await refreshSession();
  await refreshProfile();
  await refreshBids();
  await refreshApiKeys();
});
bindSimpleJsonForm('forgotPasswordForm', '/auth/forgot-password');
bindSimpleJsonForm('resendVerificationForm', '/auth/resend-verification');
bindSimpleJsonForm('eventForm', '/events/participation', refreshBids);

Promise.allSettled([
  refreshSession(),
  refreshProfile(),
  refreshBids(),
  refreshApiKeys(),
]).then((results) => {
  results.forEach((result) => {
    if (result.status === 'rejected') {
      console.error('Dashboard initialization task failed:', result.reason);
    }
  });
});
