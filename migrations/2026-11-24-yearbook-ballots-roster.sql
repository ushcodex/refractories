-- Make superlative nominees roster people, not just submitted profiles.
-- Safe to run once after 2026-11-24-yearbook-submission-overhaul.sql.

CREATE TABLE yearbook_ballots_new (
  id TEXT PRIMARY KEY,
  voter_roster_id TEXT NOT NULL REFERENCES yearbook_roster(id),
  category TEXT NOT NULL,
  nominee_roster_id TEXT NOT NULL REFERENCES yearbook_roster(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (voter_roster_id, category)
);

INSERT INTO yearbook_ballots_new (id, voter_roster_id, category, nominee_roster_id, created_at)
SELECT b.id, b.voter_roster_id, b.category, COALESCE(b.nominee_roster_id, p.roster_id), b.created_at
FROM yearbook_ballots AS b
LEFT JOIN yearbook_profiles AS p ON p.id = b.nominee_profile_id
WHERE COALESCE(b.nominee_roster_id, p.roster_id) IS NOT NULL;

DROP TABLE yearbook_ballots;
ALTER TABLE yearbook_ballots_new RENAME TO yearbook_ballots;

CREATE INDEX IF NOT EXISTS idx_yearbook_ballots_category ON yearbook_ballots(category);
CREATE INDEX IF NOT EXISTS idx_yearbook_ballots_nominee_roster ON yearbook_ballots(nominee_roster_id);
