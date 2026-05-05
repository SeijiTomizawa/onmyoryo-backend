import { Hono } from "hono";
import { calcShichu } from "../lib/shichu";
import { verifyJWT, extractBearerToken } from "../lib/auth";

type Env = { DB: D1Database; JWT_SECRET: string };
const shichu = new Hono<{ Bindings: Env }>();

type ShichuTextRow = {
  nikkan: string; symbol: string; gogyo: string; inyo: string;
  personality: string; talent: string; weakness: string;
  love: string; work: string; career: string; key_message: string;
};

type TenchusatsuRow = {
  name: string; description: string; strength: string;
  caution: string; advice: string; key_message: string;
};

// ==========================================
// ヘルパー関数
// ==========================================

function getScoreBand(score: number): string {
  if (score >= 85) return 'best';
  if (score >= 75) return 'good';
  if (score >= 60) return 'normal';
  if (score >= 50) return 'caution';
  return 'low';
}

function calcNikkanScore(nikkan: string, kanShi: string): number {
  const GOGYO: Record<string, string> = {
    '甲':'木','乙':'木','丙':'火','丁':'火','戊':'土',
    '己':'土','庚':'金','辛':'金','壬':'水','癸':'水',
  };
  const myGogyo = GOGYO[nikkan] || '土';
  const dayGogyo = GOGYO[kanShi] || '土';
  const SCORE_MAP: Record<string, Record<string, number>> = {
    '木': { '木':70, '火':85, '土':45, '金':55, '水':90 },
    '火': { '木':88, '火':68, '土':82, '金':42, '水':50 },
    '土': { '木':48, '火':88, '土':70, '金':82, '水':45 },
    '金': { '木':50, '火':45, '土':88, '金':72, '水':85 },
    '水': { '木':88, '火':50, '土':48, '金':85, '水':68 },
  };
  return SCORE_MAP[myGogyo]?.[dayGogyo] ?? 65;
}

async function getFortuneTexts(
  db: D1Database,
  nikkan: string,
  scoreBand: string,
  categories: string[]
): Promise<Record<string, string>> {
  const placeholders = categories.map(() => '?').join(',');
  const rows = await db.prepare(
    `SELECT category, text FROM shichu_fortune_texts WHERE nikkan = ? AND score_band = ? AND category IN (${placeholders})`
  ).bind(nikkan, scoreBand, ...categories).all<{ category: string; text: string }>();
  const result: Record<string, string> = {};
  for (const row of rows.results) {
    result[row.category] = row.text;
  }
  return result;
}

async function getLuckyTexts(db: D1Database, nikkan: string) {
  return db.prepare(
    'SELECT lucky_colors, lucky_direction, lucky_items FROM shichu_lucky_texts WHERE nikkan = ?'
  ).bind(nikkan).first<{ lucky_colors: string; lucky_direction: string; lucky_items: string }>();
}

function getYearKanshi(year: number): string {
  const KAN = ['庚','辛','壬','癸','甲','乙','丙','丁','戊','己'];
  const SHI = ['申','酉','戌','亥','子','丑','寅','卯','辰','巳','午','未'];
  return KAN[(year - 4) % 10] + SHI[(year - 4) % 12];
}

function getMonthKanshi(year: number, month: number): string {
  const SHI_MONTH = ['寅','卯','辰','巳','午','未','申','酉','戌','亥','子','丑'];
  const baseKan = ((year - 4) % 5) * 2;
  const KAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const kanIdx = (baseKan + month - 1) % 10;
  return KAN[kanIdx] + SHI_MONTH[month - 1];
}

function getDayKanshi(year: number, month: number, day: number): string {
  const KAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const SHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  const base = new Date(1984, 0, 1);
  const target = new Date(year, month - 1, day);
  const diff = Math.floor((target.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
  return KAN[((diff % 10) + 10) % 10] + SHI[((diff % 12) + 12) % 12];
}

const TENCHUSATSU_KANSHI: Record<string, string[]> = {
  '子丑天中殺': ['子','丑'], '寅卯天中殺': ['寅','卯'], '辰巳天中殺': ['辰','巳'],
  '午未天中殺': ['午','未'], '申酉天中殺': ['申','酉'], '戌亥天中殺': ['戌','亥'],
};

// ==========================================
// 無料プレビュー（命式盤・日干・天中殺）
// ==========================================
shichu.get("/preview", async (c) => {
  const { year, month, day, hour, gender } = c.req.query();
  const y = parseInt(year), m = parseInt(month), d = parseInt(day);
  const h = hour === 'unknown' ? -1 : parseInt(hour || '-1');
  const g = gender || 'f';

  if (!y || y < 1900 || y > 2010) {
    return c.json({ error: "生年を正しく入力してください" }, 400);
  }

  const base = calcShichu(y, m, d, h, g);

  const [nikkanText, tenchusatsuText] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM shichu_texts WHERE nikkan = ?")
      .bind(base.nikkan).first<ShichuTextRow>(),
    c.env.DB.prepare("SELECT * FROM tenchusatsu_texts WHERE name = ?")
      .bind(base.shukumeisei).first<TenchusatsuRow>(),
  ]);

  return c.json({
    ...base,
    nikkanSymbol: nikkanText?.symbol || '',
    nikkanGogyo: nikkanText?.gogyo || base.nikkanGogyo,
    nikkanInyo: nikkanText?.inyo || base.nikkanInyo,
    personality: nikkanText?.personality || '',
    talent: nikkanText?.talent || '',
    weakness: nikkanText?.weakness || '',
    love: nikkanText?.love || '',
    work: nikkanText?.work || '',
    tenchusatsuDesc: tenchusatsuText?.description || '',
    tenchusatsuStrength: tenchusatsuText?.strength || '',
    tenchusatsuCaution: tenchusatsuText?.caution || '',
    tenchusatsuAdvice: tenchusatsuText?.advice || '',
    isPremium: false,
  });
});

// ==========================================
// 有料詳細鑑定（3コイン）
// ==========================================
shichu.get("/reading", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const COST = 3;
  const { year, month, day, hour, gender } = c.req.query();
  const y = parseInt(year), m = parseInt(month), d = parseInt(day);
  const h = hour === 'unknown' ? -1 : parseInt(hour || '-1');
  const g = gender || 'f';

  if (!y || y < 1900 || y > 2010) return c.json({ error: "生年を正しく入力してください" }, 400);

  const user = await c.env.DB.prepare(
    "SELECT id, coins FROM users WHERE id = ?"
  ).bind(payload.sub).first<{ id: string; coins: number }>();

  if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);
  if (user.coins < COST) return c.json({ error: "コインが不足しています", required: COST, current: user.coins }, 402);

  const base = calcShichu(y, m, d, h, g);

  const [nikkanText, tenchusatsuText, talentText, careerRows, daiunTexts] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM shichu_texts WHERE nikkan = ?").bind(base.nikkan).first<ShichuTextRow>(),
    c.env.DB.prepare("SELECT * FROM tenchusatsu_texts WHERE name = ?").bind(base.shukumeisei).first<TenchusatsuRow>(),
    c.env.DB.prepare("SELECT * FROM shichu_talent_texts WHERE nikkan = ?").bind(base.nikkan).first<any>(),
    c.env.DB.prepare("SELECT * FROM shichu_career_texts WHERE nikkan = ? ORDER BY sort_order").bind(base.nikkan).all<any>(),
    c.env.DB.prepare("SELECT * FROM daiun_texts").all<any>(),
  ]);

  const daiunMap: Record<string, any> = {};
  for (const row of daiunTexts.results) {
    daiunMap[row.kanshi] = row;
  }

  const enrichedDaiun = (base.daiun || []).map((u: any) => {
    const kanshi = (u.kan || '') + (u.shi || '');
    const text = daiunMap[kanshi] || null;
    return { ...u, kanshi, text };
  });

  const now = new Date().toISOString();
  const readingId = crypto.randomUUID();
  const resultJson = JSON.stringify({ ...base, nikkanText, tenchusatsuText, birthYear: y });

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET coins = coins - ? WHERE id = ?").bind(COST, user.id),
    c.env.DB.prepare(
      "INSERT INTO readings (id, user_id, reading_type, coins_used, result_json, created_at) VALUES (?, ?, 'basic', ?, ?, ?)"
    ).bind(readingId, user.id, COST, resultJson, now),
  ]);

  return c.json({
    readingId,
    coinsUsed: COST,
    remainingCoins: user.coins - COST,
    ...base,
    nikkanSymbol: nikkanText?.symbol || '',
    nikkanGogyo: nikkanText?.gogyo || base.nikkanGogyo,
    nikkanInyo: nikkanText?.inyo || base.nikkanInyo,
    personality: nikkanText?.personality || '',
    talent: nikkanText?.talent || '',
    weakness: nikkanText?.weakness || '',
    love: nikkanText?.love || '',
    work: nikkanText?.work || '',
    career: nikkanText?.career || '',
    keyMessage: nikkanText?.key_message || '',
    tenchusatsuDesc: tenchusatsuText?.description || '',
    tenchusatsuStrength: tenchusatsuText?.strength || '',
    tenchusatsuCaution: tenchusatsuText?.caution || '',
    tenchusatsuAdvice: tenchusatsuText?.advice || '',
    tenchusatsuKeyMessage: tenchusatsuText?.key_message || '',
    talentTitle: talentText?.talent_title || '',
    talentDesc: talentText?.talent_desc || '',
    weaknessTitle: talentText?.weakness_title || '',
    weaknessDesc: talentText?.weakness_desc || '',
    loveTitle: talentText?.love_title || '',
    loveDesc: talentText?.love_desc || '',
    workTitle: talentText?.work_title || '',
    workDesc: talentText?.work_desc || '',
    careers: careerRows.results || [],
    enrichedDaiun,
    isPremium: true,
  });
});

// ==========================================
// 後天天中殺（1コイン）
// ==========================================
shichu.get("/kochiten", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const COST = 1;
  const { year, month, day } = c.req.query();
  const y = parseInt(year), m = parseInt(month), d = parseInt(day);
  if (!y || y < 1900) return c.json({ error: "生年を正しく入力してください" }, 400);

  const user = await c.env.DB.prepare(
    "SELECT id, coins FROM users WHERE id = ?"
  ).bind(payload.sub).first<{ id: string; coins: number }>();

  if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);
  if (user.coins < COST) return c.json({ error: "コインが不足しています", required: COST, current: user.coins }, 402);

  const base = calcShichu(y, m, d, -1, 'f');
  const shukumei = base.shukumeisei;
  const tskanshi = TENCHUSATSU_KANSHI[shukumei] || [];

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const thisDay = now.getDate();

  const yearKanshi = getYearKanshi(thisYear);
  const monthKanshi = getMonthKanshi(thisYear, thisMonth);
  const dayKanshi = getDayKanshi(thisYear, thisMonth, thisDay);

  const isYearTC = tskanshi.some(k => yearKanshi.includes(k));
  const isMonthTC = tskanshi.some(k => monthKanshi.includes(k));
  const isDayTC = tskanshi.some(k => dayKanshi.includes(k));

  const tcMonths: number[] = [];
  for (let mon = 1; mon <= 12; mon++) {
    const mk = getMonthKanshi(thisYear, mon);
    if (tskanshi.some(k => mk.includes(k))) tcMonths.push(mon);
  }

  const tcDays: number[] = [];
  const daysInMonth = new Date(thisYear, thisMonth, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const dk = getDayKanshi(thisYear, thisMonth, day);
    if (tskanshi.some(k => dk.includes(k))) tcDays.push(day);
  }

  const nowIso = now.toISOString();
  const readingId = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET coins = coins - ? WHERE id = ?").bind(COST, user.id),
    c.env.DB.prepare(
      "INSERT INTO readings (id, user_id, reading_type, coins_used, result_json, created_at) VALUES (?, ?, 'basic', ?, ?, ?)"
    ).bind(readingId, user.id, COST, JSON.stringify({ shukumei, isYearTC, isMonthTC, isDayTC }), nowIso),
  ]);

  return c.json({
    readingId,
    coinsUsed: COST,
    remainingCoins: user.coins - COST,
    shukumei,
    tskanshi,
    isYearTC,
    isMonthTC,
    isDayTC,
    yearKanshi,
    monthKanshi,
    dayKanshi,
    tcMonths,
    tcDays,
    thisYear,
    thisMonth,
  });
});

// ==========================================
// 年運詳細（2コイン）
// ==========================================
shichu.post("/yearly", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const COST = 2;
  const body = await c.req.json<{ targetYear?: number }>();
  const targetYear = body.targetYear || new Date().getFullYear();

  const user = await c.env.DB.prepare(
    "SELECT id, birth_date, coins FROM users WHERE id = ?"
  ).bind(payload.sub).first<{ id: string; birth_date: string; coins: number }>();

  if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);
  if (user.coins < COST) return c.json({ error: "コインが不足しています", required: COST, current: user.coins }, 402);

  const [y, m, d] = user.birth_date.split('-').map(Number);
  const base = calcShichu(y, m, d, -1, 'f');
  const yearKanshi = getYearKanshi(targetYear);
  const yearScore = calcNikkanScore(base.nikkan, yearKanshi[0]);
  const scoreBand = getScoreBand(yearScore);

  const monthlyScores = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const mk = getMonthKanshi(targetYear, month);
    const score = calcNikkanScore(base.nikkan, mk[0]);
    const level = score >= 85 ? 5 : score >= 75 ? 4 : score >= 60 ? 3 : score >= 50 ? 2 : 1;
    return { month, score, level, monthKanshi: mk };
  });

  const [nikkanText, texts] = await Promise.all([
    c.env.DB.prepare("SELECT symbol FROM shichu_texts WHERE nikkan = ?")
      .bind(base.nikkan).first<{ symbol: string }>(),
    getFortuneTexts(c.env.DB, base.nikkan, scoreBand, [
      'year_title', 'year_overview', 'year_love', 'year_work', 'year_money', 'year_advice',
    ]),
  ]);

  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET coins = coins - ? WHERE id = ?").bind(COST, user.id),
    c.env.DB.prepare(
      "INSERT INTO readings (id, user_id, reading_type, coins_used, result_json, created_at) VALUES (?, ?, 'yearly', ?, ?, ?)"
    ).bind(crypto.randomUUID(), user.id, COST, JSON.stringify({ nikkan: base.nikkan, targetYear }), now),
  ]);

  return c.json({
    coinsUsed: COST,
    remainingCoins: user.coins - COST,
    year: targetYear,
    nikkan: base.nikkan,
    nikkanSymbol: nikkanText?.symbol || '',
    shukumeisei: base.shukumeisei,
    yearKanshi,
    score: yearScore,
    title: texts['year_title'] || '',
    overview: texts['year_overview'] || '',
    love: texts['year_love'] || '',
    work: texts['year_work'] || '',
    money: texts['year_money'] || '',
    advice: texts['year_advice'] || '',
    monthlyScores,
  });
});

// ==========================================
// 月運詳細（2コイン）
// ==========================================
shichu.post("/monthly", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const COST = 2;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const user = await c.env.DB.prepare(
    "SELECT id, birth_date, coins FROM users WHERE id = ?"
  ).bind(payload.sub).first<{ id: string; birth_date: string; coins: number }>();

  if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);
  if (user.coins < COST) return c.json({ error: "コインが不足しています", required: COST, current: user.coins }, 402);

  const [y, m, d] = user.birth_date.split('-').map(Number);
  const base = calcShichu(y, m, d, -1, 'f');
  const monthKanshi = getMonthKanshi(currentYear, currentMonth);
  const score = calcNikkanScore(base.nikkan, monthKanshi[0]);
  const scoreBand = getScoreBand(score);
  const level = score >= 85 ? 'best' : score >= 70 ? 'good' : score >= 55 ? 'normal' : 'caution';

  const tskanshi = TENCHUSATSU_KANSHI[base.shukumeisei] || [];
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const luckyDays: number[] = [];
  const cautionDays: number[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dk = getDayKanshi(currentYear, currentMonth, day);
    if (tskanshi.some(k => dk.includes(k))) cautionDays.push(day);
    else if (calcNikkanScore(base.nikkan, dk[0]) >= 80) luckyDays.push(day);
  }

  const [nikkanText, texts] = await Promise.all([
    c.env.DB.prepare("SELECT symbol FROM shichu_texts WHERE nikkan = ?")
      .bind(base.nikkan).first<{ symbol: string }>(),
    getFortuneTexts(c.env.DB, base.nikkan, scoreBand, [
      'month_overview', 'month_love', 'month_work', 'month_money', 'month_health', 'month_advice',
    ]),
  ]);

  const nowIso = now.toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET coins = coins - ? WHERE id = ?").bind(COST, user.id),
    c.env.DB.prepare(
      "INSERT INTO readings (id, user_id, reading_type, coins_used, result_json, created_at) VALUES (?, ?, 'monthly', ?, ?, ?)"
    ).bind(crypto.randomUUID(), user.id, COST, JSON.stringify({ nikkan: base.nikkan, year: currentYear, month: currentMonth }), nowIso),
  ]);

  return c.json({
    coinsUsed: COST,
    remainingCoins: user.coins - COST,
    year: currentYear,
    month: currentMonth,
    nikkan: base.nikkan,
    nikkanSymbol: nikkanText?.symbol || '',
    shukumeisei: base.shukumeisei,
    monthKanshi,
    score,
    level,
    overview: texts['month_overview'] || '',
    love: texts['month_love'] || '',
    work: texts['month_work'] || '',
    money: texts['month_money'] || '',
    health: texts['month_health'] || '',
    advice: texts['month_advice'] || '',
    luckyDays,
    cautionDays,
  });
});

// ==========================================
// 日運詳細（1コイン）
// ==========================================
shichu.post("/daily", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const COST = 1;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  const WEEK = ['日','月','火','水','木','金','土'];

  const user = await c.env.DB.prepare(
    "SELECT id, birth_date, coins FROM users WHERE id = ?"
  ).bind(payload.sub).first<{ id: string; birth_date: string; coins: number }>();

  if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);
  if (user.coins < COST) return c.json({ error: "コインが不足しています", required: COST, current: user.coins }, 402);

  const [y, m, d] = user.birth_date.split('-').map(Number);
  const base = calcShichu(y, m, d, -1, 'f');
  const dayKanshi = getDayKanshi(currentYear, currentMonth, currentDay);
  const score = calcNikkanScore(base.nikkan, dayKanshi[0]);
  const scoreBand = getScoreBand(score);
  const level = score >= 85 ? 'best' : score >= 70 ? 'good' : score >= 55 ? 'normal' : 'caution';
  const SCORE_LABELS: Record<string, string> = {
    best: '大吉 ✦ 最高の一日', good: '吉 ✧ 良い一日',
    normal: '中吉 誠実に', caution: '注意 休息を',
  };

  const [nikkanText, texts, luckyRow] = await Promise.all([
    c.env.DB.prepare("SELECT symbol FROM shichu_texts WHERE nikkan = ?")
      .bind(base.nikkan).first<{ symbol: string }>(),
    getFortuneTexts(c.env.DB, base.nikkan, scoreBand, [
      'day_message', 'day_advice', 'day_caution',
    ]),
    getLuckyTexts(c.env.DB, base.nikkan),
  ]);

  const colors = (luckyRow?.lucky_colors || '白').split(',');
  const items = (luckyRow?.lucky_items || '白いアイテム').split(',');
  const luckyColor = colors[currentDay % colors.length];
  const luckyItem = items[(currentDay + score) % items.length];
  const luckyDirection = luckyRow?.lucky_direction || '東';

  const nowIso = now.toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET coins = coins - ? WHERE id = ?").bind(COST, user.id),
    c.env.DB.prepare(
      "INSERT INTO readings (id, user_id, reading_type, coins_used, result_json, created_at) VALUES (?, ?, 'daily', ?, ?, ?)"
    ).bind(crypto.randomUUID(), user.id, COST, JSON.stringify({ nikkan: base.nikkan, date: `${currentYear}-${currentMonth}-${currentDay}` }), nowIso),
  ]);

  return c.json({
    coinsUsed: COST,
    remainingCoins: user.coins - COST,
    date: `${currentYear}年${currentMonth}月${currentDay}日（${WEEK[now.getDay()]}）`,
    nikkan: base.nikkan,
    nikkanSymbol: nikkanText?.symbol || '',
    dayKanshi,
    score,
    level,
    scoreLabel: SCORE_LABELS[level],
    message: texts['day_message'] || '',
    advice: texts['day_advice'] || '',
    caution: texts['day_caution'] || '',
    luckyColor,
    luckyDirection,
    luckyItem,
  });
});

export default shichu;