import { isAdmin } from '../../_lib/auth.js';
import { json, notFound, serverError, unauthorized } from '../../_lib/http.js';

export async function onRequestGet({ params, env }) {
  try {
    const photo = await env.DB.prepare(
      `SELECT p.*, c.uploader_name, c.event_name
       FROM photos p
       JOIN collections c ON c.id = p.collection_id
       WHERE p.id = ?`
    )
      .bind(params.id)
      .first();

    if (!photo) return notFound('Photo not found');
    return json(photo);
  } catch {
    return serverError();
  }
}

export async function onRequestDelete({ request, params, env }) {
  if (!isAdmin(request, env)) return unauthorized();

  try {
    const photo = await env.DB.prepare(
      'SELECT id, collection_id, r2_key, thumb_key FROM photos WHERE id = ?'
    )
      .bind(params.id)
      .first();

    if (!photo) return notFound('Photo not found');

    await Promise.allSettled([
      env.BUCKET.delete(photo.r2_key),
      env.BUCKET.delete(photo.thumb_key),
    ]);

    await env.DB.prepare('DELETE FROM reports WHERE photo_id = ?').bind(photo.id).run();
    await env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(photo.id).run();
    await env.DB.prepare(
      'UPDATE collections SET photo_count = MAX(COALESCE(photo_count, 0) - 1, 0) WHERE id = ?'
    )
      .bind(photo.collection_id)
      .run();

    return json({ success: true });
  } catch {
    return serverError();
  }
}
