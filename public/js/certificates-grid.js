const grid = document.getElementById('certificates-grid');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function certificateUrl(slug) {
  return `/certificates/${encodeURIComponent(slug)}`;
}

function renderCertificateCard(cert) {
  const detailUrl = certificateUrl(cert.slug);
  const card = document.createElement('article');
  card.className = 'yb-panel yb-profile-card';
  card.tabIndex = 0;
  card.setAttribute('role', 'link');
  card.setAttribute('aria-label', `View certificate for ${cert.name}`);

  card.innerHTML = `
    <div style="position: relative; aspect-ratio: 4 / 5; background: var(--bg-tertiary); border-radius: 14px; overflow: hidden; border: 1px solid var(--border);">
      <img src="/certificates/img/${encodeURIComponent(cert.slug)}_thumb.webp" alt="${escapeHtml(cert.name)}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover;">
      <div style="position: absolute; inset: 0; background: rgba(7,7,12,0.6); opacity: 0; transition: opacity 0.2s ease;">
        <div style="position: absolute; top: 0; left: 0; right: 0; padding: 24px;">
          <h3 style="margin: 0 0 8px; color: var(--accent); font-size: 1.1rem;">${escapeHtml(cert.name)}</h3>
          <p style="margin: 0; color: var(--text-secondary); font-size: 0.85rem;">${escapeHtml(cert.role)}</p>
        </div>
        <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 12px;">
          <span class="btn btn-secondary btn-sm" style="width: 100%; display: block; text-align: center;">View Certificate</span>
        </div>
      </div>
    </div>
    <div style="padding: 12px 16px;">
      <h3 style="margin: 0 0 6px; font-size: 0.95rem;">${escapeHtml(cert.name)}</h3>
      <p style="margin: 0 0 8px; font-size: 0.82rem; color: var(--accent);">${escapeHtml(cert.role)}</p>
      <p style="margin: 0; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5;">${escapeHtml(cert.description)}</p>
      <div style="margin-top: 10px; display: flex; gap: 6px; flex-wrap: wrap;">
        <a href="${detailUrl}" class="yb-tag" style="background: rgba(232,168,56,0.12); color: var(--accent); font-size: 0.75rem; padding: 4px 8px;">View Certificate</a>
        <a href="/certificates/pdf/${encodeURIComponent(cert.slug)}.pdf" download class="yb-tag" style="background: rgba(232,168,56,0.12); color: var(--accent); font-size: 0.75rem; padding: 4px 8px;">Download PDF</a>
      </div>
    </div>
  `;

  card.addEventListener('click', (event) => {
    if (event.target.closest('a')) return;
    window.location.href = detailUrl;
  });

  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      window.location.href = detailUrl;
    }
  });

  grid.appendChild(card);
}

async function loadCertificates() {
  if (!grid) return;
  grid.innerHTML = '<p class="text-secondary" style="grid-column: 1 / -1;">Loading certificates…</p>';

  try {
    const response = await fetch('/certificates/data.json', { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const certificates = await response.json();
    grid.innerHTML = '';
    certificates.forEach(renderCertificateCard);
  } catch (error) {
    grid.innerHTML = '<p class="text-secondary" style="grid-column: 1 / -1;">Could not load the certificates. Refresh the page and try again.</p>';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadCertificates);
} else {
  loadCertificates();
}
