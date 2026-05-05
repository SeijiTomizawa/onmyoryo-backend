import { Hono } from "hono";
import { calcKyusei } from "../lib/kyusei";
import { verifyJWT, extractBearerToken } from "../lib/auth";

type Env = { DB: D1Database; JWT_SECRET: string };
const fortune = new Hono<{ Bindings: Env }>();

function calcYearStar(year: number): number {
  let sum = year.toString().split("").reduce((a, b) => a + parseInt(b), 0);
  while (sum > 9) sum = sum.toString().split("").reduce((a, b) => a + parseInt(b), 0);
  return ((11 - sum - 1) % 9) + 1;
}

// 無料プレビュー（D1から年運・方位・性格テキストを返す）
fortune.get("/preview", async (c) => {
  const { year, month, day } = c.req.query();
  const y = parseInt(year), m = parseInt(month), d = parseInt(day);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) {
    return c.json({ error: "生年月日が正しくありません" }, 400);
  }

  const result = calcKyusei(y, m, d);
  const h = result.honmeiseiNumber;
  const currentYear = new Date().getFullYear();
  const yearStar = calcYearStar(currentYear);

  const [fortuneText, yearFortune, directionText] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM fortune_texts WHERE star_number = ?")
      .bind(h).first<{ personality: string; talent: string; weakness: string; love: string; work: string }>(),
    c.env.DB.prepare("SELECT * FROM year_fortunes WHERE honmei_star = ? AND year_star = ?")
      .bind(h, yearStar).first<{ title: string; overview: string; love: string; work: string; money: string; advice: string }>(),
    c.env.DB.prepare("SELECT * FROM direction_texts WHERE star_number = ?")
      .bind(h).first<{ lucky_detail: string; unlucky_detail: string; travel_advice: string }>(),
  ]);

  return c.json({
    honmeisei: result.honmeisei,
    honmeiseiNumber: h,
    tsukimeisei: result.tsukimeisei,
    tsukimeiseiNumber: result.tsukimeiseiNumber,
    keishakyuu: result.keishakyuu,
    luckyDirections: result.luckyDirections,
    unluckyDirections: result.unluckyDirections,
    // 性格（冒頭40文字でプレビュー）
    personality: fortuneText
      ? fortuneText.personality
      : result.personality,
    // 年運（概要のみプレビュー）
    yearFortune: {
      year: currentYear,
      title: yearFortune?.title ?? `${result.honmeisei}の${currentYear}年`,
      overview: yearFortune
        ? yearFortune.overview
        : result.yearFortune,
    },
    // 吉方位詳細（冒頭30文字でプレビュー）
    directionPreview: directionText
      ? directionText.lucky_detail
      : "",
    preview: true,
  });
});

// 有料鑑定
fortune.post("/reading", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const { reading_type } = await c.req.json<{
    reading_type: "basic" | "monthly" | "yearly";
  }>();

  const COSTS: Record<string, number> = { basic: 3, monthly: 5, yearly: 10 };
  const cost = COSTS[reading_type] ?? 3;

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(payload.sub).first<{ id: string; birth_date: string; coins: number }>();
  if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);
  if (user.coins < cost) {
    return c.json({ error: "コインが不足しています", required: cost, current: user.coins }, 402);
  }

  const [y, m, d] = user.birth_date.split("-").map(Number);
  const result = calcKyusei(y, m, d);
  const h = result.honmeiseiNumber;
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const yearStar = calcYearStar(currentYear);

  const [fortuneText, yearFortune, monthFortune, directionText] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM fortune_texts WHERE star_number = ?")
      .bind(h).first<{ personality: string; talent: string; weakness: string; love: string; work: string }>(),
    c.env.DB.prepare("SELECT * FROM year_fortunes WHERE honmei_star = ? AND year_star = ?")
      .bind(h, yearStar).first<{ title: string; overview: string; love: string; work: string; money: string; advice: string }>(),
    c.env.DB.prepare("SELECT * FROM month_fortunes WHERE honmei_star = ? AND month_star = ?")
      .bind(h, yearStar).first<{ overview: string; advice: string }>(),
    c.env.DB.prepare("SELECT * FROM direction_texts WHERE star_number = ?")
      .bind(h).first<{ lucky_detail: string; unlucky_detail: string; travel_advice: string }>(),
  ]);

  const enrichedResult = {
    ...result,
    personality: fortuneText?.personality ?? result.personality,
    talent: fortuneText?.talent ?? "",
    weakness: fortuneText?.weakness ?? "",
    loveText: fortuneText?.love ?? "",
    workText: fortuneText?.work ?? "",
    yearFortune: {
      year: currentYear,
      yearStar,
      title: yearFortune?.title ?? `${result.honmeisei}の${currentYear}年`,
      overview: yearFortune?.overview ?? result.yearFortune,
      love: yearFortune?.love ?? "",
      work: yearFortune?.work ?? "",
      money: yearFortune?.money ?? "",
      advice: yearFortune?.advice ?? "",
    },
    monthFortune: reading_type !== "basic" ? {
      month: currentMonth,
      overview: monthFortune?.overview ?? "",
      advice: monthFortune?.advice ?? "",
    } : null,
    directionDetail: {
      luckyDetail: directionText?.lucky_detail ?? "",
      unluckyDetail: directionText?.unlucky_detail ?? "",
      travelAdvice: directionText?.travel_advice ?? "",
    },
  };

  const readingId = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET coins = coins - ? WHERE id = ?").bind(cost, user.id),
    c.env.DB.prepare(
      "INSERT INTO coin_transactions (id, user_id, amount, type, created_at) VALUES (?, ?, ?, 'use', ?)"
    ).bind(crypto.randomUUID(), user.id, -cost, now),
    c.env.DB.prepare(
      "INSERT INTO readings (id, user_id, reading_type, coins_used, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(readingId, user.id, reading_type, cost, JSON.stringify(enrichedResult), now),
  ]);

  return c.json({
    readingId, coinsUsed: cost,
    remainingCoins: user.coins - cost,
    result: enrichedResult,
  });
});

// 鑑定履歴
fortune.get("/history", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);
  const rows = await c.env.DB.prepare(
    "SELECT id, reading_type, coins_used, created_at FROM readings WHERE user_id = ? ORDER BY created_at DESC LIMIT 20"
  ).bind(payload.sub).all();
  return c.json({ readings: rows.results });
});

export default fortune;

// 特定の鑑定結果を取得
fortune.get("/reading/:id", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const id = c.req.param("id");
  const reading = await c.env.DB.prepare(
    "SELECT * FROM readings WHERE id = ? AND user_id = ?"
  ).bind(id, payload.sub).first<{
    id: string; reading_type: string; coins_used: number;
    result_json: string; created_at: string;
  }>();

  if (!reading) return c.json({ error: "鑑定結果が見つかりません" }, 404);

  return c.json({
    id: reading.id,
    reading_type: reading.reading_type,
    coins_used: reading.coins_used,
    result: JSON.parse(reading.result_json),
    created_at: reading.created_at,
  });
});
