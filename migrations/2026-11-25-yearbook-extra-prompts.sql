-- Extra optional yearbook prompts added after the first submissions.
-- Existing rows keep working through the NOT NULL defaults.

ALTER TABLE yearbook_profiles ADD COLUMN headshot_caption TEXT NOT NULL DEFAULT '';
ALTER TABLE yearbook_profiles ADD COLUMN self_words TEXT NOT NULL DEFAULT '';
ALTER TABLE yearbook_profiles ADD COLUMN class_emoji TEXT NOT NULL DEFAULT '';
ALTER TABLE yearbook_profiles ADD COLUMN theme_song TEXT NOT NULL DEFAULT '';
ALTER TABLE yearbook_profiles ADD COLUMN future_self TEXT NOT NULL DEFAULT '';
