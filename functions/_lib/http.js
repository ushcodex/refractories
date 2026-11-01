export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

export function text(message, status = 200, headers = {}) {
  return new Response(message, {
    status,
    headers: {
      'content-type': 'text/plain;charset=UTF-8',
      ...headers,
    },
  });
}

export function unauthorized() {
  return text('Unauthorized', 403);
}

export function notFound(message = 'Not found') {
  return text(message, 404);
}

export function badRequest(message = 'Bad request') {
  return text(message, 400);
}

export function serverError() {
  return text('Internal server error', 500);
}

export function intParam(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
