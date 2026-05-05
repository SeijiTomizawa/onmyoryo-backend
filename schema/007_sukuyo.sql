CREATE TABLE IF NOT EXISTS sukuyo_texts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shuku_index INTEGER NOT NULL UNIQUE CHECK(shuku_index BETWEEN 0 AND 26),
  shuku_name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  element TEXT NOT NULL,
  personality TEXT NOT NULL,
  talent TEXT NOT NULL,
  weakness TEXT NOT NULL,
  love TEXT NOT NULL,
  work TEXT NOT NULL,
  lucky TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
