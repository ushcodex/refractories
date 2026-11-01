// ═══════════════════════════════════════════════════════
// The Refractories Photo Bank — Gallery Controller
// Lazy-loading grid with filters, search, bulk download, & select mode
// ═══════════════════════════════════════════════════════

import { CONFIG } from './config.js';
import { apiFetch, debounce, escapeHtml, formatDate, showToast, ICONS } from './utils.js';

/**
 * GalleryController — manages the photo grid, filtering, pagination, and bulk downloads
 */
export class GalleryController {
  constructor({ gridEl, filterBarEl, statsEl, emptyEl, loadingEl, bulkToolbarEl, onPhotoClick }) {
    this.gridEl = gridEl;
    this.filterBarEl = filterBarEl;
    this.statsEl = statsEl;
    this.emptyEl = emptyEl;
    this.loadingEl = loadingEl;
    this.bulkToolbarEl = bulkToolbarEl;
    this.onPhotoClick = onPhotoClick;

    this.photos = [];
    this.allPhotos = [];    // Full fetched list
    this.page = 1;
    this.hasMore = true;
    this.isLoading = false;

    // Selection mode state
    this.isSelectMode = false;
    this.selectedPhotoIds = new Set();

    // Filters
    this.filters = {
      year: '',
      event: '',
      search: '',
    };

    // Available filter options (populated from API)
    this.years = [];
    this.events = [];

    this.setupIntersectionObserver();
    this.bindBulkToolbarEvents();
  }

  /**
   * Initialize: fetch filter options and first page of photos
   */
  async init() {
    await Promise.all([
      this.fetchFilterOptions(),
      this.loadMore(),
      this.fetchStats(),
    ]);
  }

  /**
   * Fetch available years and events for filter dropdowns
   */
  async fetchFilterOptions() {
    try {
      const [yearsRes, eventsRes] = await Promise.all([
        apiFetch('/api/years'),
        apiFetch('/api/events'),
      ]);
      this.years = yearsRes.years || [];
      this.events = eventsRes.events || [];
      this.renderFilterBar();
    } catch {
      // Filters will just be empty
    }
  }

  /**
   * Fetch aggregate stats
   */
  async fetchStats() {
    try {
      const stats = await apiFetch('/api/stats');
      if (this.statsEl) {
        this.statsEl.innerHTML = `
          <div class="stat-item">
            <div class="stat-value">${stats.total_photos || 0}</div>
            <div class="stat-label">Photos</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${stats.total_collections || 0}</div>
            <div class="stat-label">Collections</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${stats.total_contributors || 0}</div>
            <div class="stat-label">Contributors</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${stats.years_covered || 0}</div>
            <div class="stat-label">Years Covered</div>
          </div>
        `;
      }
    } catch {
      // Stats are non-critical
    }
  }

  /**
   * Render filter bar with year/event dropdowns, search, and bulk download action
   */
  renderFilterBar() {
    if (!this.filterBarEl) return;

    this.filterBarEl.innerHTML = `
      <div class="search-input-wrap">
        ${ICONS.search}
        <input type="text" class="search-input" id="gallery-search" 
               placeholder="Search events, uploaders..." 
               value="${escapeHtml(this.filters.search)}">
      </div>

      <select class="filter-select" id="filter-year">
        <option value="">All Years</option>
        ${this.years.map(y => `<option value="${y}" ${this.filters.year == y ? 'selected' : ''}>${y}</option>`).join('')}
      </select>

      <select class="filter-select" id="filter-event">
        <option value="">All Events</option>
        ${this.events.map(e => `<option value="${escapeHtml(e)}" ${this.filters.event === e ? 'selected' : ''}>${escapeHtml(e)}</option>`).join('')}
      </select>

      <button class="filter-chip" id="bulk-toggle-btn" title="Select multiple photos">
        ${ICONS.checkSquare}
        <span>${this.isSelectMode ? 'Cancel Select' : 'Select'}</span>
      </button>

      <button class="filter-chip" id="download-album-btn" title="Download all current photos as ZIP">
        ${ICONS.archive}
        <span>Download ZIP</span>
      </button>
    `;

    // Bind filter bar events
    const searchInput = this.filterBarEl.querySelector('#gallery-search');
    const yearSelect = this.filterBarEl.querySelector('#filter-year');
    const eventSelect = this.filterBarEl.querySelector('#filter-event');
    const bulkToggleBtn = this.filterBarEl.querySelector('#bulk-toggle-btn');
    const downloadAlbumBtn = this.filterBarEl.querySelector('#download-album-btn');

    searchInput.addEventListener('input', debounce((e) => {
      this.filters.search = e.target.value;
      this.resetAndReload();
    }, 400));

    yearSelect.addEventListener('change', (e) => {
      this.filters.year = e.target.value;
      this.resetAndReload();
    });

    eventSelect.addEventListener('change', (e) => {
      this.filters.event = e.target.value;
      this.resetAndReload();
    });

    bulkToggleBtn.addEventListener('click', () => {
      this.toggleSelectMode();
    });

    downloadAlbumBtn.addEventListener('click', () => {
      this.downloadAlbumAsZip();
    });
  }

  /**
   * Reset pagination and reload with current filters
   */
  resetAndReload() {
    this.photos = [];
    this.allPhotos = [];
    this.selectedPhotoIds.clear();
    this.updateBulkToolbarUI();
    this.page = 1;
    this.hasMore = true;
    this.gridEl.innerHTML = '';
    this.loadMore();
  }

  /**
   * Load the next page of photos
   */
  async loadMore() {
    if (this.isLoading || !this.hasMore) return;

    this.isLoading = true;
    this.showLoading(true);

    try {
      const params = new URLSearchParams({
        page: this.page,
        limit: CONFIG.PAGE_SIZE,
      });

      if (this.filters.year) params.set('year', this.filters.year);
      if (this.filters.event) params.set('event', this.filters.event);
      if (this.filters.search) params.set('search', this.filters.search);

      const data = await apiFetch(`/api/photos?${params}`);
      const newPhotos = data.photos || [];

      if (newPhotos.length < CONFIG.PAGE_SIZE) {
        this.hasMore = false;
      }

      this.photos.push(...newPhotos);
      this.allPhotos = this.photos;
      this.renderPhotos(newPhotos);
      this.page++;

      // Show/hide empty state
      if (this.photos.length === 0) {
        this.showEmpty(true);
      } else {
        this.showEmpty(false);
      }
    } catch (err) {
      console.error('Failed to load photos:', err);
    }

    this.isLoading = false;
    this.showLoading(false);
  }

  /**
   * Render a batch of photo cards into the grid
   */
  renderPhotos(photos) {
    const fragment = document.createDocumentFragment();

    photos.forEach((photo, i) => {
      const card = document.createElement('div');
      card.className = 'photo-card';
      card.style.animationDelay = `${i * 30}ms`;
      card.dataset.photoId = photo.id;
      card.dataset.index = this.photos.indexOf(photo);

      // Event info for overlay
      const eventName = photo.event_name || '';
      const dateStr = photo.date_taken ? formatDate(photo.date_taken) : '';
      const isSelected = this.selectedPhotoIds.has(photo.id);

      card.innerHTML = `
        <div class="photo-select-checkbox ${this.isSelectMode ? 'visible' : ''} ${isSelected ? 'checked' : ''}">
          ${isSelected ? ICONS.check : ''}
        </div>
        <img data-src="/api/image/${photo.thumb_key}" 
             alt="${escapeHtml(photo.original_filename || 'Photo')}"
             loading="lazy">
        <div class="photo-overlay">
          ${eventName ? `<span class="photo-event">${escapeHtml(eventName)}</span>` : ''}
          ${dateStr ? `<span class="photo-date">${dateStr}</span>` : ''}
        </div>
      `;

      card.addEventListener('click', () => {
        if (this.isSelectMode) {
          this.togglePhotoSelection(photo.id, card);
        } else {
          const idx = parseInt(card.dataset.index);
          this.onPhotoClick(photo, idx, this.allPhotos);
        }
      });

      // Observe for lazy loading
      this.observer.observe(card);

      fragment.appendChild(card);
    });

    this.gridEl.appendChild(fragment);
  }

  /**
   * Toggle multi-selection mode
   */
  toggleSelectMode() {
    this.isSelectMode = !this.isSelectMode;

    const checkboxes = this.gridEl.querySelectorAll('.photo-select-checkbox');
    checkboxes.forEach(cb => {
      if (this.isSelectMode) cb.classList.add('visible');
      else cb.classList.remove('visible');
    });

    if (!this.isSelectMode) {
      this.selectedPhotoIds.clear();
      checkboxes.forEach(cb => {
        cb.classList.remove('checked');
        cb.innerHTML = '';
      });
    }

    this.updateBulkToolbarUI();
    this.renderFilterBar();
  }

  /**
   * Toggle single photo selection
   */
  togglePhotoSelection(photoId, card) {
    const checkbox = card.querySelector('.photo-select-checkbox');
    if (this.selectedPhotoIds.has(photoId)) {
      this.selectedPhotoIds.delete(photoId);
      if (checkbox) {
        checkbox.classList.remove('checked');
        checkbox.innerHTML = '';
      }
    } else {
      this.selectedPhotoIds.add(photoId);
      if (checkbox) {
        checkbox.classList.add('checked');
        checkbox.innerHTML = ICONS.check;
      }
    }

    this.updateBulkToolbarUI();
  }

  /**
   * Update bulk toolbar appearance
   */
  updateBulkToolbarUI() {
    if (!this.bulkToolbarEl) return;

    const count = this.selectedPhotoIds.size;
    const countEl = this.bulkToolbarEl.querySelector('#bulk-selected-count');
    const downloadBtn = this.bulkToolbarEl.querySelector('#bulk-download-btn');

    if (this.isSelectMode && count > 0) {
      this.bulkToolbarEl.style.display = 'flex';
      if (countEl) countEl.textContent = `${count} photo${count !== 1 ? 's' : ''} selected`;
      if (downloadBtn) downloadBtn.innerHTML = `${ICONS.archive} Download ZIP (${count})`;
    } else if (this.isSelectMode) {
      this.bulkToolbarEl.style.display = 'flex';
      if (countEl) countEl.textContent = '0 selected';
      if (downloadBtn) downloadBtn.innerHTML = `${ICONS.archive} Download ZIP`;
    } else {
      this.bulkToolbarEl.style.display = 'none';
    }
  }

  /**
   * Bind bulk toolbar buttons
   */
  bindBulkToolbarEvents() {
    if (!this.bulkToolbarEl) return;

    const selectAllBtn = this.bulkToolbarEl.querySelector('#bulk-select-all-btn');
    const downloadBtn = this.bulkToolbarEl.querySelector('#bulk-download-btn');
    const cancelBtn = this.bulkToolbarEl.querySelector('#bulk-cancel-btn');

    selectAllBtn?.addEventListener('click', () => {
      this.photos.forEach(p => this.selectedPhotoIds.add(p.id));
      this.gridEl.querySelectorAll('.photo-select-checkbox').forEach(cb => {
        cb.classList.add('checked');
        cb.innerHTML = ICONS.check;
      });
      this.updateBulkToolbarUI();
    });

    downloadBtn?.addEventListener('click', () => {
      if (this.selectedPhotoIds.size === 0) {
        showToast('Please select at least 1 photo', 'warning');
        return;
      }
      const selected = this.photos.filter(p => this.selectedPhotoIds.has(p.id));
      this.createAndDownloadZip(selected, 'Selected_Photos');
    });

    cancelBtn?.addEventListener('click', () => {
      this.toggleSelectMode();
    });
  }

  /**
   * Download entire active album / filtered view as ZIP
   */
  downloadAlbumAsZip() {
    if (this.photos.length === 0) {
      showToast('No photos to download', 'warning');
      return;
    }

    let archiveName = 'Refractories_Album';
    if (this.filters.event) archiveName = `Refractories_${this.filters.event.replace(/[^a-zA-Z0-9]/g, '_')}`;
    else if (this.filters.year) archiveName = `Refractories_${this.filters.year}`;

    this.createAndDownloadZip(this.photos, archiveName);
  }

  /**
   * Create and trigger ZIP download using JSZip
   */
  async createAndDownloadZip(photoList, zipName = 'Refractories_Photos') {
    if (typeof JSZip === 'undefined') {
      showToast('Loading ZIP engine, please wait...', 'info');
      try {
        await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      } catch {
        showToast('Failed to load ZIP library. Please check your internet connection.', 'error');
        return;
      }
    }

    const zip = new JSZip();
    const total = photoList.length;
    showToast(`Preparing ZIP archive for ${total} photo(s)...`, 'info', 4000);

    let completed = 0;
    const concurrency = 4; // Fetch 4 images concurrently

    // Helper to fetch in pools
    const fetchPool = async () => {
      const queue = [...photoList];
      const workers = Array(concurrency).fill(0).map(async () => {
        while (queue.length > 0) {
          const photo = queue.shift();
          try {
            const res = await fetch(`/api/image/${photo.r2_key}`);
            const blob = await res.blob();
            const ext = blob.type === 'image/jpeg' ? 'jpg' : 'webp';
            const filename = photo.original_filename || `${photo.event_name || 'photo'}_${photo.id}.${ext}`;
            zip.file(filename, blob);
            completed++;
          } catch (err) {
            console.error(`Failed to fetch photo ${photo.id}:`, err);
          }
        }
      });
      await Promise.all(workers);
    };

    try {
      await fetchPool();
      showToast(`Generating ZIP file (${completed}/${total} files)...`, 'info', 3000);

      const content = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 4 },
      });

      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${zipName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(`ZIP downloaded successfully! 🎉`, 'success', 5000);
      if (this.isSelectMode) this.toggleSelectMode();
    } catch (err) {
      showToast(`Bulk download failed: ${err.message}`, 'error');
    }
  }

  /**
   * Helper to load external scripts on demand
   */
  loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  /**
   * Setup IntersectionObserver for lazy loading images
   * and triggering infinite scroll
   */
  setupIntersectionObserver() {
    // Image lazy loading observer
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target.querySelector('img[data-src]');
          if (img) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
            img.addEventListener('error', () => {
              // Show placeholder on error
              img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200" fill="%231a1a24"%3E%3Crect width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" fill="%233a3a44" text-anchor="middle" dy=".3em" font-size="14"%3E📷%3C/text%3E%3C/svg%3E';
            });
          }
          this.observer.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: CONFIG.LAZY_LOAD_MARGIN,
      threshold: 0.01,
    });

    // Infinite scroll sentinel
    this.scrollObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && this.hasMore && !this.isLoading) {
        this.loadMore();
      }
    }, {
      rootMargin: '500px',
    });

    // Create sentinel element
    const sentinel = document.createElement('div');
    sentinel.id = 'scroll-sentinel';
    sentinel.style.height = '1px';
    this.gridEl.parentNode.appendChild(sentinel);
    this.scrollObserver.observe(sentinel);
  }

  /**
   * Show/hide loading spinner
   */
  showLoading(show) {
    if (this.loadingEl) {
      this.loadingEl.style.display = show ? 'flex' : 'none';
    }
  }

  /**
   * Show/hide empty state
   */
  showEmpty(show) {
    if (this.emptyEl) {
      this.emptyEl.style.display = show ? 'block' : 'none';
    }
  }
}
