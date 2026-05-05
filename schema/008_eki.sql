-- 易：64卦テキスト
CREATE TABLE IF NOT EXISTS eki_hexagrams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number INTEGER NOT NULL UNIQUE CHECK(number BETWEEN 1 AND 64),
  name_jp TEXT NOT NULL,        -- 卦名（例：乾）
  name_reading TEXT NOT NULL,   -- 読み（例：けん）
  symbol TEXT NOT NULL,         -- 卦象（例：☰☰）
  upper TEXT NOT NULL,          -- 上卦
  lower TEXT NOT NULL,          -- 下卦
  kaji TEXT NOT NULL,           -- 卦辞
  overview TEXT NOT NULL,       -- 全体的な意味
  love TEXT NOT NULL,           -- 恋愛
  work TEXT NOT NULL,           -- 仕事
  money TEXT NOT NULL,          -- 金運
  advice TEXT NOT NULL,         -- アドバイス
  image TEXT NOT NULL,          -- 象辞
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 易：鑑定履歴
CREATE TABLE IF NOT EXISTS eki_readings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  question TEXT NOT NULL,
  hexagram_number INTEGER NOT NULL,
  changing_hexagram_number INTEGER,
  changing_lines TEXT,          -- 変爻（JSON配列）
  coins_used INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_eki_readings_user ON eki_readings(user_id);
