// ═══════════════════════════════════════════════════════
// The Refractories Photo Bank — Lightbox Viewer
// Full-screen image view with download, share, navigation
// ═══════════════════════════════════════════════════════

import { escapeHtml, formatDate, showToast, ICONS } from './utils.js';

/**
 * LightboxController — full-screen photo viewer
 */
export class LightboxController {
  constructor() {
    this.isOpen = false;
    this.currentIndex = 0;
    this.photos = [];
    this.currentPhoto = null;

    this.createDOM();
    this.bindEvents();
  }

  /**
   * Create the lightbox DOM structure
   */
  createDOM() {
    this.el = document.createElement('div');
    this.el.className = 'lightbox';
    this.el.id = 'lightbox';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Photo viewer');

    this.el.innerHTML = `
      <div class="lightbox-header">
        <div class="lightbox-info">
          <span class="lb-event" id="lb-event"></span>
          <span class="lb-meta" id="lb-meta"></span>
        </div>
        <div class="lightbox-actions">
          <button class="lightbox-btn" id="lb-download" title="Download">${ICONS.download}</button>
          <button class="lightbox-btn" id="lb-share" title="Share">${ICONS.share}</button>
          <button class="lightbox-btn" id="lb-report" title="Report this photo">${ICONS.flag}</button>
          <button class="lightbox-btn" id="lb-close" title="Close">${ICONS.close}</button>
        </div>
      </div>

      <div class="lightbox-body" id="lb-body">
        <button class="lightbox-nav prev" id="lb-prev" title="Previous">${ICONS.chevronLeft}</button>
        <img id="lb-image" src="" alt="Full size photo" draggable="false">
        <button class="lightbox-nav next" id="lb-next" title="Next">${ICONS.chevronRight}</button>
      </div>

      <div class="lightbox-counter" id="lb-counter"></div>

      <!-- Report Modal -->
      <div class="modal-backdrop" id="report-modal-backdrop"></div>
      <div class="modal" id="report-modal">
        <h3>🚩 Report Photo</h3>
        <p class="text-secondary" style="font-size: 0.85rem; margin-bottom: 16px;">
          Flag this photo for admin review and removal if inappropriate or uploaded by mistake.
        </p>
        <div class="form-group">
          <label class="form-label" for="report-reason">Reason</label>
          <select class="form-select" id="report-reason">
            <option value="Inappropriate Content">Inappropriate / NSFW Content</option>
            <option value="Privacy Request">Privacy / Remove my picture</option>
            <option value="Duplicate or Spam">Duplicate / Spam</option>
            <option value="Wrong Class / Event">Wrong Class / Not Class of 2024</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="report-details">Additional details (optional)</label>
          <textarea class="form-textarea" id="report-details" rows="2" placeholder="Describe the issue..."></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" id="report-cancel-btn">Cancel</button>
          <button class="btn btn-danger btn-sm" id="report-submit-btn">Submit Report</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.el);
  }

  /**
   * Bind all event listeners
   */
  bindEvents() {
    // Close button
    this.el.querySelector('#lb-close').addEventListener('click', () => this.close());

    // Navigation
    this.el.querySelector('#lb-prev').addEventListener('click', (e) => {
      e.stopPropagation();
      this.prev();
    });
    this.el.querySelector('#lb-next').addEventListener('click', (e) => {
      e.stopPropagation();
      this.next();
    });

    // Download
    this.el.querySelector('#lb-download').addEventListener('click', () => this.download());

    // Share
    this.el.querySelector('#lb-share').addEventListener('click', () => this.share());

    // Report
    this.el.querySelector('#lb-report').addEventListener('click', () => this.openReportModal());
    this.el.querySelector('#report-cancel-btn').addEventListener('click', () => this.closeReportModal());
    this.el.querySelector('#report-modal-backdrop').addEventListener('click', () => this.closeReportModal());
    this.el.querySelector('#report-submit-btn').addEventListener('click', () => this.submitReport());

    // Click on body backdrop = close
    this.el.querySelector('#lb-body').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.close();
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      switch (e.key) {
        case 'Escape': this.close(); break;
        case 'ArrowLeft': this.prev(); break;
        case 'ArrowRight': this.next(); break;
      }
    });

    // Touch swipe
    let touchStartX = 0;
    let touchStartY = 0;

    this.el.querySelector('#lb-body').addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    this.el.querySelector('#lb-body').addEventListener('touchend', (e) => {
      const deltaX = e.changedTouches[0].clientX - touchStartX;
      const deltaY = e.changedTouches[0].clientY - touchStartY;

      // Only trigger if horizontal swipe is dominant
      if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX > 0) this.prev();
        else this.next();
      }
    }, { passive: true });
  }

  /**
   * Open the lightbox with a specific photo
   */
  open(photo, index, photos) {
    this.currentPhoto = photo;
    this.currentIndex = index;
    this.photos = photos;

    this.updateView();

    this.el.classList.add('open');
    this.isOpen = true;
    document.body.style.overflow = 'hidden';
  }

  /**
   * Close the lightbox
   */
  close() {
    this.el.classList.remove('open');
    this.isOpen = false;
    document.body.style.overflow = '';

    // Clear image to free memory
    setTimeout(() => {
      this.el.querySelector('#lb-image').src = '';
    }, 300);
  }

  /**
   * Navigate to previous photo
   */
  prev() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.currentPhoto = this.photos[this.currentIndex];
      this.updateView();
    }
  }

  /**
   * Navigate to next photo
   */
  next() {
    if (this.currentIndex < this.photos.length - 1) {
      this.currentIndex++;
      this.currentPhoto = this.photos[this.currentIndex];
      this.updateView();
    }
  }

  /**
   * Update the lightbox view with current photo data
   */
  updateView() {
    const photo = this.currentPhoto;
    if (!photo) return;

    const img = this.el.querySelector('#lb-image');
    const eventEl = this.el.querySelector('#lb-event');
    const metaEl = this.el.querySelector('#lb-meta');
    const counterEl = this.el.querySelector('#lb-counter');

    // Load full-size image
    img.src = `/api/image/${photo.r2_key}`;
    img.alt = photo.original_filename || 'Photo';

    // Update info
    eventEl.textContent = photo.event_name || photo.original_filename || 'Photo';

    const metaParts = [];
    if (photo.date_taken) metaParts.push(formatDate(photo.date_taken));
    if (photo.camera_model) metaParts.push(photo.camera_model);
    if (photo.uploader_name) metaParts.push(`by ${photo.uploader_name}`);
    metaEl.textContent = metaParts.join(' · ');

    // Update counter
    counterEl.textContent = `${this.currentIndex + 1} / ${this.photos.length}`;

    // Update nav button visibility
    this.el.querySelector('#lb-prev').style.visibility = this.currentIndex > 0 ? 'visible' : 'hidden';
    this.el.querySelector('#lb-next').style.visibility = this.currentIndex < this.photos.length - 1 ? 'visible' : 'hidden';
  }

  /**
   * Download the current photo
   */
  async download() {
    const photo = this.currentPhoto;
    if (!photo) return;

    try {
      const response = await fetch(`/api/image/${photo.r2_key}`);
      const blob = await response.blob();

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = photo.original_filename || `refractories_${photo.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);

      showToast('Photo downloaded!', 'success');
    } catch {
      showToast('Download failed', 'error');
    }
  }

  /**
   * Share the current photo using Web Share API or WhatsApp fallback
   */
  async share() {
    const photo = this.currentPhoto;
    if (!photo) return;

    const shareUrl = `${window.location.origin}/?photo=${photo.id}`;
    const shareTitle = `${photo.event_name || 'Photo'} — The Refractories`;
    const shareText = `Check out this photo from The Refractories Photo Bank!`;

    // Try Web Share API first (works great on mobile)
    if (navigator.share) {
      try {
        // Try sharing with image file
        const response = await fetch(`/api/image/${photo.r2_key}`);
        const blob = await response.blob();
        const file = new File([blob], photo.original_filename || 'photo.jpg', { type: blob.type });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: shareTitle,
            text: shareText,
            files: [file],
          });
        } else {
          await navigator.share({
            title: shareTitle,
            text: shareText,
            url: shareUrl,
          });
        }
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // User cancelled
      }
    }

    // Fallback: copy link + show WhatsApp option
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link copied! Opening WhatsApp...', 'success');

      // Open WhatsApp share
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + '\n' + shareUrl)}`;
      window.open(waUrl, '_blank');
    } catch {
      // Last resort: prompt
      prompt('Copy this link to share:', shareUrl);
    }
  }

  /**
   * Open Report Modal
   */
  openReportModal() {
    const backdrop = this.el.querySelector('#report-modal-backdrop');
    const modal = this.el.querySelector('#report-modal');
    if (backdrop && modal) {
      backdrop.classList.add('open');
      modal.classList.add('open');
    }
  }

  /**
   * Close Report Modal
   */
  closeReportModal() {
    const backdrop = this.el.querySelector('#report-modal-backdrop');
    const modal = this.el.querySelector('#report-modal');
    if (backdrop && modal) {
      backdrop.classList.remove('open');
      modal.classList.remove('open');
      this.el.querySelector('#report-details').value = '';
    }
  }

  /**
   * Submit photo report
   */
  async submitReport() {
    if (!this.currentPhoto) return;

    const reason = this.el.querySelector('#report-reason').value;
    const details = this.el.querySelector('#report-details').value.trim();
    const submitBtn = this.el.querySelector('#report-submit-btn');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photo_id: this.currentPhoto.id,
          reason,
          details,
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      showToast('Photo reported. An admin will review it.', 'warning', 4000);
      this.closeReportModal();
    } catch (err) {
      showToast(`Report failed: ${err.message}`, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Report';
    }
  }
}
