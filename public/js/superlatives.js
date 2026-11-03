import { showToast, escapeHtml } from './utils.js';

const TOKEN_KEY = 'u19ce-superlatives-identity';

const state = {
  config: null,
  roster: [],
  categories: [],
  nominees: [],
  resultsPublished: false,
  identityToken: '',
  submitting: false,
};

const $ = (id) => document.getElementById(id);

function request(path, options = {}) {
  return fetch(path, options).then(async (response) => {
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      const error = new Error(data?.error || `Request failed (${response.status})`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  });
}

function populateRoster() {
  const select = $('roster-select');
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select your name';
  select.appendChild(placeholder);
  for (const person of state.roster) {
    const option = document.createElement('option');
    option.value = person.id;
    option.textContent = person.name;
    option.dataset.search = person.name.toLowerCase();
    select.appendChild(option);
  }
}

function filterRoster(query) {
  const select = $('roster-select');
  const normalized = query.trim().toLowerCase();
  for (const option of select.options) {
    if (!option.value) continue;
    option.hidden = Boolean(normalized) && !option.dataset.search.includes(normalized);
  }
}

function renderBallot() {
  const grid = $('superlative-grid');
  grid.innerHTML = '';
  for (const category of state.categories) {
    const card = document.createElement('div');
    card.className = 'superlative-card';
    const title = document.createElement('h3');
    title.textContent = category;
    card.appendChild(title);

    const select = document.createElement('select');
    select.dataset.category = category;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a classmate';
    select.appendChild(placeholder);

    for (const nominee of state.nominees) {
      const option = document.createElement('option');
      option.value = nominee.id;
      option.textContent = nominee.display_name;
      select.appendChild(option);
    }
    card.appendChild(select);
    grid.appendChild(card);
  }
}

function renderResults(data) {
  const panel = $('results-panel');
  const grid = $('results-grid');
  if (!data?.published || !Array.isArray(data.results) || !data.results.length) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  grid.innerHTML = '';
  for (const result of data.results) {
    if (!result.nominees?.length) continue;
    const card = document.createElement('div');
    card.className = 'superlative-card';
    const title = document.createElement('h3');
    title.textContent = result.category;
    card.appendChild(title);
    const rows = document.createElement('div');
    rows.className = 'superlative-results';
    for (const nominee of result.nominees.slice(0, 3)) {
      const row = document.createElement('div');
      row.className = 'superlative-result-row';
      const name = document.createElement('span');
      name.textContent = nominee.display_name;
      const votes = document.createElement('span');
      votes.textContent = `${nominee.votes} ${nominee.votes === 1 ? 'vote' : 'votes'}`;
      votes.style.color = 'var(--text-secondary)';
      row.appendChild(name);
      row.appendChild(votes);
      rows.appendChild(row);
    }
    card.appendChild(rows);
    grid.appendChild(card);
  }
}

async function loadResults() {
  try {
    const data = await request('/api/yearbook/superlatives/results');
    renderResults(data);
  } catch {
    // Results are optional.
  }
}

function showBallot() {
  $('identity-panel').style.display = 'none';
  $('ballot-panel').style.display = 'block';
}

async function verifyIdentity() {
  const rosterId = $('roster-select').value;
  const regNumber = $('reg-number').value.trim();
  $('identity-error').textContent = '';
  document.querySelectorAll('[data-field]').forEach((field) => field.classList.remove('invalid'));
  document.querySelectorAll('[data-error]').forEach((element) => { element.textContent = ''; });

  if (!rosterId) {
    $('identity-error').textContent = 'Select your name.';
    return;
  }
  if (!regNumber) {
    $('identity-error').textContent = 'Enter your registration number.';
    return;
  }

  const button = $('verify-btn');
  button.disabled = true;
  button.textContent = 'Verifying...';
  try {
    const data = await request('/api/yearbook/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        roster_id: rosterId,
        reg_number: regNumber,
      }),
    });
    state.identityToken = data.token;
    try {
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify({
        token: data.token,
        name: data.name,
        exp: Date.now() + 90 * 60 * 1000,
      }));
    } catch {
      // Session storage may be unavailable.
    }
    showBallot();
    showToast(`Welcome, ${data.name.split(',')[0]}.`, 'success');
  } catch (error) {
    $('identity-error').textContent = error.data?.error || error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Verify and open ballot';
  }
}

async function submitBallot() {
  if (state.submitting) return;
  $('ballot-error').textContent = '';

  const ballot = {};
  let selected = 0;
  document.querySelectorAll('#superlative-grid select').forEach((select) => {
    if (select.value) {
      ballot[select.dataset.category] = select.value;
      selected++;
    }
  });

  if (selected === 0) {
    $('ballot-error').textContent = 'Pick at least one category.';
    return;
  }

  const button = $('submit-ballot-btn');
  state.submitting = true;
  button.disabled = true;
  button.textContent = 'Saving...';

  try {
    const data = await request('/api/yearbook/superlatives/vote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identity_token: state.identityToken,
        ballot,
        suggestion: $('award-suggestion').value.trim(),
      }),
    });
    showToast(`Ballot saved (${data.saved} ${data.saved === 1 ? 'choice' : 'choices'}).`, 'success');
    if (state.resultsPublished) loadResults();
  } catch (error) {
    $('ballot-error').textContent = error.data?.error || error.message;
  } finally {
    state.submitting = false;
    button.disabled = false;
    button.textContent = 'Save my ballot';
  }
}

async function init() {
  try {
    const [config, superlatives, roster] = await Promise.all([
      request('/api/yearbook/config'),
      request('/api/yearbook/superlatives'),
      request('/api/yearbook/roster'),
    ]);
    state.config = config;
    state.categories = superlatives.categories || [];
    state.nominees = superlatives.nominees || [];
    state.resultsPublished = Boolean(superlatives.results_published);
    state.roster = roster.roster || [];

    const status = $('superlatives-status');
    if (!superlatives.enabled) {
      status.textContent = 'Superlatives are not open yet. Check back soon.';
      status.style.display = 'block';
      return;
    }
    status.style.display = 'none';

    populateRoster();
    renderBallot();

    let stored = null;
    try {
      stored = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
    } catch {
      stored = null;
    }
    if (stored?.token && stored.exp > Date.now()) {
      state.identityToken = stored.token;
      showBallot();
    } else {
      $('identity-panel').style.display = 'block';
    }

    if (state.resultsPublished) loadResults();

    $('roster-search').addEventListener('input', (event) => filterRoster(event.target.value));
    $('verify-btn').addEventListener('click', verifyIdentity);
    $('submit-ballot-btn').addEventListener('click', submitBallot);
  } catch (error) {
    $('superlatives-status').textContent = 'Could not load superlatives. Refresh and try again.';
    console.error(error);
  }
}

init();
