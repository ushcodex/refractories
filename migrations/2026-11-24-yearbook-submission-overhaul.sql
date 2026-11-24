-- Yearbook coming-soon, single headshot, permanent profiles, and roster-wide superlatives.

ALTER TABLE yearbook_ballots ADD COLUMN nominee_roster_id TEXT REFERENCES yearbook_roster(id);

CREATE TABLE IF NOT EXISTS yearbook_ballot_receipts (
  voter_roster_id TEXT PRIMARY KEY REFERENCES yearbook_roster(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_yearbook_ballots_nominee_roster
  ON yearbook_ballots(nominee_roster_id);

INSERT OR IGNORE INTO yearbook_settings (key, value) VALUES
  ('yearbook_published', '0');

INSERT INTO yearbook_settings (key, value, updated_at)
VALUES ('superlatives_enabled', '1', datetime('now'))
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;

-- Invalidate any previously issued edit links now that profiles are permanent.
UPDATE yearbook_profiles
SET edit_token_hash = 'disabled-' || id
WHERE edit_token_hash IS NOT NULL AND edit_token_hash NOT LIKE 'disabled-%';
