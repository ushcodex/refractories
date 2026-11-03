import { hashIp, signPayload, verifyPayload } from './yearbook.js';

export const GATE_COOKIE = 'yb_gate';

export function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

export async function getGateSession(request, env) {
  if (String(env.GATE_ENABLED) !== 'true') {
    return { ok: true, bypass: true };
  }

  const secret = env.SESSION_SECRET || '';
  if (!secret) return { ok: false };

  const token = parseCookies(request)[GATE_COOKIE];
  if (!token) return { ok: false };

  const payload = await verifyPayload(token, secret);
  if (!payload || payload.purpose !== 'gate') return { ok: false };
  return { ok: true, payload };
}

export async function createGateCookie(request, env) {
  const secret = env.SESSION_SECRET || '';
  if (!secret) throw new Error('SESSION_SECRET is not configured');

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    purpose: 'gate',
    iat: now,
    exp: now + 60 * 60 * 24 * 30,
    ip: await hashIp(env, request),
  };
  const token = await signPayload(payload, secret);
  return `${GATE_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
}

export function clearGateCookie() {
  return `${GATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
