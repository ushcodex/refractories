import { isAdmin } from '../../_lib/auth.js';
import { badRequest, json, serverError, unauthorized } from '../../_lib/http.js';
import { cleanText } from '../../_lib/sanitize.js';

const REASONS = new Set([
  'Inappropriate Content',
  'Privacy Request',
  'Duplicate or Spam',
  'Wrong Class / Event',
  'Other',
]);

export async function onRequestGet({ request, env }) {
  if (!isAdmin(request, env)) return unauthorized();

  try {
    const { results } = await env.DB.prepare(
      `SELECT r.id AS report_id, r.photo_id, r.reason, r.details,
              r.created_at AS reported_at, p.thumb_key, p.original_filename,
              c.event_name, c.uploader_name
       FROM reports r
       JOIN photos p ON p.id = r.photo_id
       JOIN collections c ON c.id = p.collection_id
       ORDER BY r.created_at DESC`
    ).all();

    return json({ reports: results });
  } catch {
    return serverError();
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const photoId = cleanText(body.photo_id, 100);
    const reason = cleanText(body.reason, 100);
    const details = cleanText(body.details, 1000);

    if (!photoId) return badRequest('Photo id is required');
    if (!REASONS.has(reason)) return badRequest('Invalid report reason');

    const photo = await env.DB.prepare('SELECT id FROM photos WHERE id = ?')
      .bind(photoId)
      .first();
    if (!photo) return badRequest('Photo not found');

    const id = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO reports (id, photo_id, reason, details) VALUES (?, ?, ?, ?)'
    )
      .bind(id, photoId, reason, details)
      .run();

    return json({ success: true, id });
  } catch {
    return serverError();
  }
}
