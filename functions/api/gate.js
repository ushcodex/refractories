import { createGateCookie, getGateSession } from '../_lib/gate.js';
import { checkRateLimit, fuzzyMatch } from '../_lib/yearbook.js';
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
  if (session.ok) return json({ authorized: true, question: '' }, 200, { 'cache-control': 'no-store' });

  return json(
    { authorized: false, question: QUESTION },
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