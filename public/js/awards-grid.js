const MEDAL_SVG = `
  <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="60" cy="60" r="54" stroke="currentColor" stroke-width="1.5" opacity=".35"/>
    <circle cx="60" cy="60" r="44" stroke="currentColor" stroke-width="1" opacity=".25"/>
    <path d="M60 20l10.2 20.7 22.8 3.3-16.5 16.1 3.9 22.7L60 71.9 39.6 82.8l3.9-22.7-16.5-16.1 22.8-3.3L60 20z" fill="currentColor" opacity=".95"/>
    <path d="M44 92l-8 18 24-8 24 8-8-18" stroke="currentColor" stroke-width="2" opacity=".4"/>
  </svg>
`;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderAwardCard(award) {
  const card = document.createElement('a');
  card.className = `award-index-card${award.category_key === 'merit' ? ' award-index-card--merit' : ''}`;
  card.href = `/awards/${encodeURIComponent(award.slug)}`;
  card.innerHTML = `
    <div class="award-index-top">
      <span class="award-index-badge">${escapeHtml(award.category)}</span>
      <span class="award-index-icon">${MEDAL_SVG}</span>
    </div>
    <h3 class="award-index-title">${escapeHtml(award.title)}</h3>
    ${award.period ? `<p class="award-index-period">${escapeHtml(award.period)}</p>` : ''}
    <p class="award-index-recipient">${escapeHtml(award.recipient)}</p>
    <p class="award-index-citation">${escapeHtml(award.citation)}</p>
    <span class="award-index-link">View E-Award <span aria-hidden="true">→</span></span>
  `;
  return card;
}

async function loadAwards() {
  const votingGrid = document.getElementById('voting-awards-grid');
  const meritGrid = document.getElementById('merit-awards-grid');
  if (!votingGrid || !meritGrid) return;

  try {
    const response = await fetch('/awards/data.json', { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const awards = await response.json();
    const voting = awards.filter((award) => award.category_key === 'voting');
    const merit = awards.filter((award) => award.category_key === 'merit');

    votingGrid.innerHTML = '';
    meritGrid.innerHTML = '';
    voting.forEach((award) => votingGrid.appendChild(renderAwardCard(award)));
    merit.forEach((award) => meritGrid.appendChild(renderAwardCard(award)));

    document.getElementById('voting-count').textContent = `${voting.length} awards`;
    document.getElementById('merit-count').textContent = `${merit.length} awards`;
  } catch {
    const message = '<p class="text-secondary">Could not load the awards. Refresh the page and try again.</p>';
    votingGrid.innerHTML = message;
    meritGrid.innerHTML = message;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadAwards);
} else {
  loadAwards();
}
