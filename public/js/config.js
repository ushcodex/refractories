// ═══════════════════════════════════════════════════════
// The Refractories Photo Bank — Configuration
// ═══════════════════════════════════════════════════════

export const CONFIG = {
  // API base (empty = same origin, Pages Functions handle routing)
  API_BASE: '',

  // Compression
  MAX_SIZE_PX: 2000,          // Longest side in pixels
  TARGET_FILE_SIZE_KB: 200,   // Target compressed size
  MAX_FILE_SIZE_KB: 500,      // Reject if still over this after compression
  THUMB_SIZE_PX: 400,         // Thumbnail longest side
  THUMB_QUALITY: 0.6,         // Thumbnail JPEG quality
  OUTPUT_FORMAT: 'image/jpeg', // jpeg for widest compatibility
  FALLBACK_FORMAT: 'image/jpeg',

  // Storage safety limits
  MAX_STORAGE_BYTES: 8589934592, // 8GB safety cap

  // Upload queue
  CONCURRENT_UPLOADS: 3,      // Parallel upload slots
  MAX_BATCH_SIZE: 200,        // Max images per session
  RETRY_ATTEMPTS: 2,          // Auto-retry failed uploads

  // Gallery
  PAGE_SIZE: 30,              // Images per page load
  LAZY_LOAD_MARGIN: '300px',  // IntersectionObserver rootMargin

  // Access
  ACCESS_CODE_KEY: 'refractories_access',
  ADMIN_CODE_KEY: 'refractories_admin',

  // App info
  APP_NAME: 'The Refractories',
  APP_SUBTITLE: 'U19 Chemical Engineering · ABU Zaria · Class of 2024',
  APP_DESCRIPTION: 'Our shared photo memories, from inception to graduation.',
};
