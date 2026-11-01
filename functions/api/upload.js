import { badRequest, json, serverError } from '../_lib/http.js';
import { detectImageType, envBytes } from '../_lib/images.js';
import { cleanFilename, cleanInteger, cleanText } from '../_lib/sanitize.js';

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function isFile(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.size === 'number' &&
    typeof value.arrayBuffer === 'function'
  );
}

function safeTaggedPeople(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) return '[]';
    return JSON.stringify(
      parsed.slice(0, 20).map((item) => cleanText(String(item), 60)).filter(Boolean)
    );
  } catch {
    return '[]';
  }
}

export async function onRequestPost({ request, env }) {
  let fullKey = null;
  let thumbKey = null;

  try {
    const form = await request.formData();
    const full = form.get('full');
    const thumb = form.get('thumb');
    const metadataRaw = form.get('metadata');

    if (!isFile(full) || !isFile(thumb) || typeof metadataRaw !== 'string') {
      return badRequest('Missing upload fields');
    }

    let metadata;
    try {
      metadata = JSON.parse(metadataRaw);
    } catch {
      return badRequest('Invalid metadata');
    }

    const id = cleanText(metadata.id, 100);
    const collectionId = cleanText(metadata.collection_id, 100);
    if (!SAFE_ID.test(id) || !SAFE_ID.test(collectionId)) {
      return badRequest('Invalid identifiers');
    }

    const collection = await env.DB.prepare(
      'SELECT id, photo_count FROM collections WHERE id = ?'
    )
      .bind(collectionId)
      .first();
    if (!collection) return badRequest('Collection not found');

    const maxBatch = envBytes(env, 'MAX_BATCH_SIZE', 200);
    if (Number(collection.photo_count || 0) >= maxBatch) {
      return badRequest('Collection batch limit reached');
    }

    const maxFileSize = envBytes(env, 'MAX_FILE_SIZE', 512000);
    if (full.size > maxFileSize) return badRequest('Full image is too large');
    if (thumb.size > 150000) return badRequest('Thumbnail is too large');

    const fullType = await detectImageType(full);
    const thumbType = await detectImageType(thumb);
    if (!fullType || !thumbType) return badRequest('Unsupported image type');

    const storageCap = envBytes(env, 'MAX_TOTAL_STORAGE_BYTES', 8589934592);
    const storage = await env.DB.prepare(
      'SELECT COALESCE(SUM(file_size), 0) AS total_size FROM photos'
    ).first();
    if (Number(storage?.total_size || 0) + full.size + thumb.size > storageCap) {
      return badRequest('Storage limit reached');
    }

    const year = cleanInteger(metadata.year_taken, new Date().getUTCFullYear());
    fullKey = `photos/${year}/${collectionId}/${id}`;
    thumbKey = `thumbs/${year}/${collectionId}/${id}`;

    await env.BUCKET.put(fullKey, full.stream(), {
      httpMetadata: { contentType: fullType },
    });
    await env.BUCKET.put(thumbKey, thumb.stream(), {
      httpMetadata: { contentType: thumbType },
    });

    try {
      await env.DB.prepare(
        `INSERT INTO photos (
          id, collection_id, r2_key, thumb_key, original_filename,
          file_size, thumb_size, width, height, date_taken, year_taken,
          camera_model, caption, tagged_people
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          id,
          collectionId,
          fullKey,
          thumbKey,
          cleanFilename(metadata.original_filename),
          full.size,
          thumb.size,
          Math.max(0, cleanInteger(metadata.width, 0)),
          Math.max(0, cleanInteger(metadata.height, 0)),
          cleanText(metadata.date_taken, 40) || null,
          year,
          cleanText(metadata.camera_model, 100) || null,
          cleanText(metadata.caption, 500),
          safeTaggedPeople(metadata.tagged_people)
        )
        .run();

      await env.DB.prepare(
        'UPDATE collections SET photo_count = COALESCE(photo_count, 0) + 1 WHERE id = ?'
      )
        .bind(collectionId)
        .run();
    } catch (error) {
      await Promise.allSettled([env.BUCKET.delete(fullKey), env.BUCKET.delete(thumbKey)]);
      throw error;
    }

    return json({ success: true, id, r2_key: fullKey, thumb_key: thumbKey });
  } catch {
    return serverError();
  }
}
