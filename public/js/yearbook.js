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
  populateSelect($('favourite-lecturer'), state.lecturers, 'Choose a lecturer');
  populateSelect($('most-teaching-lecturer'), state.lecturers, 'None');
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
    display_name: $('display-name').value.trim(),
    nickname: $('nickname').value.trim(),
    birth_day: $('birth-day').value,
    birth_month: $('birth-month').value,
    state_of_origin: $('state-of-origin').value,
    hometown: $('hometown').value.trim(),
    whatsapp: $('whatsapp').value.trim(),
    include_phone: $('include-phone').checked,
    show_birthday: $('show-birthday').checked,
    outside_tags: [
      $('outside-tag-1').value.trim(),
      $('outside-tag-2').value.trim(),
      $('outside-tag-3').value.trim(),
    ].filter(Boolean),
    outside_line: $('outside-line').value.trim(),
    unknown_fact: $('unknown-fact').value.trim(),
    hobbies: [
      $('hobby-1').value.trim(),
      $('hobby-2').value.trim(),
      $('hobby-3').value.trim(),
    ].filter(Boolean),
    direction: $('direction').value.trim(),
    direction_line: $('direction-line').value.trim(),
    favourite_course: $('favourite-course').value,
    toughest_course: $('toughest-course').value,
    hardest_level: $('hardest-level').value,
    favourite_lecturer: $('favourite-lecturer').value,
    most_teaching_lecturer: $('most-teaching-lecturer').value,
    memorable_moment: $('memorable-moment').value.trim(),
    class_word: $('class-word').value.trim(),
    motto: $('motto').value.trim(),
    social_platform: $('social-platform').value,
    social_handle: $('social-handle').value.trim(),
    class_message: $('class-message').value.trim(),
    relationship_status: $('relationship-status').value,
    consent_accurate: $('consent-accurate').checked,
    show_in_yearbook: $('show-in-yearbook').checked,
    remove_department_photo: state.removeDepartment,
  };
}

function applyMetadata(data) {
  $('display-name').value = data.display_name || '';
  $('nickname').value = data.nickname || '';
  $('birth-day').value = data.birth_day ? String(data.birth_day) : '';
  $('birth-month').value = data.birth_month ? String(data.birth_month) : '';
  $('state-of-origin').value = data.state_of_origin || '';
  $('hometown').value = data.hometown || '';
  $('whatsapp').value = data.whatsapp || '';
  $('include-phone').checked = Boolean(data.include_phone);
  $('show-birthday').checked = Boolean(data.show_birthday);
  const tags = Array.isArray(data.outside_tags) ? data.outside_tags : [];
  $('outside-tag-1').value = tags[0] || '';
  $('outside-tag-2').value = tags[1] || '';
  $('outside-tag-3').value = tags[2] || '';
  $('outside-line').value = data.outside_line || '';
  $('unknown-fact').value = data.unknown_fact || '';
  const hobbies = Array.isArray(data.hobbies) ? data.hobbies : [];
  $('hobby-1').value = hobbies[0] || '';
  $('hobby-2').value = hobbies[1] || '';
  $('hobby-3').value = hobbies[2] || '';
  $('direction').value = data.direction || '';
  $('direction-line').value = data.direction_line || '';
  $('favourite-course').value = data.favourite_course || '';
  $('toughest-course').value = data.toughest_course || '';
  $('hardest-level').value = data.hardest_level || '';
  $('favourite-lecturer').value = data.favourite_lecturer || '';
  $('most-teaching-lecturer').value = data.most_teaching_lecturer || '';
  $('memorable-moment').value = data.memorable_moment || '';
  $('class-word').value = data.class_word || '';
  $('motto').value = data.motto || '';
  $('social-platform').value = data.social_platform || '';
  $('social-handle').value = data.social_handle || '';
  $('class-message').value = data.class_message || '';
  $('relationship-status').value = data.relationship_status || '';
  $('consent-accurate').checked = Boolean(data.consent_accurate);
  $('show-in-yearbook').checked = data.show_in_yearbook !== false;
  updatePreview();
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

function updatePreview() {
  const name = $('display-name').value.trim() || 'Your name';
  const nickname = $('nickname').value.trim() || 'Your nickname';
  const stateName = $('state-of-origin').value || 'State of origin';
  const word = $('class-word').value.trim() || 'Your class word';
  const motto = $('motto').value.trim() || 'Your motto';

  $('preview-name').textContent = name;
  $('preview-nickname').textContent = nickname;
  $('preview-state').textContent = stateName;
  $('preview-word').textContent = word;
  $('preview-motto').textContent = motto;

  const tags = [
    $('outside-tag-1').value.trim(),
    $('outside-tag-2').value.trim(),
    $('outside-tag-3').value.trim(),
  ].filter(Boolean);
  const tagList = $('preview-tags');
  tagList.innerHTML = '';
  for (const tag of tags) {
    const span = document.createElement('span');
    span.className = 'yb-tag';
    span.textContent = tag;
    tagList.appendChild(span);
  }

  const portrait = state.objectUrls.portrait || state.editProfile?.portrait_url || '';
  const preview = $('preview-portrait');
  const empty = $('preview-portrait-empty');
  if (portrait) {
    preview.src = portrait;
    preview.style.display = 'block';
    empty.style.display = 'none';
  } else {
    preview.style.display = 'none';
    empty.style.display = 'grid';
  }
}

function validateStep(step) {
  clearFieldErrors();
  let ok = true;

  if (step === 1) {
    if (!$('display-name').value.trim()) {
      setFieldError('display_name', 'Add your preferred name.');
      ok = false;
    }
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
    if (!$('outside-tag-1').value.trim() && !$('outside-tag-2').value.trim() && !$('outside-tag-3').value.trim()) {
      setFieldError('outside_tags', 'Add at least one thing.');
      ok = false;
    }
    if (!$('outside-line').value.trim()) {
      setFieldError('outside_line', 'Add one line about you.');
      ok = false;
    }
    if (!$('unknown-fact').value.trim()) {
      setFieldError('unknown_fact', 'Add one thing people may not know.');
      ok = false;
    }
    if (!$('hobby-1').value.trim() && !$('hobby-2').value.trim() && !$('hobby-3').value.trim()) {
      setFieldError('hobbies', 'Add at least one hobby.');
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
  const rosterId = $('roster-select').value;
  const regNumber = $('reg-number').value.trim();

  if (!rosterId) {
    setFieldError('roster_id', 'Select your name.');
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
    showToast(`Welcome, ${data.name.split(',')[0]}.`, 'success');
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
    updatePreview();
    showToast('Photo ready.', 'success');
  } catch {
    if (file.size <= 3 * 1024 * 1024) {
      state.files[kind] = file;
      if (state.objectUrls[kind]) URL.revokeObjectURL(state.objectUrls[kind]);
      state.objectUrls[kind] = URL.createObjectURL(file);
      setPhotoPreview(kind, state.objectUrls[kind]);
      state.removeDepartment = false;
      updatePreview();
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
  $('roster-search').addEventListener('input', (event) => filterRoster(event.target.value));
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
    'display-name', 'nickname', 'birth-day', 'birth-month', 'state-of-origin',
    'hometown', 'whatsapp', 'include-phone', 'show-birthday', 'outside-tag-1',
    'outside-tag-2', 'outside-tag-3', 'outside-line', 'unknown-fact', 'hobby-1',
    'hobby-2', 'hobby-3', 'direction', 'direction-line', 'favourite-course',
    'toughest-course', 'hardest-level', 'favourite-lecturer',
    'most-teaching-lecturer', 'memorable-moment', 'class-word', 'motto',
    'social-platform', 'social-handle', 'class-message', 'relationship-status',
    'consent-accurate', 'show-in-yearbook',
  ];
  for (const id of watched) {
    const element = $(id);
    element.addEventListener('input', () => {
      updatePreview();
      saveDraft();
    });
    element.addEventListener('change', () => {
      updatePreview();
      saveDraft();
    });
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
