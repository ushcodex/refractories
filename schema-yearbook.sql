PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS yearbook_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS yearbook_roster (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL UNIQUE,
  sort_name TEXT NOT NULL,
  reg_hash TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS yearbook_courses (
  code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  year_level INTEGER NOT NULL,
  semester TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS yearbook_lecturers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS yearbook_profiles (
  id TEXT PRIMARY KEY,
  roster_id TEXT NOT NULL UNIQUE REFERENCES yearbook_roster(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  display_name TEXT NOT NULL,
  nickname TEXT NOT NULL,
  birth_day INTEGER NOT NULL CHECK (birth_day BETWEEN 1 AND 31),
  birth_month INTEGER NOT NULL CHECK (birth_month BETWEEN 1 AND 12),
  state_of_origin TEXT NOT NULL,
  hometown TEXT,
  whatsapp TEXT,
  whatsapp_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_opt_in IN (0, 1)),
  outside_tags TEXT NOT NULL DEFAULT '[]',
  outside_line TEXT NOT NULL,
  unknown_fact TEXT NOT NULL,
  hobbies TEXT NOT NULL DEFAULT '[]',
  direction TEXT,
  direction_line TEXT,
  favourite_course TEXT NOT NULL,
  toughest_course TEXT NOT NULL,
  hardest_level TEXT NOT NULL,
  favourite_lecturer TEXT NOT NULL,
  most_teaching_lecturer TEXT,
  memorable_moment TEXT,
  class_word TEXT NOT NULL,
  motto TEXT NOT NULL,
  social_platform TEXT,
  social_handle TEXT,
  class_message TEXT,
  relationship_status TEXT,
  portrait_key TEXT NOT NULL,
  candid_key TEXT NOT NULL,
  department_photo_key TEXT,
  consent_accurate INTEGER NOT NULL CHECK (consent_accurate IN (0, 1)),
  show_in_yearbook INTEGER NOT NULL CHECK (show_in_yearbook IN (0, 1)),
  include_phone INTEGER NOT NULL DEFAULT 0 CHECK (include_phone IN (0, 1)),
  show_birthday INTEGER NOT NULL CHECK (show_birthday IN (0, 1)),
  edit_token_hash TEXT NOT NULL UNIQUE,
  edit_token_created_at TEXT NOT NULL DEFAULT (datetime('now')),
  flags TEXT NOT NULL DEFAULT '[]',
  ip_hash TEXT,
  user_agent_hash TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT,
  rejected_at TEXT,
  rejection_reason TEXT
);

CREATE TABLE IF NOT EXISTS yearbook_not_listed (
  id TEXT PRIMARY KEY,
  requested_name TEXT NOT NULL,
  note TEXT,
  contact TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS yearbook_ballots (
  id TEXT PRIMARY KEY,
  voter_roster_id TEXT NOT NULL REFERENCES yearbook_roster(id),
  category TEXT NOT NULL,
  nominee_profile_id TEXT NOT NULL REFERENCES yearbook_profiles(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (voter_roster_id, category)
);

CREATE TABLE IF NOT EXISTS yearbook_award_ideas (
  id TEXT PRIMARY KEY,
  voter_roster_id TEXT NOT NULL REFERENCES yearbook_roster(id),
  suggestion TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (voter_roster_id)
);

CREATE TABLE IF NOT EXISTS yearbook_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS yearbook_audit (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_yearbook_profiles_status ON yearbook_profiles(status);
CREATE INDEX IF NOT EXISTS idx_yearbook_roster_sort ON yearbook_roster(sort_name);
CREATE INDEX IF NOT EXISTS idx_yearbook_not_listed_status ON yearbook_not_listed(status);
CREATE INDEX IF NOT EXISTS idx_yearbook_ballots_category ON yearbook_ballots(category);
CREATE INDEX IF NOT EXISTS idx_yearbook_ballots_nominee ON yearbook_ballots(nominee_profile_id);
CREATE INDEX IF NOT EXISTS idx_yearbook_rate_limits_expiry ON yearbook_rate_limits(expires_at);

INSERT OR IGNORE INTO yearbook_settings (key, value) VALUES
  ('class_label', 'Class of 2024'),
  ('class_year', '2024'),
  ('submission_deadline', '2026-11-03T23:59:00+01:00'),
  ('form_locked', '0'),
  ('superlatives_enabled', '0'),
  ('results_published', '0'),
  ('auto_publish', '0'),
  ('turnstile_enabled', '0'),
  ('site_name', 'u19ce');
