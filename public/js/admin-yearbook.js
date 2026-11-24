import { getAdminCode, setAdminCode, showToast, escapeHtml } from './utils.js';

const $ = (id) => document.getElementById(id);
let adminCode = getAdminCode();

function cell(text) {
  const td = document.createElement('td');
  td.textContent = text ?? '';
  return td;
}

function actionButton(label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn btn-sm ${className}`;
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

async function adminRequest(path, options = {}) {
  const headers = {
    ...(options.body ? { 'content-type': 'application/json' } : {}),
    'X-Admin-Code': adminCode,
    ...(options.headers || {}),
  };
  const response = await fetch(path, { ...options, headers });
  if (response.status === 401 || response.status === 403) {
    showLogin();
    throw new Error('Admin access required.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function showLogin() {
  $('login-panel').style.display = 'block';
  $('admin-panel').style.display = 'none';
}

async function unlockAdmin() {
  const code = $('admin-code').value.trim();
  if (!code) {
    $('login-error').textContent = 'Enter the admin password.';
    return;
  }
  $('login-error').textContent = '';
  try {
    const response = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await response.json();
    if (!data.authorized) {
      $('login-error').textContent = 'That password is not correct.';
      return;
    }
    adminCode = code;
    setAdminCode(code, $('remember-admin').checked);
    $('login-panel').style.display = 'none';
    $('admin-panel').style.display = 'block';
    await loadAll();
  } catch (error) {
    $('login-error').textContent = error.message;
  }
}

async function loadSettings() {
  const data = await adminRequest('/api/yearbook/admin/settings');
  const settings = data.settings || {};
  $('class-label').value = settings.class_label || '';
  $('submission-deadline').value = settings.submission_deadline || '';
  document.querySelectorAll('[data-setting]').forEach((button) => {
    const active = settings[button.dataset.setting] === button.dataset.value;
    button.classList.toggle('btn-primary', active);
    button.classList.toggle('btn-secondary', !active);
  });
  const counts = {
    Profiles: document.querySelectorAll('#profiles-body tr').length,
    Requests: document.querySelectorAll('#requests-body tr').length,
    Yearbook: settings.yearbook_published === '1' ? 'Open' : 'Coming soon',
    Results: settings.results_published === '1' ? 'Published' : 'Private',
  };
  $('admin-summary').textContent = Object.entries(counts)
    .map(([key, value]) => `${key}: ${value}`)
    .join('   ·   ');
}

async function setSetting(key, value) {
  try {
    await adminRequest('/api/yearbook/admin/settings', {
      method: 'POST',
      body: JSON.stringify({ key, value }),
    });
    showToast('Setting saved.', 'success');
    await loadSettings();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function saveTextSettings() {
  try {
    for (const [key, id] of [
      ['class_label', 'class-label'],
      ['submission_deadline', 'submission-deadline'],
    ]) {
      await adminRequest('/api/yearbook/admin/settings', {
        method: 'POST',
        body: JSON.stringify({ key, value: $(id).value.trim() }),
      });
    }
    $('settings-error').textContent = '';
    showToast('Text settings saved.', 'success');
    await loadSettings();
  } catch (error) {
    $('settings-error').textContent = error.message;
  }
}

function openProfile(profile) {
  $('dialog-title').textContent = profile.display_name || profile.roster_name || 'Profile';
  const photo = profile.headshot_url
    ? `<img src="${escapeHtml(profile.headshot_url)}" alt="" style="width:180px;aspect-ratio:1;object-fit:cover;border-radius:12px;">`
    : '';
  $('dialog-content').innerHTML = `
    <div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;">
      ${photo}
      <pre style="flex:1;min-width:260px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:0.75rem;color:var(--text-secondary);">${escapeHtml(JSON.stringify(profile, null, 2))}</pre>
    </div>`;
  $('profile-dialog').showModal();
}

async function loadProfiles() {
  const data = await adminRequest('/api/yearbook/admin/profiles');
  const body = $('profiles-body');
  body.innerHTML = '';
  for (const profile of data.profiles || []) {
    const row = document.createElement('tr');
    row.append(
      cell(profile.roster_name),
      cell(profile.display_name),
      cell(profile.status),
      cell(profile.submitted_at || '—'),
      cell((profile.flags || []).join(', ') || '—')
    );

    const actions = document.createElement('td');
    actions.append(
      actionButton('View', 'btn-secondary', () => openProfile(profile)),
      actionButton('Approve', 'btn-primary', async () => {
        await adminRequest(`/api/yearbook/admin/profile/${encodeURIComponent(profile.id)}`, {
          method: 'POST',
          body: JSON.stringify({ action: 'approve' }),
        });
        showToast('Profile approved.', 'success');
        await loadProfiles();
      }),
      actionButton('Reject', 'btn-secondary', async () => {
        const reason = window.prompt('Reason for rejection?') || '';
        await adminRequest(`/api/yearbook/admin/profile/${encodeURIComponent(profile.id)}`, {
          method: 'POST',
          body: JSON.stringify({ action: 'reject', reason }),
        });
        showToast('Profile rejected.', 'success');
        await loadProfiles();
      }),
      actionButton('Delete', 'btn-secondary', async () => {
        if (!window.confirm(`Delete ${profile.display_name || profile.roster_name}?`)) return;
        await adminRequest(`/api/yearbook/admin/profile/${encodeURIComponent(profile.id)}`, {
          method: 'DELETE',
        });
        showToast('Profile deleted.', 'success');
        await loadProfiles();
      })
    );
    row.appendChild(actions);
    body.appendChild(row);
  }
  if (!(data.profiles || []).length) {
    const row = document.createElement('tr');
    const td = cell('No profiles submitted yet.');
    td.colSpan = 6;
    row.appendChild(td);
    body.appendChild(row);
  }
}

async function loadRequests() {
  const data = await adminRequest('/api/yearbook/admin/not-listed');
  const body = $('requests-body');
  body.innerHTML = '';
  for (const request of data.requests || []) {
    const row = document.createElement('tr');
    row.append(
      cell(request.name),
      cell(request.contact || '—'),
      cell(request.note || '—'),
      cell(request.status)
    );
    const actions = document.createElement('td');
    ['resolved', 'rejected'].forEach((status) => {
      actions.appendChild(
        actionButton(status === 'resolved' ? 'Resolve' : 'Reject', 'btn-secondary', async () => {
          await adminRequest(`/api/yearbook/admin/not-listed/${encodeURIComponent(request.id)}`, {
            method: 'POST',
            body: JSON.stringify({ status }),
          });
          await loadRequests();
        })
      );
    });
    row.appendChild(actions);
    body.appendChild(row);
  }
  if (!(data.requests || []).length) {
    const row = document.createElement('tr');
    const td = cell('No requests.');
    td.colSpan = 5;
    row.appendChild(td);
    body.appendChild(row);
  }
}

async function loadResults() {
  const data = await adminRequest('/api/yearbook/admin/results');
  const categories = (data.results || []).map((category) => {
    const nominees = category.nominees || [];
    const lines = nominees.length
      ? nominees.map((nominee) => `${escapeHtml(nominee.name)} — ${nominee.votes}`).join('<br>')
      : '<span class="text-secondary">No votes yet</span>';
    return `<div class="yb-panel"><h3>${escapeHtml(category.label)}</h3><p style="font-size:0.8rem;line-height:1.7;">${lines}</p></div>`;
  });
  const suggestions = (data.suggestions || [])
    .map((item) => `${escapeHtml(item.name)}: ${escapeHtml(item.suggestion)}`)
    .join('<br>');
  $('results-body').innerHTML = `
    ${categories.join('')}
    <div class="yb-panel">
      <h3>Award ideas</h3>
      <p style="font-size:0.8rem;line-height:1.7;">${suggestions || '<span class="text-secondary">None yet</span>'}</p>
    </div>`;
}

async function exportData() {
  try {
    const headers = { 'X-Admin-Code': adminCode };
    const response = await fetch('/api/yearbook/admin/export', { headers });
    if (!response.ok) throw new Error('Could not export data.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'u19ce-yearbook-export.json';
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadAll() {
  await Promise.allSettled([loadProfiles(), loadRequests(), loadResults()]);
  await loadSettings();
}

function setupEvents() {
  $('unlock-btn').addEventListener('click', unlockAdmin);
  $('admin-code').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') unlockAdmin();
  });
  $('dialog-close').addEventListener('click', () => $('profile-dialog').close());

  $('settings-actions').addEventListener('click', (event) => {
    const button = event.target.closest('[data-setting]');
    if (button) setSetting(button.dataset.setting, button.dataset.value);
  });
  $('save-settings-btn').addEventListener('click', saveTextSettings);
  $('export-btn').addEventListener('click', exportData);
  $('refresh-profiles').addEventListener('click', () => loadProfiles().catch((error) => showToast(error.message, 'error')));
  $('refresh-requests').addEventListener('click', () => loadRequests().catch((error) => showToast(error.message, 'error')));
  $('refresh-results').addEventListener('click', () => loadResults().catch((error) => showToast(error.message, 'error')));
}

async function init() {
  setupEvents();
  if (!adminCode) {
    showLogin();
    return;
  }
  try {
    const response = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: adminCode }),
    });
    const data = await response.json();
    if (!data.authorized) {
      showLogin();
      return;
    }
    $('login-panel').style.display = 'none';
    $('admin-panel').style.display = 'block';
    await loadAll();
  } catch {
    showLogin();
  }
}

init();
