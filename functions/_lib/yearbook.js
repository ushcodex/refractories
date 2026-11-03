const encoder = new TextEncoder();

export function yearbookDb(env) {
  return env.YEARBOOK_DB || env.DB;
}

export function yearbookBucket(env) {
  return env.YEARBOOK_BUCKET || env.BUCKET;
}

export function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function cleanArray(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(String(item), maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function randomToken(bytes = 32) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return base64UrlEncode(buffer);
}

export function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function hmacHex(secret, value) {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signPayload(payload, secret) {
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await hmacHex(secret, body);
  return `${body}.${signature}`;
}

export async function verifyPayload(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const expected = await hmacHex(secret, body);
  if (signature.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < signature.length; i++) {
    diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashRegNumber(env, regNumber) {
  const pepper = env.ROSTER_PEPPER || '';
  if (!pepper) throw new Error('ROSTER_PEPPER is not configured');
  const normalized = String(regNumber || '').toUpperCase().replace(/\s+/g, '');
  return hmacHex(pepper, normalized);
}

export function normalizeAnswer(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = new Array(b.length + 1);
  const current = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) previous[j] = j;

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j++) previous[j] = current[j];
  }
  return previous[b.length];
}

export function fuzzyMatch(answer, target, threshold = 0.7) {
  const a = normalizeAnswer(answer);
  const b = normalizeAnswer(target);
  if (!a || !b) return false;
  const distance = levenshtein(a, b);
  const similarity = 1 - distance / Math.max(a.length, b.length);
  return similarity >= threshold;
}

export function getClientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export async function hashIp(env, request) {
  const secret = env.SESSION_SECRET || '';
  if (!secret) return 'unknown';
  return hmacHex(secret, getClientIp(request));
}

export async function checkRateLimit(env, request, action, limit, windowSeconds) {
  const db = yearbookDb(env);
  const now = Math.floor(Date.now() / 1000);
  const bucket = now - (now % windowSeconds);
  const ipHash = await hashIp(env, request);
  const key = `${action}:${ipHash}:${bucket}`;

  await db
    .prepare('DELETE FROM yearbook_rate_limits WHERE expires_at < ?')
    .bind(now)
    .run();

  await db
    .prepare(
      `INSERT INTO yearbook_rate_limits (key, count, expires_at)
       VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = count + 1`
    )
    .bind(key, bucket + windowSeconds + 60)
    .run();

  const row = await db
    .prepare('SELECT count FROM yearbook_rate_limits WHERE key = ?')
    .bind(key)
    .first();

  return Number(row?.count || 0) <= limit;
}

export async function getSettings(env) {
  const db = yearbookDb(env);
  const { results } = await db.prepare('SELECT key, value FROM yearbook_settings').all();
  const settings = {};
  for (const row of results) settings[row.key] = row.value;
  return settings;
}

export async function getSetting(env, key, fallback = '') {
  const db = yearbookDb(env);
  const row = await db
    .prepare('SELECT value FROM yearbook_settings WHERE key = ?')
    .bind(key)
    .first();
  return row?.value ?? fallback;
}

export async function setSetting(env, key, value) {
  const db = yearbookDb(env);
  await db
    .prepare(
      `INSERT INTO yearbook_settings (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .bind(key, String(value))
    .run();
}

export function publicProfile(row, bucketBase = '/api/yearbook/image') {
  const profile = {
    id: row.id,
    display_name: row.display_name,
    nickname: row.nickname,
    state_of_origin: row.state_of_origin,
    hometown: row.hometown || '',
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
    portrait_url: `${bucketBase}/${row.portrait_key}`,
    candid_url: `${bucketBase}/${row.candid_key}`,
    department_photo_url: row.department_photo_key
      ? `${bucketBase}/${row.department_photo_key}`
      : '',
  };

  if (String(row.show_birthday) === '1') {
    profile.birth_day = row.birth_day;
    profile.birth_month = row.birth_month;
  }

  return profile;
}

export function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
