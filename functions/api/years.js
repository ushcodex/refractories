import { json, serverError } from '../_lib/http.js';

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT DISTINCT year_taken AS year FROM photos WHERE year_taken IS NOT NULL ORDER BY year_taken DESC'
    ).all();

    return json({ years: results.map((row) => Number(row.year)) });
  } catch {
    return serverError();
  }
}
