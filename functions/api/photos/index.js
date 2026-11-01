import { intParam, json, serverError } from '../../_lib/http.js';
import { cleanText } from '../../_lib/sanitize.js';

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const page = intParam(url.searchParams.get('page'), 1, 1, 100000);
    const limit = intParam(url.searchParams.get('limit'), 30, 1, 100);
    const year = cleanText(url.searchParams.get('year'), 10);
    const event = cleanText(url.searchParams.get('event'), 200);
    const search = cleanText(url.searchParams.get('search'), 100);

    const where = [];
    const binds = [];

    if (year) {
      where.push('p.year_taken = ?');
      binds.push(Number.parseInt(year, 10));
    }
    if (event) {
      where.push('c.event_name = ?');
      binds.push(event);
    }
    if (search) {
      const pattern = `%${search}%`;
      where.push('(p.original_filename LIKE ? OR c.event_name LIKE ? OR c.uploader_name LIKE ?)');
      binds.push(pattern, pattern, pattern);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const { results } = await env.DB.prepare(
      `SELECT p.*, c.uploader_name, c.event_name, c.description AS collection_description
       FROM photos p
       JOIN collections c ON c.id = p.collection_id
       ${whereSql}
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT ? OFFSET ?`
    )
      .bind(...binds, limit + 1, offset)
      .all();

    const hasMore = results.length > limit;
    const photos = hasMore ? results.slice(0, limit) : results;

    return json({ photos, page, limit, hasMore });
  } catch {
    return serverError();
  }
}
