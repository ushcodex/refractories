function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}

function monthName(month) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return months[Number(month) - 1] || '';
}

async function request(path) {
  const response = await fetch(path, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    const error = new Error(`Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function renderCard(profile) {
  const card = document.createElement('a');
  card.className = 'yb-profile-card';
  card.href = `/yearbook.html?id=${encodeURIComponent(profile.id)}`;

  if (profile.portrait_url) {
    const img = document.createElement('img');
    img.src = profile.portrait_url;
    img.alt = profile.display_name;
    img.loading = 'lazy';
    card.appendChild(img);
  } else {
    const placeholder = el('div', '', '');
    placeholder.style.aspectRatio = '4 / 5';
    placeholder.style.display = 'grid';
    placeholder.style.placeItems = 'center';
    placeholder.style.background = 'var(--bg-tertiary)';
    placeholder.style.color = 'var(--text-secondary)';
    placeholder.style.fontSize = '0.8rem';
    placeholder.textContent = 'No portrait';
    card.appendChild(placeholder);
  }

  const body = el('div', 'yb-profile-card-body');
  body.appendChild(el('h3', '', profile.display_name));
  body.appendChild(el('p', '', profile.nickname || ''));
  body.appendChild(el('p', '', profile.state_of_origin || ''));
  if (profile.class_word) {
    const word = el('p', '', profile.class_word);
    word.style.color = 'var(--accent)';
    word.style.marginTop = '8px';
    body.appendChild(word);
  }
  card.appendChild(body);
  return card;
}

function addFact(container, label, value) {
  if (!value) return;
  const fact = el('div', 'yb-fact');
  fact.appendChild(el('span', '', label));
  fact.appendChild(el('strong', '', value));
  container.appendChild(fact);
}

function addSection(container, title, text) {
  if (!text) return;
  const section = el('div', 'yb-panel');
  section.appendChild(el('h2', '', title));
  const paragraph = el('p', 'text-secondary', text);
  paragraph.style.lineHeight = '1.7';
  paragraph.style.margin = '8px 0 0';
  section.appendChild(paragraph);
  container.appendChild(section);
}

async function loadProfile(id) {
  const loading = document.getElementById('yearbook-loading');
  const home = document.getElementById('yearbook-home');
  const detail = document.getElementById('profile-detail');
  const content = document.getElementById('profile-detail-content');

  loading.style.display = 'none';
  home.style.display = 'none';
  detail.style.display = 'block';

  try {
    const [profile, coursesData] = await Promise.all([
      request(`/api/yearbook/profile/${encodeURIComponent(id)}`),
      request('/api/yearbook/courses').catch(() => ({ courses: [] })),
    ]);
    const courseMap = new Map((coursesData.courses || []).map((course) => [course.code, course]));
    const courseLabel = (code) => {
      const course = courseMap.get(code);
      return course ? `${course.code} — ${course.title}` : code;
    };

    const hero = el('div', 'yb-profile-hero');
    if (profile.portrait_url) {
      const img = document.createElement('img');
      img.src = profile.portrait_url;
      img.alt = profile.display_name;
      hero.appendChild(img);
    } else {
      const placeholder = el('div', '', 'No portrait');
      placeholder.style.aspectRatio = '4 / 5';
      placeholder.style.display = 'grid';
      placeholder.style.placeItems = 'center';
      placeholder.style.background = 'var(--bg-tertiary)';
      placeholder.style.borderRadius = '20px';
      placeholder.style.color = 'var(--text-secondary)';
      hero.appendChild(placeholder);
    }

    const meta = el('div', 'yb-profile-meta');
    meta.appendChild(el('p', 'yb-eyebrow', 'Class of 2024'));
    meta.appendChild(el('h1', '', profile.display_name));
    if (profile.nickname) meta.appendChild(el('p', 'nickname', profile.nickname));

    if (Array.isArray(profile.outside_tags) && profile.outside_tags.length) {
      const tags = el('div', 'yb-tag-list');
      for (const tag of profile.outside_tags) tags.appendChild(el('span', 'yb-tag', tag));
      meta.appendChild(tags);
    }

    const facts = el('div', 'yb-facts');
    addFact(facts, 'State of origin', profile.state_of_origin);
    addFact(facts, 'Hometown', profile.hometown);
    if (profile.birth_day && profile.birth_month) {
      addFact(facts, 'Birthday', `${profile.birth_day} ${monthName(profile.birth_month)}`);
    }
    addFact(facts, 'Favourite course', courseLabel(profile.favourite_course));
    addFact(facts, 'Toughest course', courseLabel(profile.toughest_course));
    addFact(facts, 'Hardest level', profile.hardest_level);
    addFact(facts, 'Favourite lecturer', profile.favourite_lecturer);
    addFact(facts, 'Most teaching lecturer', profile.most_teaching_lecturer);
    addFact(facts, 'Direction', profile.direction);
    addFact(facts, 'Class word', profile.class_word);
    addFact(facts, 'Motto', profile.motto);
    if (profile.social_platform && profile.social_handle) {
      addFact(facts, 'Social', `${profile.social_platform}: ${profile.social_handle}`);
    }
    if (profile.relationship_status) addFact(facts, 'Relationship status', profile.relationship_status);
    meta.appendChild(facts);

    hero.appendChild(meta);
    content.appendChild(hero);

    addSection(content, 'Outside class', profile.outside_line);
    addSection(content, 'One thing people may not know', profile.unknown_fact);
    if (Array.isArray(profile.hobbies) && profile.hobbies.length) {
      addSection(content, 'Hobbies', profile.hobbies.join(' · '));
    }
    addSection(content, 'Direction', profile.direction_line);
    addSection(content, 'A memorable class moment', profile.memorable_moment);
    addSection(content, 'A message to the class', profile.class_message);

    const photos = [];
    if (profile.candid_url) photos.push({ src: profile.candid_url, label: 'Candid' });
    if (profile.department_photo_url) photos.push({ src: profile.department_photo_url, label: 'Department' });
    if (photos.length) {
      const panel = el('div', 'yb-panel');
      panel.appendChild(el('h2', '', 'More photos'));
      const grid = el('div', 'yb-photo-grid');
      grid.style.marginTop = '14px';
      for (const photo of photos) {
        const box = el('div', 'yb-photo-box');
        box.style.cursor = 'default';
        const img = document.createElement('img');
        img.src = photo.src;
        img.alt = photo.label;
        img.loading = 'lazy';
        box.appendChild(img);
        grid.appendChild(box);
      }
      panel.appendChild(grid);
      content.appendChild(panel);
    }
  } catch (error) {
    content.innerHTML = '';
    const panel = el('div', 'yb-panel text-center');
    panel.appendChild(el('h2', '', 'Profile not found'));
    panel.appendChild(el('p', 'text-secondary', 'This profile may not be published yet.'));
    const link = el('a', 'btn btn-secondary', 'Back to the yearbook');
    link.href = '/yearbook.html';
    link.style.marginTop = '14px';
    panel.appendChild(link);
    content.appendChild(panel);
  }
}

async function loadGrid() {
  const loading = document.getElementById('yearbook-loading');
  const empty = document.getElementById('yearbook-empty');
  const grid = document.getElementById('yearbook-grid');

  try {
    const data = await request('/api/yearbook/profiles');
    const profiles = data.profiles || [];
    loading.style.display = 'none';
    if (!profiles.length) {
      empty.style.display = 'block';
      return;
    }
    for (const profile of profiles) grid.appendChild(renderCard(profile));
  } catch {
    loading.textContent = 'Could not load the yearbook. Refresh and try again.';
  }
}

document.getElementById('back-to-grid').addEventListener('click', () => {
  history.replaceState(null, '', '/yearbook.html');
  location.reload();
});

const params = new URLSearchParams(location.search);
const profileId = params.get('id');
if (profileId) {
  loadProfile(profileId);
} else {
  loadGrid();
}
