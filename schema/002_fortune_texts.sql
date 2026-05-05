CREATE TABLE IF NOT EXISTS fortune_texts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  star_number INTEGER NOT NULL UNIQUE CHECK(star_number BETWEEN 1 AND 9),
  star_name TEXT NOT NULL,
  personality TEXT NOT NULL,
  talent TEXT NOT NULL,
  weakness TEXT NOT NULL,
  love TEXT NOT NULL,
  work TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS year_fortunes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  honmei_star INTEGER NOT NULL CHECK(honmei_star BETWEEN 1 AND 9),
  year_star INTEGER NOT NULL CHECK(year_star BETWEEN 1 AND 9),
  title TEXT NOT NULL,
  overview TEXT NOT NULL,
  love TEXT NOT NULL,
  work TEXT NOT NULL,
  money TEXT NOT NULL,
  advice TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(honmei_star, year_star)
);

CREATE TABLE IF NOT EXISTS month_fortunes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  honmei_star INTEGER NOT NULL CHECK(honmei_star BETWEEN 1 AND 9),
  month_star INTEGER NOT NULL CHECK(month_star BETWEEN 1 AND 9),
  overview TEXT NOT NULL,
  advice TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(honmei_star, month_star)
);

CREATE TABLE IF NOT EXISTS direction_texts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  star_number INTEGER NOT NULL UNIQUE CHECK(star_number BETWEEN 1 AND 9),
  lucky_detail TEXT NOT NULL,
  unlucky_detail TEXT NOT NULL,
  travel_advice TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
