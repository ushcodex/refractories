import { showToast, escapeHtml } from './utils.js';
import { compressImage } from './compression.js';

const DRAFT_KEY = 'u19ce-yearbook-draft-v1';
const IDENTITY_KEY = 'u19ce-yearbook-identity-v1';

const state = {
  config: null,
  roster: [],
  courses: [],
  lecturers: [],
  identityToken: '',
  rosterId: '',
  rosterName: '',
  selectedRoster: null,
  activeRosterIndex: -1,
  step: 0,
  files: { headshot: null },
  objectUrls: { headshot: '' },
  crop: null,
  draftTimer: null,
  locked: false,
  submitting: false,
  submittingBallot: false,
  submittedProfile: null,
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

function setStep(step) {
  state.step = step;
  document.querySelectorAll('.yb-step').forEach((element) => {
    element.classList.toggle('active', Number(element.dataset.step) === step);
  });
  document.querySelectorAll('#progress span').forEach((span, index) => {
    span.classList.toggle('active', index <= step);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearFieldErrors() {
  document.querySelectorAll('.yb-field.invalid').forEach((field) => field.classList.remove('invalid'));
  document.querySelectorAll('[data-error]').forEach((element) => {
    element.textContent = '';
  });
  $('identity-error').textContent = '';
  $('submit-error').textContent = '';
  $('review-error').textContent = '';
  $('ballot-error').textContent = '';
}

function setFieldError(name, message) {
  const wrapper = document.querySelector(`[data-field="${name}"]`);
  if (wrapper) wrapper.classList.add('invalid');
  const error = document.querySelector(`[data-error="${name}"]`);
  if (error) error.textContent = message || 'Required';
}

function clearFieldError(name) {
  const wrapper = document.querySelector(`[data-field="${name}"]`);
  if (wrapper) wrapper.classList.remove('invalid');
  const error = document.querySelector(`[data-error="${name}"]`);
  if (error) error.textContent = '';
}

function showGlobalError(id, message) {
  const element = $(id);
  if (element) element.textContent = message;
}

function setDeadline() {
  const element = $('deadline-line');
  if (!state.config?.submission_deadline) {
    element.textContent = '';
    return;
  }
  const date = new Date(state.config.submission_deadline);
  if (Number.isNaN(date.getTime())) {
    element.textContent = `Submissions close ${state.config.submission_deadline}`;
    return;
  }
  const formatted = date.toLocaleString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
    timeZoneName: 'short',
  });
  element.textContent = `Submissions close ${formatted}.`;
}

function populateSelect(select, items, placeholder, labelKey = 'name', valueKey = 'id') {
  select.innerHTML = '';
  if (placeholder !== null) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = placeholder;
    select.appendChild(option);
  }
  for (const item of items) {
    const option = document.createElement('option');
    option.value = item[valueKey];
    option.textContent = item[labelKey];
    select.appendChild(option);
  }
}

function normalizeRosterSearch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function rosterMatches(query) {
  const normalized = normalizeRosterSearch(query);
  const matches = normalized
    ? state.roster.filter((person) => normalizeRosterSearch(person.name).includes(normalized))
    : state.roster;
  return matches.slice(0, 200);
}

function renderRosterOptions(items) {
  const list = $('roster-options');
  list.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'yb-combobox-empty';
    empty.textContent = "No name matches. Check the spelling, or use 'I'm not on the list' below.";
    list.appendChild(empty);
    return;
  }

  for (const person of items) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'yb-combobox-option';
    option.id = `roster-option-${person.id}`;
    option.dataset.id = person.id;
    option.tabIndex = -1;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');
    option.textContent = person.name;
    option.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      selectRoster(person);
    });
    option.addEventListener('click', () => selectRoster(person));
    list.appendChild(option);
  }
}

function openRosterList(query = '') {
  const list = $('roster-options');
  const input = $('roster-search');
  renderRosterOptions(rosterMatches(query));
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  state.activeRosterIndex = -1;
  input.removeAttribute('aria-activedescendant');
}

function closeRosterList() {
  const list = $('roster-options');
  const input = $('roster-search');
  if (!list || !input) return;
  list.hidden = true;
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
  state.activeRosterIndex = -1;
}

function selectRoster(person) {
  if (!person) return;
  state.selectedRoster = person;
  $('roster-search').value = person.name;
  $('roster-select').value = person.id;
  closeRosterList();
  clearFieldError('roster_id');
}

function updateActiveRosterOption(index) {
  const list = $('roster-options');
  const input = $('roster-search');
  const options = [...list.querySelectorAll('.yb-combobox-option')];
  if (!options.length) return;
  const next = Math.max(0, Math.min(index, options.length - 1));
  state.activeRosterIndex = next;
  options.forEach((option, optionIndex) => {
    option.classList.toggle('active', optionIndex === next);
    option.setAttribute('aria-selected', optionIndex === next ? 'true' : 'false');
  });
  input.setAttribute('aria-activedescendant', options[next].id);
  options[next].scrollIntoView({ block: 'nearest' });
}

function populateRoster() {
  state.selectedRoster = null;
  $('roster-select').value = '';
}

function populateCourses() {
  const favourites = $('favourite-course');
  const toughest = $('toughest-course');
  favourites.innerHTML = '';
  toughest.innerHTML = '';
  const placeholderF = document.createElement('option');
  placeholderF.value = '';
  placeholderF.textContent = 'Choose a course';
  favourites.appendChild(placeholderF);
  const placeholderT = document.createElement('option');
  placeholderT.value = '';
  placeholderT.textContent = 'Choose a course';
  toughest.appendChild(placeholderT);

  const groups = new Map();
  for (const course of state.courses) {
    const key = `${course.year_level}-${course.semester}`;
    if (!groups.has(key)) {
      groups.set(key, {
        label: `Year ${course.year_level} — ${course.semester} Semester`,
        courses: [],
      });
    }
    groups.get(key).courses.push(course);
  }

  for (const group of groups.values()) {
    const optgroupF = document.createElement('optgroup');
    optgroupF.label = group.label;
    const optgroupT = document.createElement('optgroup');
    optgroupT.label = group.label;
    for (const course of group.courses) {
      const optionF = document.createElement('option');
      optionF.value = course.code;
      optionF.textContent = `${course.code} — ${course.title}`;
      optgroupF.appendChild(optionF);
      const optionT = document.createElement('option');
      optionT.value = course.code;
      optionT.textContent = `${course.code} — ${course.title}`;
      optgroupT.appendChild(optionT);
    }
    favourites.appendChild(optgroupF);
    toughest.appendChild(optgroupT);
  }
}

function populateLecturers() {
  populateSelect($('favourite-lecturer'), state.lecturers, 'Choose a lecturer', 'name', 'name');
  populateSelect($('most-teaching-lecturer'), state.lecturers, 'None', 'name', 'name');
}

function populateStaticSelects() {
  const day = $('birth-day');
  day.innerHTML = '';
  const dayPlaceholder = document.createElement('option');
  dayPlaceholder.value = '';
  dayPlaceholder.textContent = 'Day';
  day.appendChild(dayPlaceholder);
  for (let i = 1; i <= 31; i++) {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = String(i);
    day.appendChild(option);
  }

  const month = $('birth-month');
  month.innerHTML = '';
  const monthPlaceholder = document.createElement('option');
  monthPlaceholder.value = '';
  monthPlaceholder.textContent = 'Month';
  month.appendChild(monthPlaceholder);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  months.forEach((name, index) => {
    const option = document.createElement('option');
    option.value = String(index + 1);
    option.textContent = name;
    month.appendChild(option);
  });

  populateSelect(
    $('state-of-origin'),
    (state.config?.states || []).map((name) => ({ name })),
    'Choose a state',
    'name',
    'name'
  );

  populateSelect(
    $('hardest-level'),
    (state.config?.hardest_levels || []).map((name) => ({ name })),
    'Choose a level',
    'name',
    'name'
  );
}

function collectMetadata() {
  return {
    nickname: $('nickname').value.trim(),
    birth_day: $('birth-day').value,
    birth_month: $('birth-month').value,
    state_of_origin: $('state-of-origin').value,
    hometown: $('hometown').value.trim(),
    whatsapp: $('whatsapp').value.trim(),
    include_phone: $('include-phone').checked,
    show_birthday: $('show-birthday').checked,
    hobby: $('hobby').value.trim(),
    side_skill: $('side-skill').value.trim(),
    instagram: $('instagram').value.trim(),
    x_handle: $('x-handle').value.trim(),
    linkedin: $('linkedin').value.trim(),
    tiktok: $('tiktok').value.trim(),
    facebook: $('facebook').value.trim(),
    website: $('website').value.trim(),
    favourite_course: $('favourite-course').value,
    toughest_course: $('toughest-course').value,
    hardest_level: $('hardest-level').value,
    favourite_lecturer: $('favourite-lecturer').value,
    most_teaching_lecturer: $('most-teaching-lecturer').value,
    memorable_moment: $('memorable-moment').value.trim(),
    class_word: $('class-word').value.trim(),
    motto: $('motto').value.trim(),
    class_message: $('class-message').value.trim(),
    relationship_status: $('relationship-status').value,
    consent_accurate: $('consent-accurate').checked,
    show_in_yearbook: $('show-in-yearbook').checked,
  };
}

function legacySocialValue(data, platform) {
  return data.social_platform === platform ? data.social_handle || '' : '';
}

function applyMetadata(data) {
  $('nickname').value = data.nickname || '';
  $('birth-day').value = data.birth_day ? String(data.birth_day) : '';
  $('birth-month').value = data.birth_month ? String(data.birth_month) : '';
  $('state-of-origin').value = data.state_of_origin || '';
  $('hometown').value = data.hometown || '';
  $('whatsapp').value = data.whatsapp || '';
  $('include-phone').checked = data.include_phone === undefined ? true : Boolean(data.include_phone);
  $('show-birthday').checked = data.show_birthday === undefined ? true : Boolean(data.show_birthday);
  const hobbies = Array.isArray(data.hobbies) ? data.hobbies : [];
  $('hobby').value = data.hobby || hobbies[0] || '';
  $('side-skill').value = data.side_skill || data.outside_line || '';
  $('instagram').value = data.instagram || legacySocialValue(data, 'Instagram');
  $('x-handle').value = data.x_handle || legacySocialValue(data, 'X');
  $('linkedin').value = data.linkedin || legacySocialValue(data, 'LinkedIn');
  $('tiktok').value = data.tiktok || legacySocialValue(data, 'TikTok');
  $('facebook').value = data.facebook || legacySocialValue(data, 'Facebook');
  $('website').value =
    data.website ||
    (data.social_platform === 'Other' && /^https?:\/\//i.test(data.social_handle || '')
      ? data.social_handle
      : '');
  $('favourite-course').value = data.favourite_course || '';
  $('toughest-course').value = data.toughest_course || '';
  $('hardest-level').value = data.hardest_level || '';
  $('favourite-lecturer').value = data.favourite_lecturer || '';
  $('most-teaching-lecturer').value = data.most_teaching_lecturer || '';
  $('memorable-moment').value = data.memorable_moment || '';
  $('class-word').value = data.class_word || '';
  $('motto').value = data.motto || '';
  $('class-message').value = data.class_message || '';
  $('relationship-status').value = data.relationship_status || '';
  $('consent-accurate').checked = Boolean(data.consent_accurate);
  $('show-in-yearbook').checked = data.show_in_yearbook !== false;
}

function saveDraft() {
  if (state.submittedProfile || state.locked) return;
  clearTimeout(state.draftTimer);
  state.draftTimer = setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(collectMetadata()));
      $('draft-status').textContent = 'Draft saved on this device.';
    } catch {
      // Storage can be unavailable in private browsing.
    }
  }, 400);
}

function restoreDraft() {
  if (state.submittedProfile) return;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    applyMetadata(data);
    $('draft-status').textContent = 'Draft restored from this device.';
  } catch {
    // Ignore malformed drafts.
  }
}

function validateStep(step) {
  clearFieldErrors();
  let ok = true;

  if (step === 1) {
    if (!$('nickname').value.trim()) {
      setFieldError('nickname', 'Add a nickname.');
      ok = false;
    }
    if (!$('birth-day').value) {
      setFieldError('birth_day', 'Choose your birth day.');
      ok = false;
    }
    if (!$('birth-month').value) {
      setFieldError('birth_month', 'Choose your birth month.');
      ok = false;
    }
    if (!$('state-of-origin').value) {
      setFieldError('state_of_origin', 'Choose your state of origin.');
      ok = false;
    }
  }

  if (step === 2) {
    if (!$('hobby').value.trim()) {
      setFieldError('hobby', 'Add one hobby.');
      ok = false;
    }
    if (!$('side-skill').value.trim()) {
      setFieldError('side_skill', 'Add one side skill or hustle.');
      ok = false;
    }
  }

  if (step === 3) {
    if (!$('favourite-course').value) {
      setFieldError('favourite_course', 'Choose your favourite course.');
      ok = false;
    }
    if (!$('toughest-course').value) {
      setFieldError('toughest_course', 'Choose your toughest course.');
      ok = false;
    }
    if (!$('hardest-level').value) {
      setFieldError('hardest_level', 'Choose the hardest level.');
      ok = false;
    }
    if (!$('favourite-lecturer').value) {
      setFieldError('favourite_lecturer', 'Choose a lecturer.');
      ok = false;
    }
    if (!$('class-word').value.trim()) {
      setFieldError('class_word', 'Add one word for the class.');
      ok = false;
    }
    if (!$('motto').value.trim()) {
      setFieldError('motto', 'Add your motto.');
      ok = false;
    }
  }

  if (step === 4) {
    if (!$('consent-accurate').checked) {
      setFieldError('consent_accurate', 'Please confirm before submitting.');
      ok = false;
    }
    if (!state.files.headshot) {
      showGlobalError('submit-error', 'Add a professional headshot.');
      ok = false;
    }
  }

  return ok;
}

async function verifyIdentity() {
  clearFieldErrors();
  let rosterId = $('roster-select').value;
  const typedName = $('roster-search').value.trim();
  const regNumber = $('reg-number').value.trim();

  if (!rosterId && typedName) {
    const exact = state.roster.find(
      (person) => normalizeRosterSearch(person.name) === normalizeRosterSearch(typedName)
    );
    if (exact) {
      selectRoster(exact);
      rosterId = exact.id;
    }
  }

  if (!rosterId) {
    setFieldError('roster_id', 'Pick your name from the list.');
    return;
  }
  if (!regNumber) {
    setFieldError('reg_number', 'Enter your registration number.');
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
    state.rosterId = rosterId;
    state.rosterName = data.name;
    try {
      sessionStorage.setItem(
        IDENTITY_KEY,
        JSON.stringify({
          token: data.token,
          roster_id: rosterId,
          name: data.name,
          exp: Date.now() + 25 * 60 * 1000,
        })
      );
    } catch {
      // Session storage can be unavailable; the in-memory token still works.
    }
    showToast(`Welcome, ${data.name}.`, 'success');
    setStep(1);
  } catch (error) {
    showGlobalError('identity-error', error.data?.error || error.message);
    button.textContent = 'Verify and continue';
  } finally {
    button.disabled = false;
    button.textContent = 'Verify and continue';
  }
}

async function submitProfile() {
  if (state.submitting || state.submittedProfile) return;

  for (const step of [1, 2, 3, 4]) {
    if (!validateStep(step)) {
      setStep(step);
      return;
    }
  }

  const button = $('submit-profile-btn');
  state.submitting = true;
  button.disabled = true;
  button.textContent = 'Submitting...';
  showGlobalError('review-error', '');

  try {
    const formData = new FormData();
    formData.append('metadata', JSON.stringify(collectMetadata()));
    formData.append('identity_token', state.identityToken);
    formData.append('headshot', state.files.headshot, 'headshot.jpg');

    const data = await request('/api/yearbook/profile', {
      method: 'POST',
      body: formData,
    });

    localStorage.removeItem(DRAFT_KEY);
    $('draft-status').textContent = '';
    state.submittedProfile = {
      ...collectMetadata(),
      display_name: data.roster_name || state.rosterName,
      portrait_url: state.objectUrls.headshot,
    };
    renderProfilePreview('submitted-preview', state.submittedProfile, state.objectUrls.headshot);
    setStep(6);
    showToast('Profile submitted. Now fill your superlatives.', 'success');
  } catch (error) {
    if (error.data?.fields) {
      for (const [field, message] of Object.entries(error.data.fields)) {
        setFieldError(field, message);
      }
      showGlobalError('review-error', 'Please check the highlighted fields.');
    } else {
      showGlobalError('review-error', error.data?.error || error.message);
    }
  } finally {
    state.submitting = false;
    button.disabled = false;
    button.textContent = 'Submit profile & continue';
  }
}
async function sendNotListed() {
  const name = $('not-listed-name').value.trim();
  if (!name) {
    showGlobalError('not-listed-error', 'Enter your name.');
    return;
  }

  const button = $('not-listed-submit');
  button.disabled = true;
  button.textContent = 'Sending...';
  try {
    await request('/api/yearbook/not-listed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        note: $('not-listed-note').value.trim(),
        contact: $('not-listed-contact').value.trim(),
      }),
    });
    $('not-listed-box').style.display = 'none';
    $('not-listed-toggle').style.display = 'none';
    showToast('Request sent. The admin will review it.', 'success');
  } catch (error) {
    showGlobalError('not-listed-error', error.data?.error || error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Send request';
  }
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function setHeadshotPreview(url) {
  const preview = $('headshot-preview');
  const placeholder = $('headshot-placeholder');
  if (url) {
    preview.src = url;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    preview.removeAttribute('src');
    preview.style.display = 'none';
    placeholder.style.display = 'grid';
  }
}

function safe(value) {
  return escapeHtml(String(value ?? '').trim());
}

function summaryRow(label, value) {
  if (!value && value !== 0) return '';
  return `<div class="yb-review-row"><dt>${safe(label)}</dt><dd>${safe(value)}</dd></div>`;
}

function summaryBlock(title, rows) {
  const content = rows.filter(Boolean).join('');
  if (!content) return '';
  return `<section><h4>${safe(title)}</h4><dl class="yb-review-list">${content}</dl></section>`;
}

function courseTitle(code) {
  if (!code) return '';
  return state.courses.find((course) => course.code === code)?.title || code;
}

function socialValues(data) {
  const socials = data.socials || {};
  return {
    instagram: socials.instagram || data.instagram || '',
    x_handle: socials.x_handle || data.x_handle || '',
    linkedin: socials.linkedin || data.linkedin || '',
    tiktok: socials.tiktok || data.tiktok || '',
    facebook: socials.facebook || data.facebook || '',
    website: socials.website || data.website || '',
  };
}

function socialSummary(data) {
  const values = socialValues(data);
  const parts = [];
  const add = (label, value) => {
    if (value) parts.push(`${label}: ${String(value).replace(/^@/, '')}`);
  };
  add('Instagram', values.instagram);
  add('X', values.x_handle);
  add('LinkedIn', values.linkedin);
  add('TikTok', values.tiktok);
  add('Facebook', values.facebook);
  add('Website', values.website);
  return parts.join(' · ');
}

function renderProfilePreview(targetId, data, photoUrl) {
  const target = $(targetId);
  if (!target) return;

  const displayName = data.display_name || state.rosterName || 'Your profile';
  const photo = photoUrl || data.portrait_url || data.headshot_url || '';
  const birthdayHidden =
    data.show_birthday === false || data.show_birthday === 0 || data.show_birthday === '0';
  const birthday = birthdayHidden
    ? ''
    : [MONTHS[Number(data.birth_month) - 1] || '', data.birth_day].filter(Boolean).join(' ');
  const phone = data.whatsapp && data.include_phone !== false ? data.whatsapp : '';
  const classes = data.classes || {};

  const blocks = [
    summaryBlock(
      'About you',
      [
        summaryRow('Nickname', data.nickname),
        summaryRow('Birthday', birthday),
        summaryRow('State of origin', data.state_of_origin),
        summaryRow('Hometown', data.hometown),
        summaryRow('Relationship status', data.relationship_status),
        summaryRow('Phone (private)', phone),
      ]
    ),
    summaryBlock(
      'Around campus',
      [
        summaryRow('Hobby', data.hobby),
        summaryRow('Side skill / hustle', data.side_skill),
        summaryRow('Favourite course', courseTitle(data.favourite_course)),
        summaryRow('Toughest course', courseTitle(data.toughest_course)),
        summaryRow('Hardest level', data.hardest_level),
        summaryRow('Favourite lecturer', data.favourite_lecturer),
        summaryRow('Most teaching', data.most_teaching_lecturer),
      ]
    ),
    summaryBlock(
      'Your words',
      [
        summaryRow('Class word', data.class_word),
        summaryRow('Motto', data.motto),
        summaryRow('Memorable moment', data.memorable_moment || classes.memorable_moment),
        summaryRow('Message to the class', data.class_message),
      ]
    ),
    summaryBlock('Online', [summaryRow('Socials', socialSummary(data))]),
  ].filter(Boolean);

  target.innerHTML = `
    <div class="yb-review-card">
      <div class="yb-review-photo">
        ${photo ? `<img src="${safe(photo)}" alt="Professional headshot of ${safe(displayName)}">` : '<div class="yb-review-photo-empty">No headshot</div>'}
        <span>Professional headshot</span>
      </div>
      <div class="yb-review-body">
        <h3>${safe(displayName)}</h3>
        ${data.nickname ? `<p class="yb-review-nickname">“${safe(data.nickname)}”</p>` : ''}
        <div class="yb-review-columns">${blocks.join('')}</div>
      </div>
    </div>
  `;
}

function openCrop(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please choose an image file.', 'warning');
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast('That image is too large. Choose one under 20 MB.', 'warning');
    return;
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    const size = 480;
    state.crop = {
      image,
      url,
      size,
      baseScale: Math.max(size / image.width, size / image.height),
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      dragging: false,
      startX: 0,
      startY: 0,
    };
    $('crop-zoom').value = '1';
    drawCrop();
    $('crop-dialog').showModal();
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    showToast('This image could not be opened. Try a JPEG or PNG.', 'error');
  };
  image.src = url;
}

function drawCrop() {
  const crop = state.crop;
  const canvas = $('crop-canvas');
  if (!crop || !canvas) return;
  const context = canvas.getContext('2d');
  const size = crop.size;
  const scale = crop.baseScale * crop.scale;
  const width = crop.image.width * scale;
  const height = crop.image.height * scale;
  const maxX = Math.max(0, (width - size) / 2);
  const maxY = Math.max(0, (height - size) / 2);
  crop.offsetX = Math.max(-maxX, Math.min(maxX, crop.offsetX));
  crop.offsetY = Math.max(-maxY, Math.min(maxY, crop.offsetY));

  context.clearRect(0, 0, size, size);
  context.fillStyle = '#07070c';
  context.fillRect(0, 0, size, size);
  context.drawImage(
    crop.image,
    (size - width) / 2 + crop.offsetX,
    (size - height) / 2 + crop.offsetY,
    width,
    height
  );
}

function setCropZoom(value) {
  const crop = state.crop;
  if (!crop) return;
  crop.scale = Math.max(1, Math.min(3, value));
  $('crop-zoom').value = String(crop.scale);
  drawCrop();
}

function closeCrop() {
  const dialog = $('crop-dialog');
  if (dialog?.open) dialog.close();
  if (state.crop) URL.revokeObjectURL(state.crop.url);
  state.crop = null;
}

function confirmCrop() {
  const crop = state.crop;
  if (!crop) return;
  const outputSize = 800;
  const scale = (crop.baseScale * crop.scale * outputSize) / crop.size;
  const width = crop.image.width * scale;
  const height = crop.image.height * scale;
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext('2d');
  context.fillStyle = '#07070c';
  context.fillRect(0, 0, outputSize, outputSize);
  context.drawImage(
    crop.image,
    (outputSize - width) / 2 + (crop.offsetX * outputSize) / crop.size,
    (outputSize - height) / 2 + (crop.offsetY * outputSize) / crop.size,
    width,
    height
  );

  canvas.toBlob(
    (blob) => {
      if (!blob) {
        showToast('Could not save the crop. Try another photo.', 'error');
        return;
      }
      state.files.headshot = blob;
      if (state.objectUrls.headshot) URL.revokeObjectURL(state.objectUrls.headshot);
      state.objectUrls.headshot = URL.createObjectURL(blob);
      setHeadshotPreview(state.objectUrls.headshot);
      closeCrop();
      clearFieldError('headshot');
      showGlobalError('submit-error', '');
      showToast('Headshot ready.', 'success');
    },
    'image/jpeg',
    0.9
  );
}

function renderBallot() {
  const container = $('ballot-form');
  if (!container) return;
  container.innerHTML = '';
  const categories = state.config?.superlatives || [];
  if (!categories.length) {
    container.textContent = 'Superlatives are not available right now.';
    return;
  }

  for (const category of categories) {
    const field = document.createElement('div');
    field.className = 'yb-field';
    field.dataset.field = category.key;

    const label = document.createElement('label');
    label.htmlFor = `ballot-${category.key}`;
    label.textContent = category.label;

    const select = document.createElement('select');
    select.id = `ballot-${category.key}`;
    select.dataset.ballotCategory = category.key;

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a classmate';
    select.appendChild(placeholder);

    for (const person of state.roster) {
      if (person.id === state.rosterId) continue;
      const option = document.createElement('option');
      option.value = person.id;
      option.textContent = person.name;
      select.appendChild(option);
    }

    const error = document.createElement('p');
    error.className = 'error';
    error.dataset.error = category.key;

    field.append(label, select, error);
    container.appendChild(field);
  }
}

async function submitBallot() {
  if (state.submittingBallot) return;
  const categories = state.config?.superlatives || [];
  const ballot = {};
  let missing = 0;

  clearFieldErrors();
  for (const category of categories) {
    const select = $(`ballot-${category.key}`);
    const value = select?.value || '';
    if (!value) {
      missing += 1;
      setFieldError(category.key, 'Choose someone.');
      continue;
    }
    ballot[category.key] = value;
  }
  if (missing) {
    showGlobalError('ballot-error', `Choose someone for ${missing} categories.`);
    return;
  }

  const button = $('submit-ballot-btn');
  state.submittingBallot = true;
  button.disabled = true;
  button.textContent = 'Submitting...';
  showGlobalError('ballot-error', '');

  try {
    await request('/api/yearbook/superlatives/vote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identity_token: state.identityToken,
        ballot,
        suggestion: $('award-idea').value.trim(),
      }),
    });
    button.textContent = 'Ballot submitted';
    showToast('Ballot recorded. Results will be published with the yearbook.', 'success');
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Submit my ballot';
    if (error.data?.fields) {
      for (const [field, message] of Object.entries(error.data.fields)) {
        setFieldError(field, message);
      }
    }
    showGlobalError('ballot-error', error.data?.error || error.message);
  } finally {
    state.submittingBallot = false;
  }
}

function readStoredIdentity() {
  try {
    const raw = sessionStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.token || !data.exp || data.exp < Date.now()) {
      sessionStorage.removeItem(IDENTITY_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

async function loadSubmittedState(identity) {
  state.identityToken = identity.token;
  state.rosterId = identity.roster_id || '';
  state.rosterName = identity.name || '';
  try {
    const data = await request('/api/yearbook/me', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: identity.token }),
    });
    if (!data.profile) return false;
    state.submittedProfile = {
      ...data.profile,
      display_name: data.roster_name || state.rosterName,
      include_phone: data.profile.include_phone,
    };
    renderProfilePreview('submitted-preview', state.submittedProfile, state.submittedProfile.portrait_url);
    if (data.ballot_submitted) {
      $('continue-ballot-btn').disabled = true;
      $('continue-ballot-btn').textContent = 'Ballot already submitted';
    }
    return true;
  } catch {
    sessionStorage.removeItem(IDENTITY_KEY);
    state.identityToken = '';
    return false;
  }
}
function setupEvents() {
  const rosterSearch = $('roster-search');
  rosterSearch.addEventListener('focus', () => openRosterList(rosterSearch.value));
  rosterSearch.addEventListener('input', (event) => {
    const value = event.target.value;
    if (state.selectedRoster && value !== state.selectedRoster.name) {
      state.selectedRoster = null;
      $('roster-select').value = '';
    }
    openRosterList(value);
  });
  rosterSearch.addEventListener('keydown', (event) => {
    const list = $('roster-options');
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (list.hidden) openRosterList(rosterSearch.value);
      const options = [...list.querySelectorAll('.yb-combobox-option')];
      if (!options.length) return;
      const next =
        state.activeRosterIndex < 0 ? 0 : Math.min(state.activeRosterIndex + 1, options.length - 1);
      updateActiveRosterOption(next);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.hidden) openRosterList(rosterSearch.value);
      const options = [...list.querySelectorAll('.yb-combobox-option')];
      if (!options.length) return;
      const next =
        state.activeRosterIndex < 0
          ? options.length - 1
          : Math.max(state.activeRosterIndex - 1, 0);
      updateActiveRosterOption(next);
    } else if (event.key === 'Enter') {
      if (!list.hidden) {
        event.preventDefault();
        const options = [...list.querySelectorAll('.yb-combobox-option')];
        const active = options[state.activeRosterIndex] || options[0];
        if (active) {
          const person = state.roster.find((item) => item.id === active.dataset.id);
          if (person) selectRoster(person);
        }
      }
    } else if (event.key === 'Escape') {
      closeRosterList();
    }
  });
  rosterSearch.addEventListener('blur', () => {
    setTimeout(closeRosterList, 120);
  });
  $('verify-btn').addEventListener('click', verifyIdentity);

  $('not-listed-toggle').addEventListener('click', () => {
    const box = $('not-listed-box');
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
  });
  $('not-listed-submit').addEventListener('click', sendNotListed);

  document.querySelectorAll('[data-next]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = Number(button.dataset.next);
      if (!validateStep(state.step)) return;
      if (next === 5) {
        renderProfilePreview('review-content', collectMetadata(), state.objectUrls.headshot);
      }
      setStep(next);
    });
  });
  document.querySelectorAll('[data-back]').forEach((button) => {
    button.addEventListener('click', () => setStep(Number(button.dataset.back)));
  });

  $('submit-profile-btn').addEventListener('click', submitProfile);
  $('continue-ballot-btn').addEventListener('click', () => {
    if (!$('continue-ballot-btn').disabled) {
      renderBallot();
      setStep(7);
    }
  });
  $('submit-ballot-btn').addEventListener('click', submitBallot);

  $('headshot-input').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) openCrop(file);
    event.target.value = '';
  });
  $('crop-zoom').addEventListener('input', (event) => setCropZoom(Number(event.target.value)));
  $('crop-zoom-out').addEventListener('click', () =>
    setCropZoom((state.crop?.scale || 1) - 0.25)
  );
  $('crop-zoom-in').addEventListener('click', () => setCropZoom((state.crop?.scale || 1) + 0.25));
  $('crop-reset').addEventListener('click', () => {
    if (!state.crop) return;
    state.crop.scale = 1;
    state.crop.offsetX = 0;
    state.crop.offsetY = 0;
    $('crop-zoom').value = '1';
    drawCrop();
  });
  $('crop-cancel').addEventListener('click', closeCrop);
  $('crop-confirm').addEventListener('click', confirmCrop);

  const canvas = $('crop-canvas');
  canvas.addEventListener('pointerdown', (event) => {
    if (!state.crop) return;
    state.crop.dragging = true;
    state.crop.startX = event.clientX;
    state.crop.startY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!state.crop?.dragging) return;
    state.crop.offsetX += event.clientX - state.crop.startX;
    state.crop.offsetY += event.clientY - state.crop.startY;
    state.crop.startX = event.clientX;
    state.crop.startY = event.clientY;
    drawCrop();
  });
  const stopDrag = () => {
    if (state.crop) state.crop.dragging = false;
  };
  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);

  const watched = [
    'nickname', 'birth-day', 'birth-month', 'state-of-origin', 'hometown',
    'whatsapp', 'include-phone', 'show-birthday', 'hobby', 'side-skill',
    'instagram', 'x-handle', 'linkedin', 'tiktok', 'facebook', 'website',
    'favourite-course', 'toughest-course', 'hardest-level', 'favourite-lecturer',
    'most-teaching-lecturer', 'memorable-moment', 'class-word', 'motto',
    'class-message', 'relationship-status', 'consent-accurate', 'show-in-yearbook',
  ];
  for (const id of watched) {
    const element = $(id);
    element.addEventListener('input', saveDraft);
    element.addEventListener('change', saveDraft);
  }
}

async function init() {
  try {
    const [config, roster, courses, lecturers] = await Promise.all([
      request('/api/yearbook/config'),
      request('/api/yearbook/roster'),
      request('/api/yearbook/courses'),
      request('/api/yearbook/lecturers'),
    ]);
    state.config = config;
    state.roster = roster.roster || [];
    state.courses = courses.courses || [];
    state.lecturers = lecturers.lecturers || [];
    state.locked = Boolean(config.form_locked);

    populateStaticSelects();
    populateRoster();
    populateCourses();
    populateLecturers();
    setupEvents();
    setDeadline();

    if (state.locked) {
      $('locked-note').style.display = 'block';
      $('verify-btn').disabled = true;
      $('submit-profile-btn').disabled = true;
      $('submit-ballot-btn').disabled = true;
    } else {
      $('verify-btn').disabled = false;
    }

    const stored = readStoredIdentity();
    if (stored && (await loadSubmittedState(stored))) {
      setStep(6);
      return;
    }

    restoreDraft();
    setStep(0);
  } catch (error) {
    showToast('Could not load the yearbook form. Refresh and try again.', 'error');
    console.error(error);
  }
}

init();