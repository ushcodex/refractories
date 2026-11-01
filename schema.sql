PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    uploader_name TEXT NOT NULL,
    description TEXT,
    event_name TEXT,
    photo_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    thumb_key TEXT NOT NULL,
    original_filename TEXT,
    file_size INTEGER,
    thumb_size INTEGER,
    width INTEGER,
    height INTEGER,

    date_taken TEXT,
    year_taken INTEGER,
    camera_model TEXT,

    caption TEXT,
    tagged_people TEXT,

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    photo_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_photos_collection ON photos(collection_id);
CREATE INDEX IF NOT EXISTS idx_photos_created ON photos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photos_date ON photos(date_taken DESC);
CREATE INDEX IF NOT EXISTS idx_photos_year ON photos(year_taken);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_photo ON reports(photo_id);
