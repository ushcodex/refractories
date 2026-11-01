import { isAdmin } from '../../_lib/auth.js';
import { json, notFound, serverError, unauthorized } from '../../_lib/http.js';

export async function onRequestDelete({ request, params, env }) {
  if (!isAdmin(request, env)) return unauthorized();

  try {
    const report = await env.DB.prepare('SELECT id FROM reports WHERE id = ?')
      .bind(params.id)
      .first();
    if (!report) return notFound('Report not found');

    await env.DB.prepare('DELETE FROM reports WHERE id = ?').bind(params.id).run();
    return json({ success: true });
  } catch {
    return serverError();
  }
}
