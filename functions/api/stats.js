import { json, serverError } from '../_lib/http.js';

export async function onRequestGet({ env }) {
  try {
    const [photos, collections, contributors, years] = await Promise.all([
      env.DB.prepare(
        'SELECT COUNT(*) AS total_photos, COALESCE(SUM(file_size), 0) AS total_size FROM photos'
      ).first(),
      env.DB.prepare('SELECT COUNT(*) AS total_collections FROM collections').first(),
      env.DB.prepare(
        'SELECT COUNT(DISTINCT uploader_name) AS total_contributors FROM collections'
      ).first(),
      env.DB.prepare(
        'SELECT COUNT(DISTINCT year_taken) AS years_covered FROM photos WHERE year_taken IS NOT NULL'
      ).first(),
    ]);

    return json({
      total_photos: Number(photos?.total_photos || 0),
      total_collections: Number(collections?.total_collections || 0),
      total_contributors: Number(contributors?.total_contributors || 0),
      years_covered: Number(years?.years_covered || 0),
      total_size: Number(photos?.total_size || 0),
    });
  } catch {
    return serverError();
  }
}
