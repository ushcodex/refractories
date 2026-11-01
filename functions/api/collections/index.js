import { badRequest, json, serverError } from '../../_lib/http.js';
import { cleanText } from '../../_lib/sanitize.js';

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, uploader_name, event_name, description, photo_count, created_at
       FROM collections
       ORDER BY created_at DESC`
    ).all();

    return json({ collections: results });
  } catch {
    return serverError();
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const id = cleanText(body.id, 100);
    const uploaderName = cleanText(body.uploader_name, 100);
    const eventName = cleanText(body.event_name, 200);
    const description = cleanText(body.description, 1000);

    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return badRequest('Invalid collection id');
    if (!uploaderName) return badRequest('Uploader name is required');

    const existing = await env.DB.prepare('SELECT id FROM collections WHERE id = ?')
      .bind(id)
      .first();
    if (existing) return badRequest('Collection already exists');

    await env.DB.prepare(
      `INSERT INTO collections (id, uploader_name, event_name, description, photo_count)
       VALUES (?, ?, ?, ?, 0)`
    )
      .bind(id, uploaderName, eventName, description)
      .run();

    return json({ success: true, id });
  } catch {
    return serverError();
  }
}
