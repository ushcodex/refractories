import { isAdmin } from '../../_lib/auth.js';
import { badRequest, json, notFound, serverError, unauthorized } from '../../_lib/http.js';
import { detectImageType, extensionForType } from '../../_lib/images.js';
import {
  checkRateLimit,
  cleanArray,
  cleanText,
  getSettings,
  getSetting,
  hashIp,
  hashRegNumber,
  hmacHex,
  parseJsonArray,
  publicProfile,
  randomToken,
  setSetting,
  sha256Hex,
  signPayload,
  timingSafeEqual,
  verifyPayload,
  yearbookBucket,
  yearbookDb,
} from '../../_lib/yearbook.js';

const STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo',
  'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa',
  'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba',
  'Yobe', 'Zamfara',
];

const HARDEST_LEVELS = ['100L', '200L', '300L', '400L', '500L'];

const SUPERLATIVES = [
  'Most Likely to Become a Professor',
  'Most Likely to Win a Nobel Prize',
  'Most Likely to Build a Refinery',
  'Most Likely to Win a Scholarship',
  'Most Likely to Go Viral',
  "Most Likely to Remember Everyone's Birthday",
  'Most Likely to Plan the Reunion',
  'Most Likely to Survive on Indomie',
  'Most Likely to Ask "Is This Going to Be in the Exam?"',
  'Most Likely to Have the Best Notes',
  'Most Likely to Stay Calm in a Crisis',
  'Most Likely to Be the Group Chat Admin',
  'Most Likely to Travel the World',
  'Most Likely to Become a Philanthropist',
  'Most Likely to Write a Book',
  'Most Likely to Lead a Major Project',
];

const MAX_YEARBOOK_FILE_SIZE = 3 * 1024 * 1024;

function routeParts(params) {
  return Array.isArray(params.path) ? params.path.filter(Boolean) : [params.path].filter(Boolean);
}

function isFile(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.size === 'number' &&
    typeof value.arrayBuffer === 'function'
  );
}

function boolValue(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function imageUrl(key) {
  return key ? `/api/yearbook/image/${key}` : '';
}

async function insertRow(db, table, row) {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
  await db.prepare(sql).bind(...columns.map((column) => row[column])).run();
}

async function updateRow(db, table, id, row) {
  const columns = Object.keys(row);
  const sql = `UPDATE ${table} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`;
  await db.prepare(sql).bind(...columns.map((column) => row[column]), id).run();
}

async function getConfig(env) {
  const settings = await getSettings(env);
  return json(
    {
      class_label: settings.class_label || `Class of ${env.CLASS_YEAR || '2024'}`,
      class_year: settings.class_year || env.CLASS_YEAR || '2024',
      submission_deadline: settings.submission_deadline || env.SUBMISSION_DEADLINE || '',
      form_locked: settings.form_locked === '1',
      superlatives_enabled: settings.superlatives_enabled === '1',
      results_published: settings.results_published === '1',
      site_name: settings.site_name || env.SITE_NAME || 'u19ce',
      states: STATES,
      hardest_levels: HARDEST_LEVELS,
      superlatives: SUPERLATIVES,
      server_time: new Date().toISOString(),
    },
    200,
    { 'cache-control': 'no-store' }
  );
}

async function getRoster(env) {
  const db = yearbookDb(env);
  const { results } = await db
    .prepare('SELECT id, full_name FROM yearbook_roster WHERE active = 1 ORDER BY sort_name ASC')
    .all();
  return json({ roster: results.map((row) => ({ id: row.id, name: row.full_name })) }, 200, {
    'cache-control': 'no-store',
  });
}

async function validateIdentity(request, env) {
  if (!(await checkRateLimit(env, request, 'identity', 10, 900))) {
    return json({ error: 'Too many attempts. Try again later.' }, 429);
  }

  const body = await request.json();
  const rosterId = cleanText(body.roster_id, 100);
  const regNumber = cleanText(body.reg_number, 30);
  if (!rosterId || !regNumber) return badRequest('Name and registration number are required.');

  const db = yearbookDb(env);
  const roster = await db
    .prepare('SELECT id, full_name, reg_hash FROM yearbook_roster WHERE id = ? AND active = 1')
    .bind(rosterId)
    .first();
  if (!roster) return json({ error: 'Invalid name or registration number.' }, 403);

  const suppliedHash = await hashRegNumber(env, regNumber);
  if (!timingSafeEqual(suppliedHash, roster.reg_hash)) {
    return json({ error: 'Invalid name or registration number.' }, 403);
  }

  const now = Math.floor(Date.now() / 1000);
  const token = await signPayload(
    {
      purpose: 'identity',
      roster_id: roster.id,
      name: roster.full_name,
      exp: now + 60 * 30,
    },
    env.SESSION_SECRET
  );

  return json({ ok: true, token, name: roster.full_name });
}

async function getCourses(env) {
  const db = yearbookDb(env);
  const { results } = await db
    .prepare(
      'SELECT code, title, year_level, semester FROM yearbook_courses WHERE active = 1 ORDER BY year_level ASC, code ASC'
    )
    .all();
  return json({ courses: results });
}

async function getLecturers(env) {
  const db = yearbookDb(env);
  const { results } = await db
    .prepare('SELECT id, name FROM yearbook_lecturers WHERE active = 1 ORDER BY name ASC')
    .all();
  return json({ lecturers: results });
}

async function getProfiles(env) {
  const db = yearbookDb(env);
  const { results } = await db
    .prepare(
      `SELECT id, display_name, nickname, portrait_key, state_of_origin, class_word, motto
       FROM yearbook_profiles
       WHERE status = 'approved' AND show_in_yearbook = 1
       ORDER BY display_name ASC`
    )
    .all();
  return json({
    profiles: results.map((row) => ({
      id: row.id,
      display_name: row.display_name,
      nickname: row.nickname,
      portrait_url: imageUrl(row.portrait_key),
      state_of_origin: row.state_of_origin,
      class_word: row.class_word,
      motto: row.motto,
    })),
  });
}

async function getProfile(env, parts) {
  const id = cleanText(parts[1], 100);
  if (!id) return notFound('Profile not found');
  const db = yearbookDb(env);
  const row = await db
    .prepare(
      `SELECT * FROM yearbook_profiles
       WHERE id = ? AND status = 'approved' AND show_in_yearbook = 1`
    )
    .bind(id)
    .first();
  if (!row) return notFound('Profile not found');
  return json(publicProfile(row));
}

async function validateMetadata(env, metadata) {
  const db = yearbookDb(env);
  const errors = {};

  const displayName = cleanText(metadata.display_name, 60);
  if (!displayName) errors.display_name = 'Required';

  const nickname = cleanText(metadata.nickname, 25);
  if (!nickname) errors.nickname = 'Required';

  const birthDay = Number.parseInt(metadata.birth_day, 10);
  if (!Number.isInteger(birthDay) || birthDay < 1 || birthDay > 31) {
    errors.birth_day = 'Invalid day';
  }

  const birthMonth = Number.parseInt(metadata.birth_month, 10);
  if (!Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) {
    errors.birth_month = 'Invalid month';
  }

  const stateOfOrigin = cleanText(metadata.state_of_origin, 40);
  if (!STATES.includes(stateOfOrigin)) errors.state_of_origin = 'Choose a state';

  const hometown = cleanText(metadata.hometown, 40);
  const whatsapp = cleanText(metadata.whatsapp, 30);
  if (whatsapp && !/^[0-9+\-()\s]{7,30}$/.test(whatsapp)) {
    errors.whatsapp = 'Invalid phone number';
  }

  const outsideTags = cleanArray(metadata.outside_tags, 3, 40);
  if (outsideTags.length === 0) errors.outside_tags = 'Add at least one';

  const outsideLine = cleanText(metadata.outside_line, 120);
  if (!outsideLine) errors.outside_line = 'Required';

  const unknownFact = cleanText(metadata.unknown_fact, 200);
  if (!unknownFact) errors.unknown_fact = 'Required';

  const hobbies = cleanArray(metadata.hobbies, 3, 40);
  if (hobbies.length === 0) errors.hobbies = 'Add at least one';

  const direction = cleanText(metadata.direction, 40);
  const directionLine = cleanText(metadata.direction_line, 150);

  const courseRows = await db
    .prepare('SELECT code FROM yearbook_courses WHERE active = 1')
    .all();
  const courseSet = new Set(courseRows.results.map((row) => row.code));

  const favouriteCourse = cleanText(metadata.favourite_course, 20);
  if (!courseSet.has(favouriteCourse)) errors.favourite_course = 'Choose a course';

  const toughestCourse = cleanText(metadata.toughest_course, 20);
  if (!courseSet.has(toughestCourse)) errors.toughest_course = 'Choose a course';

  const hardestLevel = cleanText(metadata.hardest_level, 10);
  if (!HARDEST_LEVELS.includes(hardestLevel)) errors.hardest_level = 'Choose a level';

  const lecturerRows = await db
    .prepare('SELECT name FROM yearbook_lecturers WHERE active = 1')
    .all();
  const lecturerSet = new Set(lecturerRows.results.map((row) => row.name));

  const favouriteLecturer = cleanText(metadata.favourite_lecturer, 100);
  if (!lecturerSet.has(favouriteLecturer)) errors.favourite_lecturer = 'Choose a lecturer';

  const mostTeachingLecturer = cleanText(metadata.most_teaching_lecturer, 100);
  if (mostTeachingLecturer && !lecturerSet.has(mostTeachingLecturer)) {
    errors.most_teaching_lecturer = 'Choose a lecturer';
  }

  const memorableMoment = cleanText(metadata.memorable_moment, 250);
  const classWord = cleanText(metadata.class_word, 20);
  if (!classWord) errors.class_word = 'Required';

  const motto = cleanText(metadata.motto, 150);
  if (!motto) errors.motto = 'Required';

  const socialPlatform = cleanText(metadata.social_platform, 30);
  const socialHandle = cleanText(metadata.social_handle, 60);
  const classMessage = cleanText(metadata.class_message, 300);
  const relationshipStatus = cleanText(metadata.relationship_status, 30);

  const consentAccurate = boolValue(metadata.consent_accurate);
  if (!consentAccurate) errors.consent_accurate = 'Required';

  const showInYearbook =
    metadata.show_in_yearbook === undefined ? true : boolValue(metadata.show_in_yearbook);
  const includePhone = boolValue(metadata.include_phone);
  const showBirthday = boolValue(metadata.show_birthday);

  const flags = [];
  if (
    outsideLine.length > 100 ||
    unknownFact.length > 160 ||
    memorableMoment.length > 200 ||
    classMessage.length > 240
  ) {
    flags.push('long_text');
  }
  const emojiText = [
    displayName,
    nickname,
    outsideLine,
    unknownFact,
    memorableMoment,
    classWord,
    motto,
    classMessage,
  ].join(' ');
  if (/[\u{1F300}-\u{1FAFF}]/u.test(emojiText)) flags.push('emoji');

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    data: {
      displayName,
      nickname,
      birthDay,
      birthMonth,
      stateOfOrigin,
      hometown,
      whatsapp,
      outsideTags,
      outsideLine,
      unknownFact,
      hobbies,
      direction,
      directionLine,
      favouriteCourse,
      toughestCourse,
      hardestLevel,
      favouriteLecturer,
      mostTeachingLecturer,
      memorableMoment,
      classWord,
      motto,
      socialPlatform,
      socialHandle,
      classMessage,
      relationshipStatus,
      consentAccurate,
      showInYearbook,
      includePhone,
      showBirthday,
      flags,
    },
  };
}

async function uploadYearbookPhoto(env, file, prefix, profileId) {
  if (!isFile(file)) return null;
  if (file.size > MAX_YEARBOOK_FILE_SIZE) {
    throw new Error('One of the photos is too large.');
  }
  const type = await detectImageType(file);
  if (!type) throw new Error('One of the photos is not a supported image.');
  const key = `yearbook/${prefix}/${profileId}/${randomToken(12)}.${extensionForType(type)}`;
  await yearbookBucket(env).put(key, file.stream(), {
    httpMetadata: { contentType: type },
  });
  return { key, type };
}

async function saveProfile(request, env) {
  const db = yearbookDb(env);
  const settings = await getSettings(env);
  if (settings.form_locked === '1') {
    return json({ error: 'The form is currently closed.' }, 403);
  }

  const form = await request.formData();
  const metadataRaw = form.get('metadata');
  if (typeof metadataRaw !== 'string') return badRequest('Missing profile data.');

  let metadata;
  try {
    metadata = JSON.parse(metadataRaw);
  } catch {
    return badRequest('Invalid profile data.');
  }

  const editToken = typeof form.get('edit_token') === 'string' ? form.get('edit_token') : '';
  const identityToken = typeof form.get('identity_token') === 'string' ? form.get('identity_token') : '';

  const editing = Boolean(editToken);
  const rateAction = editing ? 'profile-edit' : 'profile-save';
  if (!(await checkRateLimit(env, request, rateAction, 20, 3600))) {
    return json({ error: 'Too many submissions. Try again later.' }, 429);
  }

  let existing = null;
  let rosterId = '';
  let rosterName = '';

  if (editing) {
    const tokenHash = await sha256Hex(editToken);
    existing = await db
      .prepare('SELECT * FROM yearbook_profiles WHERE edit_token_hash = ?')
      .bind(tokenHash)
      .first();
    if (!existing) return json({ error: 'This edit link is not valid.' }, 403);
    rosterId = existing.roster_id;
    const roster = await db
      .prepare('SELECT full_name FROM yearbook_roster WHERE id = ?')
      .bind(rosterId)
      .first();
    rosterName = roster?.full_name || '';
  } else {
    const identity = await verifyPayload(identityToken, env.SESSION_SECRET);
    if (!identity || identity.purpose !== 'identity') {
      return json({ error: 'Verify your name and registration number first.' }, 403);
    }
    rosterId = identity.roster_id;
    rosterName = identity.name;
    existing = await db
      .prepare('SELECT * FROM yearbook_profiles WHERE roster_id = ?')
      .bind(rosterId)
      .first();
    if (existing) {
      return json({ error: 'A profile already exists for this name. Use your edit link.' }, 409);
    }
  }

  const validation = await validateMetadata(env, metadata);
  if (!validation.ok) {
    return json({ error: 'Please check the form.', fields: validation.errors }, 400);
  }
  const data = validation.data;

  const profileId = existing?.id || crypto.randomUUID();
  const portraitFile = form.get('portrait');
  const candidFile = form.get('candid');
  const departmentFile = form.get('department_photo');
  const removeDepartment = boolValue(metadata.remove_department_photo);

  if (!editing && !isFile(portraitFile)) return badRequest('A portrait photo is required.');
  if (!editing && !isFile(candidFile)) return badRequest('A candid photo is required.');

  const bucket = yearbookBucket(env);
  const uploadedKeys = [];
  let portraitKey = existing?.portrait_key || '';
  let candidKey = existing?.candid_key || '';
  let departmentKey = existing?.department_photo_key || null;
  const oldKeys = [];

  try {
    if (isFile(portraitFile)) {
      const uploaded = await uploadYearbookPhoto(env, portraitFile, 'portraits', profileId);
      uploadedKeys.push(uploaded.key);
      if (existing?.portrait_key) oldKeys.push(existing.portrait_key);
      portraitKey = uploaded.key;
    }
    if (isFile(candidFile)) {
      const uploaded = await uploadYearbookPhoto(env, candidFile, 'candid', profileId);
      uploadedKeys.push(uploaded.key);
      if (existing?.candid_key) oldKeys.push(existing.candid_key);
      candidKey = uploaded.key;
    }
    if (isFile(departmentFile)) {
      const uploaded = await uploadYearbookPhoto(env, departmentFile, 'department', profileId);
      uploadedKeys.push(uploaded.key);
      if (existing?.department_photo_key) oldKeys.push(existing.department_photo_key);
      departmentKey = uploaded.key;
    } else if (removeDepartment && departmentKey) {
      oldKeys.push(departmentKey);
      departmentKey = null;
    }
  } catch (error) {
    await Promise.allSettled(uploadedKeys.map((key) => bucket.delete(key)));
    return badRequest(error.message);
  }

  if (!portraitKey || !candidKey) {
    await Promise.allSettled(uploadedKeys.map((key) => bucket.delete(key)));
    return badRequest('A portrait and candid photo are required.');
  }

  const status = settings.auto_publish === '1' ? 'approved' : 'pending';
  const nowIso = new Date().toISOString();
  const common = {
    status,
    display_name: data.displayName,
    nickname: data.nickname,
    birth_day: data.birthDay,
    birth_month: data.birthMonth,
    state_of_origin: data.stateOfOrigin,
    hometown: data.hometown,
    whatsapp: data.whatsapp,
    whatsapp_opt_in: data.includePhone ? 1 : 0,
    outside_tags: JSON.stringify(data.outsideTags),
    outside_line: data.outsideLine,
    unknown_fact: data.unknownFact,
    hobbies: JSON.stringify(data.hobbies),
    direction: data.direction,
    direction_line: data.directionLine,
    favourite_course: data.favouriteCourse,
    toughest_course: data.toughestCourse,
    hardest_level: data.hardestLevel,
    favourite_lecturer: data.favouriteLecturer,
    most_teaching_lecturer: data.mostTeachingLecturer,
    memorable_moment: data.memorableMoment,
    class_word: data.classWord,
    motto: data.motto,
    social_platform: data.socialPlatform,
    social_handle: data.socialHandle,
    class_message: data.classMessage,
    relationship_status: data.relationshipStatus,
    portrait_key: portraitKey,
    candid_key: candidKey,
    department_photo_key: departmentKey,
    consent_accurate: 1,
    show_in_yearbook: data.showInYearbook ? 1 : 0,
    include_phone: data.includePhone ? 1 : 0,
    show_birthday: data.showBirthday ? 1 : 0,
    flags: JSON.stringify(data.flags),
    ip_hash: await hashIp(env, request),
    user_agent_hash: await hmacHex(env.SESSION_SECRET, request.headers.get('User-Agent') || ''),
    approved_at: status === 'approved' ? nowIso : null,
    rejected_at: null,
    rejection_reason: null,
  };

  let editTokenOut = '';
  try {
    if (existing) {
      await updateRow(db, 'yearbook_profiles', existing.id, {
        ...common,
        updated_at: nowIso,
      });
    } else {
      editTokenOut = randomToken(32);
      await insertRow(db, 'yearbook_profiles', {
        id: profileId,
        roster_id: rosterId,
        ...common,
        edit_token_hash: await sha256Hex(editTokenOut),
      });
    }
  } catch (error) {
    await Promise.allSettled(uploadedKeys.map((key) => bucket.delete(key)));
    throw error;
  }

  if (oldKeys.length) {
    await Promise.allSettled(oldKeys.map((key) => bucket.delete(key)));
  }

  return json({
    ok: true,
    id: profileId,
    status,
    edit_token: editTokenOut || undefined,
    edit_url: editTokenOut ? `/yearbook-form.html#token=${editTokenOut}` : undefined,
    roster_name: rosterName,
  });
}

async function getEditProfile(request, env) {
  const body = await request.json();
  const token = typeof body.token === 'string' ? body.token : '';
  if (!token) return badRequest('Missing edit token.');

  const db = yearbookDb(env);
  const tokenHash = await sha256Hex(token);
  const row = await db
    .prepare('SELECT * FROM yearbook_profiles WHERE edit_token_hash = ?')
    .bind(tokenHash)
    .first();
  if (!row) return notFound('This edit link is not valid.');

  const roster = await db
    .prepare('SELECT full_name FROM yearbook_roster WHERE id = ?')
    .bind(row.roster_id)
    .first();

  return json({
    ok: true,
    profile: {
      id: row.id,
      roster_name: roster?.full_name || '',
      status: row.status,
      display_name: row.display_name,
      nickname: row.nickname,
      birth_day: row.birth_day,
      birth_month: row.birth_month,
      state_of_origin: row.state_of_origin,
      hometown: row.hometown || '',
      whatsapp: row.whatsapp || '',
      whatsapp_opt_in: row.whatsapp_opt_in === 1,
      outside_tags: parseJsonArray(row.outside_tags),
      outside_line: row.outside_line,
      unknown_fact: row.unknown_fact,
      hobbies: parseJsonArray(row.hobbies),
      direction: row.direction || '',
      direction_line: row.direction_line || '',
      favourite_course: row.favourite_course,
      toughest_course: row.toughest_course,
      hardest_level: row.hardest_level,
      favourite_lecturer: row.favourite_lecturer,
      most_teaching_lecturer: row.most_teaching_lecturer || '',
      memorable_moment: row.memorable_moment || '',
      class_word: row.class_word,
      motto: row.motto,
      social_platform: row.social_platform || '',
      social_handle: row.social_handle || '',
      class_message: row.class_message || '',
      relationship_status: row.relationship_status || '',
      consent_accurate: row.consent_accurate === 1,
      show_in_yearbook: row.show_in_yearbook === 1,
      include_phone: row.include_phone === 1,
      show_birthday: row.show_birthday === 1,
      portrait_url: imageUrl(row.portrait_key),
      candid_url: imageUrl(row.candid_key),
      department_photo_url: imageUrl(row.department_photo_key),
    },
  });
}

async function addNotListed(request, env) {
  if (!(await checkRateLimit(env, request, 'not-listed', 5, 3600))) {
    return json({ error: 'Too many requests. Try again later.' }, 429);
  }
  const body = await request.json();
  const requestedName = cleanText(body.name, 100);
  if (!requestedName) return badRequest('Name is required.');

  const db = yearbookDb(env);
  await db
    .prepare(
      `INSERT INTO yearbook_not_listed (id, requested_name, note, contact)
       VALUES (?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      requestedName,
      cleanText(body.note, 500),
      cleanText(body.contact, 100)
    )
    .run();

  return json({ ok: true });
}

async function getSuperlatives(env) {
  const settings = await getSettings(env);
  if (settings.superlatives_enabled !== '1') {
    return json({ enabled: false, categories: [], nominees: [] });
  }
  const db = yearbookDb(env);
  const { results } = await db
    .prepare(
      `SELECT id, display_name, portrait_key
       FROM yearbook_profiles
       WHERE status = 'approved' AND show_in_yearbook = 1
       ORDER BY display_name ASC`
    )
    .all();
  return json({
    enabled: true,
    categories: SUPERLATIVES,
    nominees: results.map((row) => ({
      id: row.id,
      display_name: row.display_name,
      portrait_url: imageUrl(row.portrait_key),
    })),
    results_published: settings.results_published === '1',
  });
}

async function saveBallot(request, env) {
  if (!(await checkRateLimit(env, request, 'ballot', 20, 3600))) {
    return json({ error: 'Too many requests. Try again later.' }, 429);
  }

  const settings = await getSettings(env);
  if (settings.superlatives_enabled !== '1') {
    return json({ error: 'Superlatives are not open.' }, 403);
  }

  const body = await request.json();
  const identity = await verifyPayload(body.identity_token, env.SESSION_SECRET);
  if (!identity || identity.purpose !== 'identity') {
    return json({ error: 'Verify your name and registration number first.' }, 403);
  }

  const ballot = body.ballot && typeof body.ballot === 'object' ? body.ballot : {};
  const db = yearbookDb(env);
  const voterProfile = await db
    .prepare('SELECT id FROM yearbook_profiles WHERE roster_id = ?')
    .bind(identity.roster_id)
    .first();

  const { results: nominees } = await db
    .prepare(
      `SELECT id FROM yearbook_profiles
       WHERE status = 'approved' AND show_in_yearbook = 1`
    )
    .all();
  const nomineeSet = new Set(nominees.map((row) => row.id));

  let saved = 0;
  for (const category of SUPERLATIVES) {
    const nomineeId = cleanText(ballot[category], 100);
    if (!nomineeId) continue;
    if (!nomineeSet.has(nomineeId)) continue;
    if (voterProfile && nomineeId === voterProfile.id) continue;

    await db
      .prepare(
        `INSERT INTO yearbook_ballots (id, voter_roster_id, category, nominee_profile_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(voter_roster_id, category)
         DO UPDATE SET nominee_profile_id = excluded.nominee_profile_id, created_at = datetime('now')`
      )
      .bind(crypto.randomUUID(), identity.roster_id, category, nomineeId)
      .run();
    saved++;
  }

  const suggestion = cleanText(body.suggestion, 100);
  if (suggestion) {
    await db
      .prepare(
        `INSERT INTO yearbook_award_ideas (id, voter_roster_id, suggestion)
         VALUES (?, ?, ?)
         ON CONFLICT(voter_roster_id)
         DO UPDATE SET suggestion = excluded.suggestion, created_at = datetime('now')`
      )
      .bind(crypto.randomUUID(), identity.roster_id, suggestion)
      .run();
  }

  return json({ ok: true, saved });
}

async function getResults(env, publicOnly) {
  const db = yearbookDb(env);
  if (publicOnly) {
    const settings = await getSettings(env);
    if (settings.results_published !== '1') return json({ published: false, results: [] });
  }

  const { results } = await db
    .prepare(
      `SELECT b.category, b.nominee_profile_id, p.display_name, COUNT(*) AS votes
       FROM yearbook_ballots b
       JOIN yearbook_profiles p ON p.id = b.nominee_profile_id
       GROUP BY b.category, b.nominee_profile_id
       ORDER BY b.category ASC, votes DESC, p.display_name ASC`
    )
    .all();

  const grouped = new Map();
  for (const row of results) {
    if (!grouped.has(row.category)) grouped.set(row.category, []);
    grouped.get(row.category).push({
      nominee_profile_id: row.nominee_profile_id,
      display_name: row.display_name,
      votes: Number(row.votes),
    });
  }

  const output = SUPERLATIVES.map((category) => ({
    category,
    nominees: (grouped.get(category) || []).slice(0, publicOnly ? 3 : 50),
  }));

  return json({ published: true, results: output });
}

async function getImage(env, parts) {
  const key = parts.slice(1).join('/');
  if (!key.startsWith('yearbook/')) return notFound('Image not found');

  const object = await yearbookBucket(env).get(key);
  if (!object) return notFound('Image not found');

  const headers = new Headers();
  headers.set('content-type', object.httpMetadata?.contentType || 'image/jpeg');
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  if (object.etag) headers.set('etag', object.etag);
  if (object.size) headers.set('content-length', String(object.size));
  return new Response(object.body, { headers });
}

async function getAdminProfiles(env) {
  const db = yearbookDb(env);
  const { results } = await db
    .prepare(
      `SELECT p.*, r.full_name AS roster_name
       FROM yearbook_profiles p
       JOIN yearbook_roster r ON r.id = p.roster_id
       ORDER BY p.submitted_at DESC`
    )
    .all();

  return json({
    profiles: results.map((row) => ({
      id: row.id,
      roster_name: row.roster_name,
      status: row.status,
      display_name: row.display_name,
      nickname: row.nickname,
      birth_day: row.birth_day,
      birth_month: row.birth_month,
      state_of_origin: row.state_of_origin,
      hometown: row.hometown || '',
      whatsapp: row.whatsapp || '',
      include_phone: row.include_phone === 1,
      show_in_yearbook: row.show_in_yearbook === 1,
      show_birthday: row.show_birthday === 1,
      outside_tags: parseJsonArray(row.outside_tags),
      outside_line: row.outside_line,
      unknown_fact: row.unknown_fact,
      hobbies: parseJsonArray(row.hobbies),
      direction: row.direction || '',
      direction_line: row.direction_line || '',
      favourite_course: row.favourite_course,
      toughest_course: row.toughest_course,
      hardest_level: row.hardest_level,
      favourite_lecturer: row.favourite_lecturer,
      most_teaching_lecturer: row.most_teaching_lecturer || '',
      memorable_moment: row.memorable_moment || '',
      class_word: row.class_word,
      motto: row.motto,
      social_platform: row.social_platform || '',
      social_handle: row.social_handle || '',
      class_message: row.class_message || '',
      relationship_status: row.relationship_status || '',
      flags: parseJsonArray(row.flags),
      submitted_at: row.submitted_at,
      updated_at: row.updated_at,
      approved_at: row.approved_at,
      rejected_at: row.rejected_at,
      rejection_reason: row.rejection_reason,
      portrait_url: imageUrl(row.portrait_key),
      candid_url: imageUrl(row.candid_key),
      department_photo_url: imageUrl(row.department_photo_key),
    })),
  });
}

async function handleAdmin(request, env, parts, method) {
  if (!isAdmin(request, env)) return unauthorized();
  const db = yearbookDb(env);
  const route = parts.slice(1).join('/');

  if (method === 'GET' && route === 'profiles') return getAdminProfiles(env);

  if (method === 'GET' && route === 'settings') {
    return json({ settings: await getSettings(env) });
  }

  if (method === 'POST' && route === 'settings') {
    const body = await request.json();
    const allowed = new Set([
      'class_label',
      'submission_deadline',
      'auto_publish',
      'form_locked',
      'superlatives_enabled',
      'results_published',
      'site_name',
    ]);
    const key = cleanText(body.key, 60);
    if (!allowed.has(key)) return badRequest('Unknown setting.');
    await setSetting(env, key, cleanText(String(body.value), 200));
    return json({ ok: true });
  }

  if (method === 'POST' && route.startsWith('profile/')) {
    const id = cleanText(parts[2], 100);
    const body = await request.json();
    const action = cleanText(body.action, 20);
    if (!id) return badRequest('Missing profile.');
    if (action === 'approve') {
      await db
        .prepare(
          `UPDATE yearbook_profiles
           SET status = 'approved', approved_at = datetime('now'), rejected_at = NULL, rejection_reason = NULL
           WHERE id = ?`
        )
        .bind(id)
        .run();
    } else if (action === 'reject') {
      await db
        .prepare(
          `UPDATE yearbook_profiles
           SET status = 'rejected', rejected_at = datetime('now'), rejection_reason = ?
           WHERE id = ?`
        )
        .bind(cleanText(body.reason, 500), id)
        .run();
    } else {
      return badRequest('Unknown action.');
    }
    return json({ ok: true });
  }

  if (method === 'DELETE' && route.startsWith('profile/')) {
    const id = cleanText(parts[2], 100);
    const row = await db
      .prepare('SELECT portrait_key, candid_key, department_photo_key FROM yearbook_profiles WHERE id = ?')
      .bind(id)
      .first();
    if (!row) return notFound('Profile not found');

    const keys = [row.portrait_key, row.candid_key, row.department_photo_key].filter(Boolean);
    await Promise.allSettled(keys.map((key) => yearbookBucket(env).delete(key)));
    await db.prepare('DELETE FROM yearbook_ballots WHERE nominee_profile_id = ?').bind(id).run();
    await db.prepare('DELETE FROM yearbook_profiles WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  if (method === 'POST' && route === 'reissue') {
    const body = await request.json();
    const profileId = cleanText(body.profile_id, 100);
    if (!profileId) return badRequest('Missing profile.');
    const token = randomToken(32);
    await db
      .prepare('UPDATE yearbook_profiles SET edit_token_hash = ? WHERE id = ?')
      .bind(await sha256Hex(token), profileId)
      .run();
    return json({ ok: true, edit_url: `/yearbook-form.html#token=${token}` });
  }

  if (method === 'GET' && route === 'results') return getResults(env, false);

  if (method === 'GET' && route === 'export') {
    const profiles = await db.prepare('SELECT * FROM yearbook_profiles').all();
    const ballots = await db.prepare('SELECT * FROM yearbook_ballots').all();
    const ideas = await db.prepare('SELECT * FROM yearbook_award_ideas').all();
    return json(
      {
        generated_at: new Date().toISOString(),
        profiles: profiles.results,
        ballots: ballots.results,
        ideas: ideas.results,
      },
      200,
      {
        'content-disposition': 'attachment; filename="u19ce-yearbook-export.json"',
        'cache-control': 'no-store',
      }
    );
  }

  if (method === 'GET' && route === 'not-listed') {
    const { results } = await db
      .prepare('SELECT * FROM yearbook_not_listed ORDER BY created_at DESC')
      .all();
    return json({ requests: results });
  }

  if (method === 'POST' && route.startsWith('not-listed/')) {
    const id = cleanText(parts[2], 100);
    const body = await request.json();
    const status = cleanText(body.status, 20);
    if (!['pending', 'resolved', 'rejected'].includes(status)) {
      return badRequest('Unknown status.');
    }
    await db
      .prepare(
        `UPDATE yearbook_not_listed
         SET status = ?, resolved_at = CASE WHEN ? = 'pending' THEN NULL ELSE datetime('now') END
         WHERE id = ?`
      )
      .bind(status, status, id)
      .run();
    return json({ ok: true });
  }

  return notFound('Admin route not found');
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method.toUpperCase();
  const parts = routeParts(params);
  const route = parts.join('/');

  try {
    if (method === 'GET' && route === 'config') return await getConfig(env);
    if (method === 'GET' && route === 'roster') return await getRoster(env);
    if (method === 'POST' && route === 'validate') return await validateIdentity(request, env);
    if (method === 'GET' && route === 'courses') return await getCourses(env);
    if (method === 'GET' && route === 'lecturers') return await getLecturers(env);
    if (method === 'GET' && route === 'profiles') return await getProfiles(env);
    if (method === 'GET' && route.startsWith('profile/')) return await getProfile(env, parts);
    if (method === 'POST' && route === 'profile') return await saveProfile(request, env);
    if (method === 'POST' && route === 'edit') return await getEditProfile(request, env);
    if (method === 'POST' && route === 'not-listed') return await addNotListed(request, env);
    if (method === 'GET' && route === 'superlatives') return await getSuperlatives(env);
    if (method === 'POST' && route === 'superlatives/vote') return await saveBallot(request, env);
    if (method === 'GET' && route === 'superlatives/results') return await getResults(env, true);
    if (method === 'GET' && route.startsWith('image/')) return await getImage(env, parts);
    if (route.startsWith('admin/')) return await handleAdmin(request, env, parts, method);
    return notFound('Not found');
  } catch (error) {
    console.error('yearbook api error', error);
    return serverError();
  }
}
