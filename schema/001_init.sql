-- ユーザーテーブル
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  birth_date TEXT NOT NULL,        -- YYYY-MM-DD
  coins INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_email ON users(email);

-- コイン取引履歴
CREATE TABLE IF NOT EXISTS coin_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,          -- 正=付与, 負=消費
  type TEXT NOT NULL CHECK(type IN ('purchase', 'use', 'bonus')),
  stripe_payment_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_coin_tx_user ON coin_transactions(user_id);

-- 鑑定履歴
CREATE TABLE IF NOT EXISTS readings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  reading_type TEXT NOT NULL CHECK(reading_type IN ('basic', 'monthly', 'yearly')),
  coins_used INTEGER NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_readings_user ON readings(user_id);

-- 本命星テキスト（性格・特徴）
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

-- 年運文章（本命星×年盤星）
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

-- 月運文章（本命星×月盤星）
CREATE TABLE IF NOT EXISTS month_fortunes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  honmei_star INTEGER NOT NULL CHECK(honmei_star BETWEEN 1 AND 9),
  month_star INTEGER NOT NULL CHECK(month_star BETWEEN 1 AND 9),
  overview TEXT NOT NULL,
  advice TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(honmei_star, month_star)
);

-- 吉方位解説
CREATE TABLE IF NOT EXISTS direction_texts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  star_number INTEGER NOT NULL UNIQUE CHECK(star_number BETWEEN 1 AND 9),
  lucky_detail TEXT NOT NULL,
  unlucky_detail TEXT NOT NULL,
  travel_advice TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
