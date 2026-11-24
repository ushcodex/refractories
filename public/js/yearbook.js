import { showToast, escapeHtml } from './utils.js';
import { compressImage } from './compression.js';

const DRAFT_KEY = 'u19ce-yearbook-draft-v1';

const state = {
  config: null,
  roster: [],
  courses: [],
  lecturers: [],
  identityToken: '',
  editToken: '',
  editProfile: null,
  selectedRoster: null,
  activeRosterIndex: -1,
  step: 0,
  files: { portrait: null, candid: null, department: null },
  objectUrls: { portrait: '', candid: '', department: '' },
  removeDepartment: false,
  draftTimer: null,
  locked: false,
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
    remove_department_photo: state.removeDepartment,
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
  if (state.editToken || state.locked) return;
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
  if (state.editToken) return;
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
    if (!state.editToken && !state.files.portrait) {
      showGlobalError('submit-error', 'Add a portrait photo.');
      ok = false;
    }
    if (!state.editToken && !state.files.candid) {
      showGlobalError('submit-error', 'Add a candid photo.');
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
    state.rosterName = data.name;
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
  if (state.submitting) return;
  if (!validateStep(4)) return;

  const button = $('submit-profile-btn');
  state.submitting = true;
  button.disabled = true;
  button.textContent = 'Submitting...';
  showGlobalError('submit-error', '');

  try {
    const formData = new FormData();
    formData.append('metadata', JSON.stringify(collectMetadata()));
    if (state.editToken) {
      formData.append('edit_token', state.editToken);
    } else {
      formData.append('identity_token', state.identityToken);
    }
    if (state.files.portrait) formData.append('portrait', state.files.portrait, 'portrait.jpg');
    if (state.files.candid) formData.append('candid', state.files.candid, 'candid.jpg');
    if (state.files.department) formData.append('department_photo', state.files.department, 'department.jpg');

    const data = await request('/api/yearbook/profile', {
      method: 'POST',
      body: formData,
    });

    localStorage.removeItem(DRAFT_KEY);
    $('draft-status').textContent = '';
    $('success-title').textContent = state.editToken ? 'Your changes are saved.' : 'Your profile is in.';
    $('success-message').textContent =
      data.status === 'approved'
        ? 'Your profile is live in the yearbook.'
        : 'It will appear in the yearbook after review.';

    if (data.edit_url) {
      $('edit-link-box').style.display = 'grid';
      $('edit-link-value').textContent = `${location.origin}${data.edit_url}`;
    } else if (state.editToken) {
      $('edit-link-box').style.display = 'grid';
      $('edit-link-value').textContent = `${location.origin}/yearbook.html#token=${state.editToken}`;
    }

    setStep(5);
    showToast(state.editToken ? 'Profile updated.' : 'Profile submitted.', 'success');
  } catch (error) {
    if (error.data?.fields) {
      for (const [field, message] of Object.entries(error.data.fields)) {
        setFieldError(field, message);
      }
      const firstInvalid = document.querySelector('.yb-field.invalid');
      if (firstInvalid) firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showGlobalError('submit-error', 'Please check the highlighted fields.');
    } else {
      showGlobalError('submit-error', error.data?.error || error.message);
    }
  } finally {
    state.submitting = false;
    button.disabled = false;
    button.textContent = state.editToken ? 'Save changes' : 'Submit profile';
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

function setPhotoPreview(kind, url) {
  const preview = $(`${kind}-preview`);
  const placeholder = $(`${kind}-placeholder`);
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

async function handlePhoto(kind, file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please choose an image file.', 'warning');
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast('That image is too large. Choose one under 20 MB.', 'warning');
    return;
  }

  try {
    const { fullBlob } = await compressImage(file);
    const compressed = new File([fullBlob], `${kind}.jpg`, { type: fullBlob.type || 'image/jpeg' });
    state.files[kind] = compressed;
    if (state.objectUrls[kind]) URL.revokeObjectURL(state.objectUrls[kind]);
    state.objectUrls[kind] = URL.createObjectURL(compressed);
    setPhotoPreview(kind, state.objectUrls[kind]);
    state.removeDepartment = false;
    showToast('Photo ready.', 'success');
  } catch {
    if (file.size <= 3 * 1024 * 1024) {
      state.files[kind] = file;
      if (state.objectUrls[kind]) URL.revokeObjectURL(state.objectUrls[kind]);
      state.objectUrls[kind] = URL.createObjectURL(file);
      setPhotoPreview(kind, state.objectUrls[kind]);
      state.removeDepartment = false;
      showToast('Photo ready.', 'success');
    } else {
      showToast('This image could not be processed. Try a JPEG or PNG.', 'error');
    }
  }
}

async function loadEditProfile(token) {
  state.editToken = token;
  try {
    const data = await request('/api/yearbook/edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    state.editProfile = data.profile;
    applyMetadata(data.profile);
    if (data.profile.portrait_url) setPhotoPreview('portrait', data.profile.portrait_url);
    if (data.profile.candid_url) setPhotoPreview('candid', data.profile.candid_url);
    if (data.profile.department_photo_url) setPhotoPreview('department', data.profile.department_photo_url);
    $('page-eyebrow').textContent = 'Edit your profile';
    $('page-title').textContent = 'Update your yearbook page.';
    $('page-subtitle').textContent = 'Change anything that no longer feels like you. Your edits will be reviewed again.';
    $('submit-profile-btn').textContent = 'Save changes';
    setStep(1);
    showToast('Edit link loaded.', 'success');
  } catch (error) {
    showToast(escapeHtml(error.data?.error || error.message), 'error');
    setStep(0);
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
        state.activeRosterIndex < 0
          ? 0
          : Math.min(state.activeRosterIndex + 1, options.length - 1);
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
      if (validateStep(state.step)) setStep(next);
    });
  });
  document.querySelectorAll('[data-back]').forEach((button) => {
    button.addEventListener('click', () => setStep(Number(button.dataset.back)));
  });

  $('submit-profile-btn').addEventListener('click', submitProfile);

  $('copy-edit-link').addEventListener('click', async () => {
    const value = $('edit-link-value').textContent;
    try {
      await navigator.clipboard.writeText(value);
      showToast('Edit link copied.', 'success');
    } catch {
      showToast('Copy the link manually.', 'warning');
    }
  });

  for (const kind of ['portrait', 'candid', 'department']) {
    $(`${kind}-input`).addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (file) handlePhoto(kind, file);
      event.target.value = '';
    });
  }

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
    } else {
      $('verify-btn').disabled = false;
    }

    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const token = hash.get('token');
    if (token) {
      await loadEditProfile(token);
    } else {
      restoreDraft();
      setStep(0);
    }
  } catch (error) {
    showToast('Could not load the yearbook form. Refresh and try again.', 'error');
    console.error(error);
  }
}

init();
