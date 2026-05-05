CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT,
  coins INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fortune_texts (
  star_number TEXT PRIMARY KEY,
  personality TEXT,
  talent TEXT,
  weakness TEXT,
  love TEXT,
  work TEXT
);
