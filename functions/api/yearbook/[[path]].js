import { isAdmin } from '../../_lib/auth.js';
import { badRequest, json, notFound, serverError, unauthorized } from '../../_lib/http.js';
import { detectImageType, extensionForType } from '../../_lib/images.js';
import {
  checkRateLimit,
  cleanText,
  getSettings,
  formatRosterName,
  hashIp,
  hashRegNumber,
  hmacHex,
  parseJsonArray,
  publicProfile,
  randomToken,
  setSetting,
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
  'Yobe', 'Zamfara', 'International', 'N/A',
];

const HARDEST_LEVELS = ['100L', '200L', '300L', '400L', '500L', 'N/A'];

const SUPERLATIVES = [
  { key: 'most_likely_billionaire', label: 'Most likely to become a billionaire' },
  { key: 'most_talkative', label: 'Most talkative' },
  { key: 'calmest_under_pressure', label: 'Calmest under pressure' },
  { key: 'most_likely_phd', label: 'Most likely to do a PhD' },
  { key: 'best_presenter', label: 'Best presenter' },
  { key: 'class_encyclopedia', label: 'Class encyclopedia' },
  { key: 'most_likely_startup', label: 'Most likely to start a company' },
  { key: 'class_imam', label: 'Class Imam' },
  { key: 'class_pastor', label: 'Class Pastor' },
  { key: 'class_politician', label: 'Class Politician' },
  { key: 'human_rights_movement', label: 'Most likely to start a Human Rights Movement' },
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

function legacySocialValue(row, platform) {
  return row.social_platform === platform ? row.social_handle || '' : '';
}

async function insertRow(db, table, row) {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
  await db.prepare(sql).bind(...columns.map((column) => row[column])).run();
}

async function getConfig(env) {
  const settings = await getSettings(env);
  return json(
    {
      class_label: settings.class_label || `Class of ${env.CLASS_YEAR || '2024'}`,
      class_year: settings.class_year || env.CLASS_YEAR || '2024',
      submission_deadline: settings.submission_deadline || env.SUBMISSION_DEADLINE || '',
      form_locked: settings.form_locked === '1',
      yearbook_published: settings.yearbook_published === '1',
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
  return json(
    { roster: results.map((row) => ({ id: row.id, name: formatRosterName(row.full_name) })) },
    200,
    { 'cache-control': 'no-store' }
  );
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

  const displayName = formatRosterName(roster.full_name);
  const now = Math.floor(Date.now() / 1000);
  const token = await signPayload(
    {
      purpose: 'identity',
      roster_id: roster.id,
      name: displayName,
      exp: now + 60 * 30,
    },
    env.SESSION_SECRET
  );

  const existingProfile = await db
    .prepare('SELECT * FROM yearbook_profiles WHERE roster_id = ?')
    .bind(roster.id)
    .first();
  const receipt = await db
    .prepare('SELECT 1 FROM yearbook_ballot_receipts WHERE voter_roster_id = ?')
    .bind(roster.id)
    .first();

  return json({
    ok: true,
    token,
    name: displayName,
    profile: existingProfile
      ? {
          ...publicProfile(existingProfile),
          status: existingProfile.status,
          submitted_at: existingProfile.submitted_at,
        }
      : null,
    ballot_submitted: Boolean(receipt),
  });
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
    .prepare('SELECT id, name FROM yearbook_lecturers WHERE active = 1')
    .all();
  const surname = (name) => {
    const parts = String(name || '').trim().split(/\s+/);
    return parts[parts.length - 1] || '';
  };
  results.sort(
    (left, right) =>
      surname(left.name).localeCompare(surname(right.name)) ||
      String(left.name).localeCompare(String(right.name))
  );
  return json({ lecturers: results });
}

async function getProfiles(env) {
  const settings = await getSettings(env);
  if (settings.yearbook_published !== '1') {
    return json({
      profiles: [],
      coming_soon: true,
      message: 'The yearbook is coming soon. You can still submit your profile.',
    });
  }
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
  const settings = await getSettings(env);
  if (settings.yearbook_published !== '1') {
    return json({ error: 'The yearbook is coming soon.' }, 403);
  }
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

async function getMySubmission(request, env) {
  if (!(await checkRateLimit(env, request, 'identity', 10, 900))) {
    return json({ error: 'Too many attempts. Try again later.' }, 429);
  }

  const body = await request.json();
  const identity = await verifyPayload(body.token, env.SESSION_SECRET);
  if (!identity || identity.purpose !== 'identity') {
    return json({ error: 'Verify your name and registration number first.' }, 403);
  }

  const db = yearbookDb(env);
  const row = await db
    .prepare('SELECT * FROM yearbook_profiles WHERE roster_id = ?')
    .bind(identity.roster_id)
    .first();
  const receipt = await db
    .prepare('SELECT 1 FROM yearbook_ballot_receipts WHERE voter_roster_id = ?')
    .bind(identity.roster_id)
    .first();

  return json({
    ok: true,
    roster_id: identity.roster_id,
    roster_name: identity.name || '',
    profile: row
      ? {
          ...publicProfile(row),
          status: row.status,
          submitted_at: row.submitted_at,
        }
      : null,
    ballot_submitted: Boolean(receipt),
  });
}

async function validateMetadata(env, metadata) {
  const db = yearbookDb(env);
  const errors = {};

  const nickname = cleanText(metadata.nickname, 25);
  if (!nickname) errors.nickname = 'Required';

  const rawBirthDay = String(metadata.birth_day ?? '').trim();
  const birthDay = rawBirthDay === 'N/A' ? 0 : Number.parseInt(rawBirthDay, 10);
  if (!Number.isInteger(birthDay) || birthDay < 0 || birthDay > 31) {
    errors.birth_day = 'Invalid day';
  }

  const rawBirthMonth = String(metadata.birth_month ?? '').trim();
  const birthMonth = rawBirthMonth === 'N/A' ? 0 : Number.parseInt(rawBirthMonth, 10);
  if (!Number.isInteger(birthMonth) || birthMonth < 0 || birthMonth > 12) {
    errors.birth_month = 'Invalid month';
  }

  const stateOfOrigin = cleanText(metadata.state_of_origin, 40);
  if (!STATES.includes(stateOfOrigin)) errors.state_of_origin = 'Choose a state or International';

  const hometown = cleanText(metadata.hometown, 60);
  const headshotCaption = cleanText(metadata.headshot_caption, 80);
  const selfWords = cleanText(metadata.self_words, 60);
  const whatsapp = cleanText(metadata.whatsapp, 30);
  if (whatsapp && !/^[0-9+\-()\s]{7,30}$/.test(whatsapp)) {
    errors.whatsapp = 'Invalid phone number';
  }

  const hobby = cleanText(metadata.hobby, 40);
  if (!hobby) errors.hobby = 'Required';

  const sideSkill = cleanText(metadata.side_skill, 80);
  if (!sideSkill) errors.side_skill = 'Required';

  const instagram = cleanText(metadata.instagram, 100);
  const xHandle = cleanText(metadata.x_handle, 100);
  const linkedin = cleanText(metadata.linkedin, 150);
  const tiktok = cleanText(metadata.tiktok, 100);
  const facebook = cleanText(metadata.facebook, 150);
  const website = cleanText(metadata.website, 200);
  const classEmoji = cleanText(metadata.class_emoji, 8);
  const themeSong = cleanText(metadata.theme_song, 100);

  const courseRows = await db
    .prepare('SELECT code FROM yearbook_courses WHERE active = 1')
    .all();
  const courseSet = new Set(courseRows.results.map((row) => row.code));

  const favouriteCourse = cleanText(metadata.favourite_course, 20);
  if (favouriteCourse !== 'N/A' && !courseSet.has(favouriteCourse)) errors.favourite_course = 'Choose a course';

  const toughestCourse = cleanText(metadata.toughest_course, 20);
  if (toughestCourse !== 'N/A' && !courseSet.has(toughestCourse)) errors.toughest_course = 'Choose a course';

  const hardestLevel = cleanText(metadata.hardest_level, 10);
  if (!HARDEST_LEVELS.includes(hardestLevel)) errors.hardest_level = 'Choose a level';

  const lecturerRows = await db
    .prepare('SELECT id, name FROM yearbook_lecturers WHERE active = 1')
    .all();
  const lecturerById = new Map(lecturerRows.results.map((row) => [row.id, row.name]));
  const lecturerByName = new Set(lecturerRows.results.map((row) => row.name));
  const resolveLecturer = (value) => {
    const cleaned = cleanText(value, 100);
    if (!cleaned) return '';
    if (cleaned === 'N/A') return 'N/A';
    return lecturerById.get(cleaned) || (lecturerByName.has(cleaned) ? cleaned : '');
  };

  const favouriteLecturer = resolveLecturer(metadata.favourite_lecturer);
  if (!favouriteLecturer) errors.favourite_lecturer = 'Choose a lecturer';

  const mostTeachingLecturer = resolveLecturer(metadata.most_teaching_lecturer);

  const memorableMoment = cleanText(metadata.memorable_moment, 250);
  const classWord = cleanText(metadata.class_word, 20);
  if (!classWord) errors.class_word = 'Required';

  const motto = cleanText(metadata.motto, 150);
  if (!motto) errors.motto = 'Required';

  const classMessage = cleanText(metadata.class_message, 300);
  const unknownFact = cleanText(metadata.unknown_fact, 160);
  const futureSelf = cleanText(metadata.future_self, 160);
  const directionLine = cleanText(metadata.direction_line, 120);
  const relationshipStatus = cleanText(metadata.relationship_status, 30);

  const consentAccurate = boolValue(metadata.consent_accurate);
  if (!consentAccurate) errors.consent_accurate = 'Required';

  const showInYearbook =
    metadata.show_in_yearbook === undefined ? true : boolValue(metadata.show_in_yearbook);
  const includePhone =
    metadata.include_phone === undefined ? true : boolValue(metadata.include_phone);
  const showBirthday =
    metadata.show_birthday === undefined ? true : boolValue(metadata.show_birthday);

  const flags = [];
  if (
    memorableMoment.length > 200 ||
    classMessage.length > 240 ||
    unknownFact.length > 140 ||
    futureSelf.length > 140
  ) {
    flags.push('long_text');
  }
  const emojiText = [
    nickname,
    headshotCaption,
    selfWords,
    hobby,
    sideSkill,
    instagram,
    xHandle,
    linkedin,
    tiktok,
    facebook,
    website,
    themeSong,
    memorableMoment,
    classWord,
    motto,
    classMessage,
    unknownFact,
    futureSelf,
    directionLine,
  ].join(' ');
  if (/[\u{1F300}-\u{1FAFF}]/u.test(emojiText)) flags.push('emoji');

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    data: {
      nickname,
      birthDay,
      birthMonth,
      stateOfOrigin,
      hometown,
      headshotCaption,
      selfWords,
      whatsapp,
      hobby,
      sideSkill,
      instagram,
      xHandle,
      linkedin,
      tiktok,
      facebook,
      website,
      classEmoji,
      themeSong,
      favouriteCourse,
      toughestCourse,
      hardestLevel,
      favouriteLecturer,
      mostTeachingLecturer,
      memorableMoment,
      classWord,
      motto,
      classMessage,
      unknownFact,
      futureSelf,
      directionLine,
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

  const identityToken = typeof form.get('identity_token') === 'string' ? form.get('identity_token') : '';
  if (!(await checkRateLimit(env, request, 'profile-save', 20, 3600))) {
    return json({ error: 'Too many submissions. Try again later.' }, 429);
  }

  const identity = await verifyPayload(identityToken, env.SESSION_SECRET);
  if (!identity || identity.purpose !== 'identity') {
    return json({ error: 'Verify your name and registration number first.' }, 403);
  }
  const rosterId = identity.roster_id;
  const rosterName = identity.name || '';

  const submitted = await db
    .prepare('SELECT 1 FROM yearbook_profiles WHERE roster_id = ?')
    .bind(rosterId)
    .first();
  if (submitted) {
    return json(
      { error: 'You have already submitted a profile. Submissions are final.' },
      409
    );
  }

  const validation = await validateMetadata(env, metadata);
  if (!validation.ok) {
    return json({ error: 'Please check the form.', fields: validation.errors }, 400);
  }
  const data = validation.data;
  const displayName = formatRosterName(rosterName);
  if (!displayName) return badRequest('Your name could not be loaded from the class list.');

  const profileId = crypto.randomUUID();
  const headshotFile = form.get('headshot');
  if (!isFile(headshotFile)) return badRequest('A professional headshot is required.');

  const bucket = yearbookBucket(env);
  const uploadedKeys = [];
  let headshotKey = '';

  try {
    const uploaded = await uploadYearbookPhoto(env, headshotFile, 'headshots', profileId);
    uploadedKeys.push(uploaded.key);
    headshotKey = uploaded.key;
  } catch (error) {
    await Promise.allSettled(uploadedKeys.map((key) => bucket.delete(key)));
    return badRequest(error.message);
  }

  if (!headshotKey) {
    await Promise.allSettled(uploadedKeys.map((key) => bucket.delete(key)));
    return badRequest('A professional headshot is required.');
  }

  const status = settings.auto_publish === '1' ? 'approved' : 'pending';
  const nowIso = new Date().toISOString();
  const common = {
    status,
    display_name: displayName,
    nickname: data.nickname,
    birth_day: data.birthDay,
    birth_month: data.birthMonth,
    state_of_origin: data.stateOfOrigin,
    hometown: data.hometown,
    headshot_caption: data.headshotCaption,
    self_words: data.selfWords,
    whatsapp: data.whatsapp,
    whatsapp_opt_in: data.includePhone ? 1 : 0,
    hobby: data.hobby,
    side_skill: data.sideSkill,
    outside_tags: '[]',
    outside_line: data.sideSkill,
    unknown_fact: data.unknownFact,
    hobbies: JSON.stringify([data.hobby]),
    direction: '',
    direction_line: data.directionLine,
    favourite_course: data.favouriteCourse,
    toughest_course: data.toughestCourse,
    hardest_level: data.hardestLevel,
    favourite_lecturer: data.favouriteLecturer,
    most_teaching_lecturer: data.mostTeachingLecturer,
    memorable_moment: data.memorableMoment,
    class_word: data.classWord,
    motto: data.motto,
    class_emoji: data.classEmoji,
    theme_song: data.themeSong,
    future_self: data.futureSelf,
    instagram: data.instagram,
    x_handle: data.xHandle,
    linkedin: data.linkedin,
    tiktok: data.tiktok,
    facebook: data.facebook,
    website: data.website,
    social_platform: '',
    social_handle: '',
    class_message: data.classMessage,
    relationship_status: data.relationshipStatus,
    portrait_key: headshotKey,
    candid_key: '',
    department_photo_key: null,
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

  try {
    await insertRow(db, 'yearbook_profiles', {
      id: profileId,
      roster_id: rosterId,
      ...common,
      edit_token_hash: `disabled-${profileId}`,
    });
  } catch (error) {
    await Promise.allSettled(uploadedKeys.map((key) => bucket.delete(key)));
    throw error;
  }

  return json({
    ok: true,
    id: profileId,
    status,
    roster_name: rosterName,
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
  const db = yearbookDb(env);
  const { results } = await db
    .prepare('SELECT id, full_name FROM yearbook_roster WHERE active = 1 ORDER BY sort_name ASC')
    .all();
  return json(
    {
      enabled: settings.superlatives_enabled !== '0',
      categories: SUPERLATIVES,
      nominees: results.map((row) => ({ id: row.id, name: formatRosterName(row.full_name) })),
      results_published: settings.results_published === '1',
    },
    200,
    { 'cache-control': 'no-store' }
  );
}

async function saveBallot(request, env) {
  if (!(await checkRateLimit(env, request, 'ballot', 20, 3600))) {
    return json({ error: 'Too many requests. Try again later.' }, 429);
  }

  const body = await request.json();
  const identity = await verifyPayload(body.identity_token, env.SESSION_SECRET);
  if (!identity || identity.purpose !== 'identity') {
    return json({ error: 'Verify your name and registration number first.' }, 403);
  }

  const db = yearbookDb(env);
  const voterProfile = await db
    .prepare('SELECT 1 FROM yearbook_profiles WHERE roster_id = ?')
    .bind(identity.roster_id)
    .first();
  if (!voterProfile) {
    return json({ error: 'Submit your yearbook profile before filling superlatives.' }, 403);
  }

  const receipt = await db
    .prepare('SELECT 1 FROM yearbook_ballot_receipts WHERE voter_roster_id = ?')
    .bind(identity.roster_id)
    .first();
  if (receipt) {
    return json({ error: 'You have already submitted your superlatives ballot.' }, 409);
  }

  const { results: rosterRows } = await db
    .prepare('SELECT id FROM yearbook_roster WHERE active = 1')
    .all();
  const rosterIds = new Set(rosterRows.map((row) => row.id));
  const ballot = body.ballot && typeof body.ballot === 'object' ? body.ballot : {};
  const statements = [
    db
      .prepare('INSERT INTO yearbook_ballot_receipts (voter_roster_id) VALUES (?)')
      .bind(identity.roster_id),
  ];
  const errors = {};

  for (const category of SUPERLATIVES) {
    const nomineeId = cleanText(ballot[category.key], 100);
    if (!nomineeId) {
      errors[category.key] = 'Choose someone.';
      continue;
    }
    if (!rosterIds.has(nomineeId)) {
      errors[category.key] = 'Choose someone from the class list.';
      continue;
    }
    if (nomineeId === identity.roster_id) {
      errors[category.key] = 'You cannot vote for yourself.';
      continue;
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO yearbook_ballots (id, voter_roster_id, category, nominee_roster_id)
           VALUES (?, ?, ?, ?)`
        )
        .bind(crypto.randomUUID(), identity.roster_id, category.key, nomineeId)
    );
  }

  const suggestion = cleanText(body.suggestion, 160);
  if (suggestion) {
    statements.push(
      db
        .prepare(
          `INSERT INTO yearbook_award_ideas (id, voter_roster_id, suggestion)
           VALUES (?, ?, ?)
           ON CONFLICT(voter_roster_id) DO UPDATE SET suggestion = excluded.suggestion, created_at = datetime('now')`
        )
        .bind(crypto.randomUUID(), identity.roster_id, suggestion)
    );
  }

  if (Object.keys(errors).length) {
    return json({ error: 'Please check your ballot.', fields: errors }, 400);
  }

  try {
    await db.batch(statements);
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE')) {
      return json({ error: 'You have already submitted your superlatives ballot.' }, 409);
    }
    throw error;
  }

  return json({ ok: true, submitted: true, categories: SUPERLATIVES.length });
}
async function getResults(env, publicOnly) {
  const settings = await getSettings(env);
  if (publicOnly && settings.results_published !== '1') {
    return json({ published: false, results: [], suggestions: [] });
  }

  const db = yearbookDb(env);
  const { results } = await db
    .prepare(
      `SELECT b.category, b.nominee_roster_id, r.full_name, COUNT(*) AS votes
       FROM yearbook_ballots b
       JOIN yearbook_roster r ON r.id = b.nominee_roster_id
       GROUP BY b.category, b.nominee_roster_id
       ORDER BY b.category ASC, votes DESC, r.sort_name ASC`
    )
    .all();

  const grouped = new Map();
  for (const row of results) {
    if (!grouped.has(row.category)) grouped.set(row.category, []);
    grouped.get(row.category).push({
      roster_id: row.nominee_roster_id,
      name: formatRosterName(row.full_name),
      votes: Number(row.votes),
    });
  }

  const output = SUPERLATIVES.map((category) => ({
    category: category.key,
    label: category.label,
    nominees: (grouped.get(category.key) || []).slice(0, publicOnly ? 3 : 50),
  }));

  const ideas = await db
    .prepare(
      `SELECT a.suggestion, r.full_name
       FROM yearbook_award_ideas a
       JOIN yearbook_roster r ON r.id = a.voter_roster_id
       WHERE a.suggestion != ''
       ORDER BY a.created_at DESC`
    )
    .all();

  return json({
    published: true,
    results: output,
    suggestions: ideas.results
      .map((row) => ({ name: formatRosterName(row.full_name), suggestion: row.suggestion }))
      .slice(0, publicOnly ? 20 : 200),
  });
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
      roster_name: formatRosterName(row.roster_name),
      status: row.status,
      display_name: row.display_name,
      nickname: row.nickname,
      headshot_caption: row.headshot_caption || '',
      self_words: row.self_words || '',
      birth_day: row.birth_day,
      birth_month: row.birth_month,
      state_of_origin: row.state_of_origin,
      hometown: row.hometown || '',
      whatsapp: row.whatsapp || '',
      include_phone: row.include_phone === 1,
      show_in_yearbook: row.show_in_yearbook === 1,
      show_birthday: row.show_birthday === 1,
      hobby: row.hobby || parseJsonArray(row.hobbies)[0] || '',
      side_skill: row.side_skill || row.outside_line || '',
      instagram: row.instagram || legacySocialValue(row, 'Instagram'),
      x_handle: row.x_handle || legacySocialValue(row, 'X'),
      linkedin: row.linkedin || legacySocialValue(row, 'LinkedIn'),
      tiktok: row.tiktok || legacySocialValue(row, 'TikTok'),
      facebook: row.facebook || legacySocialValue(row, 'Facebook'),
      website:
        row.website ||
        (row.social_platform === 'Other' && /^https?:\/\//i.test(row.social_handle || '')
          ? row.social_handle
          : ''),
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
      class_emoji: row.class_emoji || '',
      motto: row.motto,
      theme_song: row.theme_song || '',
      future_self: row.future_self || '',
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
      headshot_url: imageUrl(row.portrait_key),
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
      'yearbook_published',
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
      .prepare('SELECT portrait_key, candid_key, department_photo_key, roster_id FROM yearbook_profiles WHERE id = ?')
      .bind(id)
      .first();
    if (!row) return notFound('Profile not found');

    const keys = [row.portrait_key, row.candid_key, row.department_photo_key].filter(Boolean);
    await Promise.allSettled(keys.map((key) => yearbookBucket(env).delete(key)));
    await db
      .prepare('DELETE FROM yearbook_ballots WHERE nominee_roster_id = ? OR voter_roster_id = ?')
      .bind(row.roster_id, row.roster_id)
      .run();
    await db.prepare('DELETE FROM yearbook_ballot_receipts WHERE voter_roster_id = ?').bind(row.roster_id).run();
    await db.prepare('DELETE FROM yearbook_award_ideas WHERE voter_roster_id = ?').bind(row.roster_id).run();
    await db.prepare('DELETE FROM yearbook_profiles WHERE id = ?').bind(id).run();
    return json({ ok: true });
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
    if (method === 'POST' && route === 'me') return await getMySubmission(request, env);
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
