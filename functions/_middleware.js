import { getGateSession } from './_lib/gate.js';

const PUBLIC_PREFIXES = ['/css/', '/js/'];
const PUBLIC_PATHS = new Set([
  '/gate',
  '/gate.html',
  '/api/gate',
  '/manifest.json',
  '/favicon.ico',
  '/robots.txt',
]);

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;

  if (PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return context.next();
  }

  const session = await getGateSession(context.request, context.env);
  if (session.ok) return context.next();

  if (path.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Gate required' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const next = `${path}${url.search}`;
  return Response.redirect(`${url.origin}/gate?next=${encodeURIComponent(next)}`, 302);
}
