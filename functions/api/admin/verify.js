import { adminCodeMatches } from '../../_lib/auth.js';
import { json, serverError } from '../../_lib/http.js';
import { cleanText } from '../../_lib/sanitize.js';

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const code = cleanText(body.code, 200);
    return json({ authorized: adminCodeMatches(code, env) });
  } catch {
    return serverError();
  }
}
