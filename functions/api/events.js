import { json, serverError } from '../_lib/http.js';

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT DISTINCT event_name FROM collections WHERE event_name IS NOT NULL AND TRIM(event_name) != '' ORDER BY event_name ASC"
    ).all();

    return json({ events: results.map((row) => row.event_name) });
  } catch {
    return serverError();
  }
}
