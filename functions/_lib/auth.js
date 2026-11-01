function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export function isAdmin(request, env) {
  const expected = typeof env.ADMIN_CODE === 'string' ? env.ADMIN_CODE : '';
  const provided = request.headers.get('X-Admin-Code') || '';
  if (!expected || !provided) return false;
  return constantTimeEqual(expected, provided);
}

export function adminCodeMatches(code, env) {
  const expected = typeof env.ADMIN_CODE === 'string' ? env.ADMIN_CODE : '';
  if (!expected || typeof code !== 'string' || !code) return false;
  return constantTimeEqual(expected, code);
}
