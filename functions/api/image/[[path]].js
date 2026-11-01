import { notFound, serverError } from '../../_lib/http.js';

function contentTypeForKey(key, object) {
  const fromMetadata = object?.httpMetadata?.contentType;
  if (fromMetadata) return fromMetadata;
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.webp')) return 'image/webp';
  if (key.endsWith('.heic')) return 'image/heic';
  return 'image/jpeg';
}

export async function onRequestGet({ params, env }) {
  try {
    const raw = Array.isArray(params.path) ? params.path.join('/') : params.path || '';
    const key = decodeURIComponent(raw);

    if (!key.startsWith('photos/') && !key.startsWith('thumbs/')) {
      return notFound('Image not found');
    }

    const object = await env.BUCKET.get(key);
    if (!object) return notFound('Image not found');

    const headers = new Headers();
    headers.set('content-type', contentTypeForKey(key, object));
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    if (object.etag) headers.set('etag', object.etag);
    if (object.size) headers.set('content-length', String(object.size));

    return new Response(object.body, { headers });
  } catch {
    return serverError();
  }
}
