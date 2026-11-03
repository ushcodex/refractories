import { createGateCookie, getGateSession, checkRateLimit } from '../_lib/gate.js';
import { json } from '../_lib/http.js';

const QUESTION =
  'Corona, Covid, ASUU, PTP, Chemistry, tested by heat, tested by time, tested by pressure? Who are we?';
const ANSWER = 'refractories';

function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  if (value === '/gate' || value.startsWith('/gate?')) return '/';
  return value;
}

export async function onRequestGet({ request, env }) {
  const session = await getGateSession(request, env);
  if (session.ok) return json({ authorized: true, siteKey: '', question: '' }, 200, { 'cache-control': 'no-store' });

  return json(
    { authorized: false, siteKey: '', question: QUESTION },
    200,
    { 'cache-control': 'no-store' }
  );
}

export async function onRequestPost({ request, env }) {
  try {
    if (!(await checkRateLimit(env, request, 'gate', 10, 900))) {
      return json({ error: 'Too many attempts. Try again later.' }, 429);
    }

    const body = await request.json();
    const answer = typeof body.answer === 'string' ? body.answer : '';

    if (!fuzzyMatch(answer, ANSWER, 0.7)) {
      return json({ error: 'Not quite. Try again.' }, 403);
    }

    const cookie = await createGateCookie(request, env);
    return json(
      { ok: true, next: safeNext(body.next) },
      200,
      { 'set-cookie': cookie, 'cache-control': 'no-store' }
    );
  } catch {
    return json({ error: 'Could not verify the answer.' }, 500);
  }
}

function fuzzyMatch(answer, target, threshold = 0.7) {
  const a = (answer || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const b = (target || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!a || !b) return false;
  const distance = levenshtein(a, b);
  const similarity = 1 - distance / Math.max(a.length, b.length);
  return similarity >= threshold;
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