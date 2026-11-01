// ═══════════════════════════════════════════════════════
// The Refractories Photo Bank — Upload Queue Manager
// Handles batch uploads (up to 200) without bricking
// ═══════════════════════════════════════════════════════

import { CONFIG } from './config.js';
import { compressImage, extractExif } from './compression.js';
import { generateId, formatBytes, showToast, apiFetch } from './utils.js';

/**
 * UploadManager — manages the entire upload lifecycle
 * 
 * Usage:
 *   const manager = new UploadManager({ onProgress, onComplete, onError });
 *   manager.setCollection({ uploaderName, eventName, description });
 *   manager.addFiles(fileList);
 *   manager.start();
 */
export class UploadManager {
  constructor(callbacks = {}) {
    this.callbacks = {
      onFileAdded: callbacks.onFileAdded || (() => {}),
      onFileRemoved: callbacks.onFileRemoved || (() => {}),
      onProcessing: callbacks.onProcessing || (() => {}),
      onProgress: callbacks.onProgress || (() => {}),
      onFileComplete: callbacks.onFileComplete || (() => {}),
      onFileError: callbacks.onFileError || (() => {}),
      onAllComplete: callbacks.onAllComplete || (() => {}),
      onStatsUpdate: callbacks.onStatsUpdate || (() => {}),
    };

    this.files = new Map();         // id → FileEntry
    this.queue = [];                // IDs pending upload
    this.activeUploads = 0;
    this.collectionId = null;
    this.collectionMeta = {};
    this.isUploading = false;
    this.isPaused = false;

    // Stats
    this.stats = {
      total: 0,
      completed: 0,
      failed: 0,
      processing: 0,
      totalBytes: 0,
      uploadedBytes: 0,
    };
  }

  /**
   * Set collection metadata (uploader name, event, description)
   */
  setCollection(meta) {
    this.collectionMeta = meta;
    this.collectionId = generateId();
  }

  /**
   * Add files from a FileList or array
   */
  addFiles(fileList) {
    const files = Array.from(fileList);

    // Validate
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    const rejected = files.length - imageFiles.length;
    if (rejected > 0) {
      showToast(`${rejected} non-image file(s) skipped`, 'warning');
    }

    const remaining = CONFIG.MAX_BATCH_SIZE - this.files.size;
    const toAdd = imageFiles.slice(0, remaining);
    if (imageFiles.length > remaining) {
      showToast(`Only ${remaining} more images can be added (max ${CONFIG.MAX_BATCH_SIZE})`, 'warning');
    }

    for (const file of toAdd) {
      const id = generateId();
      const entry = {
        id,
        file,
        name: file.name,
        originalSize: file.size,
        status: 'pending',    // pending | processing | uploading | success | error
        progress: 0,
        error: null,
        previewUrl: null,
        exif: null,
        compressedSize: 0,
        retries: 0,
      };

      // Create preview URL
      entry.previewUrl = URL.createObjectURL(file);

      this.files.set(id, entry);
      this.stats.total++;
      this.stats.totalBytes += file.size;

      this.callbacks.onFileAdded(entry);
    }

    this.updateStats();
    return toAdd.length;
  }

  /**
   * Remove a file before upload starts
   */
  removeFile(id) {
    const entry = this.files.get(id);
    if (!entry) return;

    if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
    if (entry.status === 'pending') {
      this.stats.total--;
      this.stats.totalBytes -= entry.originalSize;
    }

    this.files.delete(id);
    this.queue = this.queue.filter(qId => qId !== id);
    this.callbacks.onFileRemoved(id);
    this.updateStats();
  }

  /**
   * Clear all files
   */
  clearAll() {
    for (const [id, entry] of this.files) {
      if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
    }
    this.files.clear();
    this.queue = [];
    this.stats = { total: 0, completed: 0, failed: 0, processing: 0, totalBytes: 0, uploadedBytes: 0 };
    this.updateStats();
  }

  /**
   * Start the upload process
   */
  async start() {
    if (this.isUploading) return;
    if (this.files.size === 0) {
      showToast('No files to upload', 'warning');
      return;
    }

    this.isUploading = true;
    this.isPaused = false;

    // Create the collection on the server first
    try {
      await this.createCollection();
    } catch (err) {
      showToast(`Failed to create collection: ${err.message}`, 'error');
      this.isUploading = false;
      return;
    }

    // Build the queue from all pending files
    this.queue = [];
    for (const [id, entry] of this.files) {
      if (entry.status === 'pending' || entry.status === 'error') {
        entry.status = 'pending';
        entry.progress = 0;
        entry.error = null;
        this.queue.push(id);
      }
    }

    // Start processing slots
    this.processQueue();
  }

  /**
   * Pause uploads
   */
  pause() {
    this.isPaused = true;
  }

  /**
   * Resume uploads
   */
  resume() {
    this.isPaused = false;
    this.processQueue();
  }

  /**
   * Retry all failed uploads
   */
  retryFailed() {
    for (const [id, entry] of this.files) {
      if (entry.status === 'error') {
        entry.status = 'pending';
        entry.progress = 0;
        entry.error = null;
        entry.retries++;
        this.queue.push(id);
        this.stats.failed--;
      }
    }
    this.updateStats();
    if (!this.isPaused) this.processQueue();
  }

  // ─── Internal Methods ───

  /**
   * Create the collection record on the server
   */
  async createCollection() {
    await apiFetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: this.collectionId,
        uploader_name: this.collectionMeta.uploaderName || 'Anonymous',
        event_name: this.collectionMeta.eventName || '',
        description: this.collectionMeta.description || '',
      }),
    });
  }

  /**
   * Process the queue — spawn concurrent workers up to the limit
   */
  processQueue() {
    while (
      this.activeUploads < CONFIG.CONCURRENT_UPLOADS &&
      this.queue.length > 0 &&
      !this.isPaused
    ) {
      const id = this.queue.shift();
      this.processFile(id);
    }

    // Check if all done
    if (this.activeUploads === 0 && this.queue.length === 0 && this.isUploading) {
      this.isUploading = false;
      this.callbacks.onAllComplete(this.stats);
    }
  }

  /**
   * Process a single file: extract EXIF → compress → upload
   */
  async processFile(id) {
    const entry = this.files.get(id);
    if (!entry) return;

    this.activeUploads++;

    try {
      // ── Phase 1: Extract EXIF ──
      entry.status = 'processing';
      this.stats.processing++;
      this.callbacks.onProcessing(entry);
      this.updateStats();

      entry.exif = await extractExif(entry.file);

      // ── Phase 2: Compress ──
      entry.progress = 10;
      this.callbacks.onProgress(entry);

      const { fullBlob, thumbBlob, width, height } = await compressImage(entry.file);
      entry.compressedSize = fullBlob.size;

      entry.progress = 40;
      this.callbacks.onProgress(entry);

      // ── Phase 3: Upload ──
      entry.status = 'uploading';
      this.stats.processing--;

      const photoId = generateId();
      const yearStr = entry.exif.yearTaken || new Date().getFullYear();
      const r2Key = `photos/${yearStr}/${this.collectionId}/${photoId}`;
      const thumbKey = `thumbs/${yearStr}/${this.collectionId}/${photoId}`;

      // Build FormData
      const formData = new FormData();
      formData.append('full', fullBlob, `${photoId}.jpg`);
      formData.append('thumb', thumbBlob, `${photoId}_thumb.jpg`);
      formData.append('metadata', JSON.stringify({
        id: photoId,
        collection_id: this.collectionId,
        r2_key: r2Key,
        thumb_key: thumbKey,
        original_filename: entry.name,
        file_size: fullBlob.size,
        thumb_size: thumbBlob.size,
        width,
        height,
        date_taken: entry.exif.dateTaken || null,
        year_taken: entry.exif.yearTaken || null,
        camera_model: entry.exif.cameraModel || null,
        caption: '',
        tagged_people: '[]',
      }));

      entry.progress = 50;
      this.callbacks.onProgress(entry);

      // Use XMLHttpRequest for upload progress
      await this.uploadWithProgress(formData, entry);

      // ── Success ──
      entry.status = 'success';
      entry.progress = 100;
      this.stats.completed++;
      this.stats.uploadedBytes += entry.compressedSize;
      this.callbacks.onFileComplete(entry);

    } catch (err) {
      entry.status = 'error';
      entry.error = err.message;
      this.stats.failed++;
      if (entry.status === 'processing') this.stats.processing--;
      this.callbacks.onFileError(entry, err);

      // Auto-retry
      if (entry.retries < CONFIG.RETRY_ATTEMPTS) {
        entry.retries++;
        entry.status = 'pending';
        this.stats.failed--;
        this.queue.push(id);
      }
    }

    this.activeUploads--;
    this.updateStats();
    this.processQueue();
  }

  /**
   * Upload FormData with XMLHttpRequest for progress tracking
   */
  uploadWithProgress(formData, entry) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          // Map upload progress to 50%-95% of total progress
          const uploadPercent = (e.loaded / e.total) * 45;
          entry.progress = 50 + uploadPercent;
          this.callbacks.onProgress(entry);
          this.updateStats();
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error')));
      xhr.addEventListener('timeout', () => reject(new Error('Upload timeout')));

      xhr.open('POST', '/api/upload');
      xhr.timeout = 60000; // 60s timeout per file
      xhr.send(formData);
    });
  }

  /**
   * Update aggregate stats and notify callback
   */
  updateStats() {
    this.callbacks.onStatsUpdate({ ...this.stats });
  }

  /**
   * Get current stats
   */
  getStats() {
    return { ...this.stats };
  }
}
