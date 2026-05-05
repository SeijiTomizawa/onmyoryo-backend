CREATE TABLE IF NOT EXISTS shichu_talent_texts (
  nikkan TEXT NOT NULL PRIMARY KEY,
  talent_title TEXT NOT NULL,
  talent_desc TEXT NOT NULL,
  weakness_title TEXT NOT NULL,
  weakness_desc TEXT NOT NULL,
  love_title TEXT NOT NULL,
  love_desc TEXT NOT NULL,
  work_title TEXT NOT NULL,
  work_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shichu_career_texts (
  nikkan TEXT NOT NULL,
  career_name TEXT NOT NULL,
  career_reason TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  PRIMARY KEY (nikkan, sort_order)
);

CREATE TABLE IF NOT EXISTS daiun_texts (
  kanshi TEXT NOT NULL PRIMARY KEY,
  gogyo TEXT NOT NULL,
  theme TEXT NOT NULL,
  description TEXT NOT NULL,
  love TEXT NOT NULL,
  work TEXT NOT NULL,
  advice TEXT NOT NULL
);
