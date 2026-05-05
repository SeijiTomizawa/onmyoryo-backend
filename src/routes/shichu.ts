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

// 無料プレビュー（命式盤・日干・天中殺）
shichu.get("/preview", async (c) => {
  const { year, month, day, hour, gender } = c.req.query();
  const y = parseInt(year), m = parseInt(month), d = parseInt(day);
  const h = hour === 'unknown' ? -1 : parseInt(hour || '-1');
  const g = gender || 'f';

  if (!y || y < 1900 || y > 2010) {
    return c.json({ error: "生年を正しく入力してください" }, 400);
  }

  const base = calcShichu(y, m, d, h, g);

  // D1から日干テキストを取得
  const nikkanText = await c.env.DB.prepare(
    "SELECT * FROM shichu_texts WHERE nikkan = ?"
  ).bind(base.nikkan).first<ShichuTextRow>();

  // D1から天中殺テキストを取得
  const tenchusatsuText = await c.env.DB.prepare(
    "SELECT * FROM tenchusatsu_texts WHERE name = ?"
  ).bind(base.shukumeisei).first<TenchusatsuRow>();

  return c.json({
    ...base,
    // 日干テキスト（D1）
    nikkanSymbol: nikkanText?.symbol || '',
    nikkanGogyo: nikkanText?.gogyo || base.nikkanGogyo,
    nikkanInyo: nikkanText?.inyo || base.nikkanInyo,
    personality: nikkanText?.personality || '',
    talent: nikkanText?.talent || '',
    weakness: nikkanText?.weakness || '',
    love: nikkanText?.love || '',
    work: nikkanText?.work || '',
    // 天中殺テキスト（D1）
    tenchusatsuDesc: tenchusatsuText?.description || '',
    tenchusatsuStrength: tenchusatsuText?.strength || '',
    tenchusatsuCaution: tenchusatsuText?.caution || '',
    tenchusatsuAdvice: tenchusatsuText?.advice || '',
    // 無料版はここまで
    isPremium: false,
  });
});

// 有料詳細鑑定（3コイン）
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

  // 大運テキストをマップ化
  const daiunMap: Record<string, any> = {};
  for (const row of daiunTexts.results) {
    daiunMap[row.kanshi] = row;
  }

  // 大運に詳細テキストを付加
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
    // D1詳細テキスト
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

// 後天天中殺（1コイン）
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

  // 天中殺の干支ペアを取得
  const TENCHUSATSU_KANSHI: Record<string, string[]> = {
    '子丑天中殺': ['子','丑'],
    '寅卯天中殺': ['寅','卯'],
    '辰巳天中殺': ['辰','巳'],
    '午未天中殺': ['午','未'],
    '申酉天中殺': ['申','酉'],
    '戌亥天中殺': ['戌','亥'],
  };
  const tskanshi = TENCHUSATSU_KANSHI[shukumei] || [];

  // 今年・今月・今日の干支を計算
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

  // 今年の天中殺月を計算
  const tcMonths: number[] = [];
  for (let mon = 1; mon <= 12; mon++) {
    const mk = getMonthKanshi(thisYear, mon);
    if (tskanshi.some(k => mk.includes(k))) tcMonths.push(mon);
  }

  // 今月の天中殺日を計算
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

// shichu.tsの export default shichu; の直前に追加

// ==========================================
// 四柱推命 年運（2コイン）
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

  const nikkanText = await c.env.DB.prepare(
    "SELECT * FROM shichu_texts WHERE nikkan = ?"
  ).bind(base.nikkan).first<ShichuTextRow>();

  // 月別運気
  const monthlyScores = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const mk = getMonthKanshi(targetYear, month);
    const score = calcNikkanScore(base.nikkan, mk[0]);
    const level = score >= 85 ? 5 : score >= 75 ? 4 : score >= 60 ? 3 : score >= 50 ? 2 : 1;
    return { month, score, level, monthKanshi: mk };
  });

  const yearScore = calcNikkanScore(base.nikkan, yearKanshi[0]);

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
    title: generateYearTitle(base.nikkan, yearScore),
    overview: generateYearOverview(base.nikkan, yearKanshi, yearScore, targetYear, nikkanText?.symbol || ''),
    love: generateYearLove(base.nikkan, yearScore),
    work: generateYearWork(base.nikkan, yearScore),
    money: generateYearMoney(base.nikkan, yearScore),
    advice: generateYearAdvice(base.nikkan, yearScore, nikkanText?.symbol || ''),
    monthlyScores,
  });
});

// ==========================================
// 四柱推命 月運（2コイン）
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

  const nikkanText = await c.env.DB.prepare(
    "SELECT * FROM shichu_texts WHERE nikkan = ?"
  ).bind(base.nikkan).first<ShichuTextRow>();

  const score = calcNikkanScore(base.nikkan, monthKanshi[0]);
  const level = score >= 85 ? 'best' : score >= 70 ? 'good' : score >= 55 ? 'normal' : 'caution';

  // 吉日・注意日（今月の天中殺日）
  const TENCHUSATSU_KANSHI: Record<string, string[]> = {
    '子丑天中殺': ['子','丑'], '寅卯天中殺': ['寅','卯'], '辰巳天中殺': ['辰','巳'],
    '午未天中殺': ['午','未'], '申酉天中殺': ['申','酉'], '戌亥天中殺': ['戌','亥'],
  };
  const tskanshi = TENCHUSATSU_KANSHI[base.shukumeisei] || [];
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const luckyDays: number[] = [];
  const cautionDays: number[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dk = getDayKanshi(currentYear, currentMonth, day);
    const s = calcNikkanScore(base.nikkan, dk[0]);
    if (tskanshi.some(k => dk.includes(k))) cautionDays.push(day);
    else if (s >= 80) luckyDays.push(day);
  }

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
    overview: generateMonthOverview(base.nikkan, monthKanshi, score, currentMonth, nikkanText?.symbol || ''),
    love: generateMonthLove(base.nikkan, score),
    work: generateMonthWork(base.nikkan, score),
    money: generateMonthMoney(base.nikkan, score),
    health: generateMonthHealth(base.nikkan, score),
    advice: generateMonthAdvice(base.nikkan, monthKanshi, score),
    luckyDays,
    cautionDays,
  });
});

// ==========================================
// 四柱推命 日運（1コイン）
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

  const nikkanText = await c.env.DB.prepare(
    "SELECT * FROM shichu_texts WHERE nikkan = ?"
  ).bind(base.nikkan).first<ShichuTextRow>();

  const score = calcNikkanScore(base.nikkan, dayKanshi[0]);
  const level = score >= 85 ? 'best' : score >= 70 ? 'good' : score >= 55 ? 'normal' : 'caution';
  const scoreLabel = { best: '大吉 ✦ 最高の一日', good: '吉 ✧ 良い一日', normal: '中吉 誠実に', caution: '注意 休息を' }[level];

  const LUCKY_COLORS: Record<string, string[]> = {
    '甲': ['緑','青緑','翡翠'], '乙': ['水色','ラベンダー','薄緑'],
    '丙': ['赤','オレンジ','金'], '丁': ['ピンク','珊瑚','桃色'],
    '戊': ['黄色','山吹','ベージュ'], '己': ['茶','アイボリー','クリーム'],
    '庚': ['白','シルバー','グレー'], '辛': ['白','パール','銀'],
    '壬': ['黒','ネイビー','深青'], '癸': ['藍','インディゴ','青紫'],
  };
  const LUCKY_DIRS: Record<string, string> = {
    '甲': '東', '乙': '東南', '丙': '南', '丁': '南西',
    '戊': '中央', '己': '中央', '庚': '西', '辛': '北西',
    '壬': '北', '癸': '北東',
  };
  const colors = LUCKY_COLORS[base.nikkan] || ['白'];
  const luckyColor = colors[currentDay % colors.length];
  const luckyDirection = LUCKY_DIRS[base.nikkan] || '東';

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
    scoreLabel,
    message: generateDayMessage(base.nikkan, dayKanshi, score, nikkanText?.symbol || ''),
    luckyColor,
    luckyDirection,
    luckyItem: generateLuckyItem(base.nikkan, currentDay),
    advice: generateDayAdvice(base.nikkan, score),
    caution: generateDayCaution(base.nikkan, score),
  });
});

// ==========================================
// 計算ヘルパー関数
// ==========================================

function calcNikkanScore(nikkan: string, kanShi: string): number {
  // 十干の相生・相剋による簡易スコア
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

function generateYearTitle(nikkan: string, score: number): string {
  if (score >= 85) return '飛躍と収穫の年';
  if (score >= 75) return '前進と成長の年';
  if (score >= 60) return '着実に積み上げる年';
  if (score >= 50) return '内省と準備の年';
  return '休養と充電の年';
}

function generateYearOverview(nikkan: string, yearKanshi: string, score: number, year: number, symbol: string): string {
  const sym = symbol || nikkan;
  if (score >= 85) return `${year}年は${sym}のあなたにとって、努力が大きく実る飛躍の年です。${yearKanshi}の年盤が強い追い風となり、積極的に動くことで思いがけない幸運が舞い込みます。`;
  if (score >= 75) return `${year}年は${sym}のあなたにとって、確かな手応えを感じられる前進の年です。${yearKanshi}の気と相性よく、新しい挑戦が実を結ぶでしょう。`;
  if (score >= 60) return `${year}年は${sym}のあなたにとって、着実に土台を固める年です。${yearKanshi}の影響で派手さはありませんが、誠実な行動が未来への財産となります。`;
  if (score >= 50) return `${year}年は${sym}のあなたにとって、内側を磨く準備の年です。${yearKanshi}との相性は穏やかで、現状維持と内省が吉。来年の飛躍に向けて力を蓄えましょう。`;
  return `${year}年は${sym}のあなたにとって、休養と充電に専念すべき年です。${yearKanshi}との相性に注意が必要で、無理な挑戦は避けて。焦らず心身を整えることが最善です。`;
}

function generateYearLove(nikkan: string, score: number): string {
  if (score >= 85) return '恋愛運最高潮。新しい出会いと既存の関係が共に深まります。積極的なアプローチが吉。';
  if (score >= 75) return '恋愛は順調に発展。素直な気持ちを伝えることで関係が深まります。';
  if (score >= 60) return '焦らず誠実に向き合う年。じっくり信頼関係を育てることで良縁に恵まれます。';
  if (score >= 50) return '恋愛は控えめな年。既存の関係を大切に育てること、自分磨きに集中しましょう。';
  return '恋愛は慎重に。感情的な判断を避け、冷静に関係を見極めることが重要です。';
}

function generateYearWork(nikkan: string, score: number): string {
  if (score >= 85) return '仕事運絶好調。実力を存分に発揮できる機会が訪れます。新プロジェクトや昇進のチャンスも。';
  if (score >= 75) return '仕事は順調。積み上げてきた実績が評価される時期。チームとの協力で成果が上がります。';
  if (score >= 60) return '安定した仕事運。着実に実力を磨ける時期。資格取得や新スキルの習得が将来の財産に。';
  if (score >= 50) return '現状維持が吉。大きな変化や転職は時期を見極めて。誠実な仕事ぶりが信頼を築きます。';
  return '仕事は慎重に。無理な拡大は避け、守りを固める時期。人間関係に特に注意しましょう。';
}

function generateYearMoney(nikkan: string, score: number): string {
  if (score >= 85) return '金運最高の年。収入アップや臨時収入が期待できます。計画的な資産形成に吉の時期。';
  if (score >= 75) return '金運上昇気流。堅実な資産管理と積極行動のバランスが吉。副収入のチャンスも。';
  if (score >= 60) return '金運安定。大きな収入増は望みにくいですが、着実な貯蓄が吉。無駄な出費を避けて。';
  if (score >= 50) return '金運は慎重な管理が必要。衝動買いや高額投資は避けて。支出を見直す良い機会です。';
  return '金運は控えめ。大きな出費や投資は時期を改めて。緊急時の備えを優先しましょう。';
}

function generateYearAdvice(nikkan: string, score: number, symbol: string): string {
  const sym = symbol || nikkan;
  if (score >= 85) return `${sym}の本質が輝く年。自信を持って前に進んでください。長年温めてきた夢を実行に移す絶好のタイミングです。`;
  if (score >= 75) return `着実に、そして勇気を持って。${sym}としての強みを活かし、一つひとつの行動が確かな実績となります。`;
  if (score >= 60) return `急がば回れ。${sym}の誠実さを活かし、土台を固める年と心得て。来る飛躍の時に備えましょう。`;
  if (score >= 50) return `今年は「守り」の年。${sym}の持つ忍耐力を活かして、心身のバランスを保つことを最優先に。`;
  return `今年は休養と充電の年。${sym}の本質を見つめ直し、来年からの好転を信じてゆっくり過ごしましょう。`;
}

function generateMonthOverview(nikkan: string, monthKanshi: string, score: number, month: number, symbol: string): string {
  const sym = symbol || nikkan;
  if (score >= 85) return `${month}月は${sym}にとって絶好調の月です。${monthKanshi}の月盤が強い追い風となります。積極的な行動が吉。`;
  if (score >= 75) return `${month}月は${sym}にとって好調な月です。${monthKanshi}の気と相性よく、新しい取り組みが実を結びやすい時期です。`;
  if (score >= 60) return `${month}月は${sym}にとって安定した月です。${monthKanshi}との相性は普通。着実に進めることで確かな成果が得られます。`;
  if (score >= 50) return `${month}月は${sym}にとって慎重さが必要な月です。${monthKanshi}との相性に注意し、大きな決断は来月まで待ちましょう。`;
  return `${month}月は${sym}にとって休養が大切な月です。${monthKanshi}との相性が弱く、無理な行動は避けて内側を整えることに集中を。`;
}

function generateMonthLove(nikkan: string, score: number): string {
  if (score >= 80) return '今月の恋愛運は好調。積極的なアプローチが実を結びやすい時期。新しい出会いも期待できます。';
  if (score >= 65) return '恋愛は順調。相手への思いやりを大切にすることで関係が深まります。';
  return '恋愛は慎重に。感情的になりやすい時期なので、冷静なコミュニケーションを心がけましょう。';
}

function generateMonthWork(nikkan: string, score: number): string {
  if (score >= 80) return '仕事運は絶好調。実力を発揮できるチャンスが訪れます。新しいプロジェクトへの参加が吉。';
  if (score >= 65) return '仕事は順調。チームワークを大切にすることでより大きな成果が生まれます。';
  return '仕事は慎重に進める時期。無理な納期や新規案件は避け、現在のタスクを丁寧に仕上げましょう。';
}

function generateMonthMoney(nikkan: string, score: number): string {
  if (score >= 80) return '金運は好調。収入アップや嬉しい臨時収入が期待できます。堅実な投資も吉。';
  if (score >= 65) return '金運は安定。大きな変化はありませんが、着実な貯蓄を継続しましょう。';
  return '金運は要注意。大きな出費や衝動買いは避けて。今月は節約と現状維持が最善です。';
}

function generateMonthHealth(nikkan: string, score: number): string {
  if (score >= 80) return '健康運は良好。活発に動ける時期。新しい運動習慣を始めるのに最適です。';
  if (score >= 65) return '健康は安定。規則正しい生活リズムを維持することで好調を保てます。';
  return '健康に注意が必要な月。無理をせず、十分な休息を取ることを優先してください。';
}

function generateMonthAdvice(nikkan: string, monthKanshi: string, score: number): string {
  if (score >= 80) return `${monthKanshi}の月盤はあなたの強い味方。自分の直感を信じて積極的に行動しましょう。`;
  if (score >= 65) return `${monthKanshi}の月。焦らず誠実に取り組むことが今月の吉となります。`;
  return `${monthKanshi}の月は守りを固める時期。今月は内側を充実させることに集中しましょう。`;
}

function generateDayMessage(nikkan: string, dayKanshi: string, score: number, symbol: string): string {
  const sym = symbol || nikkan;
  if (score >= 85) return `${dayKanshi}の日盤が${sym}と強く共鳴しています。今日は何をしても追い風。大切なことに取り組む絶好の日です。`;
  if (score >= 70) return `${dayKanshi}の日盤が${sym}と良い関係にあります。素直に行動することで良い結果が生まれやすい一日です。`;
  if (score >= 55) return `${dayKanshi}の日盤との相性は普通。丁寧に誠実に行動することが今日の吉となります。`;
  return `${dayKanshi}の日盤と${sym}の相性に注意が必要な日。焦らず、大きな決断は明日以降に。`;
}

function generateLuckyItem(nikkan: string, day: number): string {
  const ITEMS: Record<string, string[]> = {
    '甲': ['観葉植物','木製のもの','緑のアイテム'],
    '乙': ['花','ハーブ','柔らかい布'],
    '丙': ['明るい照明','赤いアイテム','太陽モチーフ'],
    '丁': ['キャンドル','温かい飲み物','ピンクのアイテム'],
    '戊': ['石・鉱物','大地モチーフ','ベージュのアイテム'],
    '己': ['陶器','土もの','クリーム色のアイテム'],
    '庚': ['金属製品','シルバーアクセ','白いアイテム'],
    '辛': ['宝石','鏡','パール'],
    '壬': ['水・飲料','紺色のアイテム','海モチーフ'],
    '癸': ['雨具','藍色のアイテム','霧モチーフ'],
  };
  const items = ITEMS[nikkan] || ['白いアイテム'];
  return items[day % items.length];
}

function generateDayAdvice(nikkan: string, score: number): string {
  if (score >= 85) return '今日は積極的に行動を。連絡・訪問・新しい試みすべてが吉。';
  if (score >= 70) return '午前中の行動が特に吉。重要な連絡や決断は午前中に済ませましょう。';
  if (score >= 55) return '丁寧に、着実に。今日は新しいことより既存のタスクを仕上げることに集中を。';
  return '今日は休息日にするのが最善。無理な行動より内側を整えることに集中しましょう。';
}

function generateDayCaution(nikkan: string, score: number): string {
  if (score >= 85) return '特になし。ただし過信は禁物。感謝の気持ちを忘れずに。';
  if (score >= 70) return '午後からエネルギーが落ちやすい。重要な会議や決断は午前中に。';
  if (score >= 55) return '感情的な判断は避けて。大きな出費や契約は慎重に。';
  return '重要な決断・大きな出費・新規事業の開始は避けて。今日は準備と休養に徹しましょう。';
}


export default shichu;
