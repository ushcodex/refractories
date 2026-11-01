DELETE FROM reports;
DELETE FROM photos;
DELETE FROM collections;

INSERT INTO collections (id, uploader_name, description, event_name, photo_count, created_at)
VALUES
  ('test-collection-1', 'Test Uploader', 'Local test collection', '500L', 2, '2026-01-01 10:00:00'),
  ('test-collection-2', 'Second Uploader', 'Another local test collection', 'Graduation Day', 1, '2026-01-02 10:00:00');

INSERT INTO photos (id, collection_id, r2_key, thumb_key, original_filename, file_size, thumb_size, width, height, date_taken, year_taken, camera_model, caption, tagged_people, created_at)
VALUES
  ('test-photo-1', 'test-collection-1', 'photos/2026/test-collection-1/test-photo-1', 'thumbs/2026/test-collection-1/test-photo-1', 'test-1.jpg', 1000, 200, 1200, 1600, '2026-01-01T10:00:00', 2026, 'Test Camera', '', '[]', '2026-01-01 10:01:00'),
  ('test-photo-2', 'test-collection-1', 'photos/2026/test-collection-1/test-photo-2', 'thumbs/2026/test-collection-1/test-photo-2', 'test-2.jpg', 1100, 210, 1600, 1200, '2026-01-02T10:00:00', 2026, 'Test Camera', '', '[]', '2026-01-01 10:02:00'),
  ('test-photo-3', 'test-collection-2', 'photos/2026/test-collection-2/test-photo-3', 'thumbs/2026/test-collection-2/test-photo-3', 'test-3.jpg', 1200, 220, 1200, 1200, '2026-01-03T10:00:00', 2026, 'Test Camera', '', '[]', '2026-01-02 10:01:00');

INSERT INTO reports (id, photo_id, reason, details, created_at)
VALUES ('test-report-1', 'test-photo-1', 'Duplicate or Spam', 'Local test report', '2026-01-03 12:00:00');
