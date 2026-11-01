// ═══════════════════════════════════════════════════════
// The Refractories Photo Bank — Image Compression & EXIF
// Client-side image processing: compress, thumbnail, EXIF
// ═══════════════════════════════════════════════════════

import { CONFIG } from './config.js';

/**
 * Extract useful EXIF metadata from an image file.
 * We extract date taken, camera model, and strip GPS data.
 * Uses a minimal inline EXIF parser (no external library).
 */
export async function extractExif(file) {
  const result = {
    dateTaken: null,
    yearTaken: null,
    cameraModel: null,
    cameraMake: null,
  };

  try {
    const buffer = await file.slice(0, 128 * 1024).arrayBuffer(); // Read first 128KB
    const view = new DataView(buffer);

    // Check for JPEG SOI marker
    if (view.getUint16(0) !== 0xFFD8) return result;

    let offset = 2;
    while (offset < view.byteLength - 4) {
      const marker = view.getUint16(offset);
      if (marker === 0xFFE1) {
        // APP1 (EXIF)
        const length = view.getUint16(offset + 2);
        const exifData = parseExifSegment(view, offset + 4, length - 2);
        Object.assign(result, exifData);
        break;
      }
      // Skip to next marker
      const segLength = view.getUint16(offset + 2);
      offset += 2 + segLength;
    }
  } catch {
    // EXIF extraction is best-effort; don't fail the upload
  }

  return result;
}

/**
 * Parse the EXIF APP1 segment to extract date and camera info
 */
function parseExifSegment(view, offset, length) {
  const result = {};

  try {
    // Check for "Exif\0\0"
    const exifHeader = String.fromCharCode(
      view.getUint8(offset), view.getUint8(offset + 1),
      view.getUint8(offset + 2), view.getUint8(offset + 3)
    );
    if (exifHeader !== 'Exif') return result;

    const tiffStart = offset + 6;
    const byteOrder = view.getUint16(tiffStart);
    const littleEndian = byteOrder === 0x4949; // 'II'

    // Verify TIFF magic number
    if (view.getUint16(tiffStart + 2, littleEndian) !== 0x002A) return result;

    const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);
    
    // Parse IFD0
    parseIFD(view, tiffStart, ifd0Offset, littleEndian, result);
  } catch {
    // Silently handle malformed EXIF
  }

  // Post-process: extract year from date
  if (result.dateTaken) {
    const match = result.dateTaken.match(/^(\d{4})/);
    if (match) result.yearTaken = parseInt(match[1]);
  }

  return result;
}

/**
 * Parse an IFD (Image File Directory)
 */
function parseIFD(view, tiffStart, ifdOffset, littleEndian, result) {
  try {
    const absOffset = tiffStart + ifdOffset;
    if (absOffset + 2 > view.byteLength) return;
    
    const entryCount = view.getUint16(absOffset, littleEndian);

    for (let i = 0; i < entryCount; i++) {
      const entryOffset = absOffset + 2 + (i * 12);
      if (entryOffset + 12 > view.byteLength) break;

      const tag = view.getUint16(entryOffset, littleEndian);
      const type = view.getUint16(entryOffset + 2, littleEndian);
      const count = view.getUint32(entryOffset + 4, littleEndian);

      // Tag 0x010F = Make, 0x0110 = Model
      if (tag === 0x010F || tag === 0x0110) {
        const str = readExifString(view, tiffStart, entryOffset, type, count, littleEndian);
        if (tag === 0x010F) result.cameraMake = str;
        if (tag === 0x0110) result.cameraModel = str;
      }

      // Tag 0x8769 = ExifIFD pointer
      if (tag === 0x8769) {
        const exifIfdOffset = view.getUint32(entryOffset + 8, littleEndian);
        parseExifSubIFD(view, tiffStart, exifIfdOffset, littleEndian, result);
      }
    }
  } catch {
    // Best-effort
  }
}

/**
 * Parse the Exif SubIFD for DateTimeOriginal
 */
function parseExifSubIFD(view, tiffStart, ifdOffset, littleEndian, result) {
  try {
    const absOffset = tiffStart + ifdOffset;
    if (absOffset + 2 > view.byteLength) return;

    const entryCount = view.getUint16(absOffset, littleEndian);

    for (let i = 0; i < entryCount; i++) {
      const entryOffset = absOffset + 2 + (i * 12);
      if (entryOffset + 12 > view.byteLength) break;

      const tag = view.getUint16(entryOffset, littleEndian);
      const type = view.getUint16(entryOffset + 2, littleEndian);
      const count = view.getUint32(entryOffset + 4, littleEndian);

      // Tag 0x9003 = DateTimeOriginal, 0x9004 = DateTimeDigitized
      if (tag === 0x9003 || (tag === 0x9004 && !result.dateTaken)) {
        const dateStr = readExifString(view, tiffStart, entryOffset, type, count, littleEndian);
        if (dateStr) {
          // Convert "2023:06:15 14:30:00" → "2023-06-15T14:30:00"
          result.dateTaken = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(' ', 'T');
        }
      }
    }
  } catch {
    // Best-effort
  }
}

/**
 * Read a string value from an EXIF IFD entry
 */
function readExifString(view, tiffStart, entryOffset, type, count, littleEndian) {
  if (type !== 2) return null; // Type 2 = ASCII

  let strOffset;
  if (count <= 4) {
    strOffset = entryOffset + 8;
  } else {
    strOffset = tiffStart + view.getUint32(entryOffset + 8, littleEndian);
  }

  if (strOffset + count > view.byteLength) return null;

  let str = '';
  for (let j = 0; j < count - 1; j++) {
    str += String.fromCharCode(view.getUint8(strOffset + j));
  }
  return str.trim();
}

/**
 * Compress an image file to the target specifications.
 * Returns { fullBlob, thumbBlob, width, height }
 */
export async function compressImage(file) {
  // Load the image into a bitmap
  const imageBitmap = await createImageBitmap(file);
  const origW = imageBitmap.width;
  const origH = imageBitmap.height;

  // Calculate dimensions: longest side = MAX_SIZE_PX
  const maxPx = CONFIG.MAX_SIZE_PX;
  let fullW, fullH;
  if (origW >= origH) {
    if (origW <= maxPx) {
      fullW = origW;
      fullH = origH;
    } else {
      fullW = maxPx;
      fullH = Math.round((origH / origW) * maxPx);
    }
  } else {
    if (origH <= maxPx) {
      fullW = origW;
      fullH = origH;
    } else {
      fullH = maxPx;
      fullW = Math.round((origW / origH) * maxPx);
    }
  }

  // Generate full-size compressed image
  const fullBlob = await resizeAndCompress(imageBitmap, fullW, fullH, CONFIG.TARGET_FILE_SIZE_KB);

  // Generate thumbnail
  const thumbMaxPx = CONFIG.THUMB_SIZE_PX;
  let thumbW, thumbH;
  if (fullW >= fullH) {
    thumbW = thumbMaxPx;
    thumbH = Math.round((fullH / fullW) * thumbMaxPx);
  } else {
    thumbH = thumbMaxPx;
    thumbW = Math.round((fullW / fullH) * thumbMaxPx);
  }

  const thumbBlob = await resizeAndCompress(imageBitmap, thumbW, thumbH, 50, CONFIG.THUMB_QUALITY);

  imageBitmap.close();

  return {
    fullBlob,
    thumbBlob,
    width: fullW,
    height: fullH,
  };
}

/**
 * Resize an ImageBitmap and compress to target file size
 */
async function resizeAndCompress(imageBitmap, width, height, targetKB, initialQuality = 0.82) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, 0, 0, width, height);

  // Try WebP first, fall back to JPEG
  let format = CONFIG.OUTPUT_FORMAT;
  let blob;

  try {
    blob = await canvas.convertToBlob({ type: format, quality: initialQuality });
  } catch {
    format = CONFIG.FALLBACK_FORMAT;
    blob = await canvas.convertToBlob({ type: format, quality: initialQuality });
  }

  // If too large, iteratively reduce quality
  let quality = initialQuality;
  const targetBytes = targetKB * 1024;
  let attempts = 0;

  while (blob.size > targetBytes && quality > 0.3 && attempts < 6) {
    quality -= 0.08;
    attempts++;
    try {
      blob = await canvas.convertToBlob({ type: format, quality });
    } catch {
      break;
    }
  }

  return blob;
}

/**
 * Create a preview URL for a file (for showing in the UI before upload)
 */
export function createPreviewUrl(file) {
  return URL.createObjectURL(file);
}

/**
 * Revoke a preview URL to free memory
 */
export function revokePreviewUrl(url) {
  URL.revokeObjectURL(url);
}
