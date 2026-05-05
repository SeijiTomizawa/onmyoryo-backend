import { Hono } from "hono";
import { generateHexagram, lineToSymbol } from "../lib/eki";
import { verifyJWT, extractBearerToken } from "../lib/auth";

type Env = { DB: D1Database; JWT_SECRET: string };
const eki = new Hono<{ Bindings: Env }>();

type HexagramRow = {
  number: number; name_jp: string; name_reading: string;
  symbol: string; upper: string; lower: string;
  kaji: string; overview: string; love: string;
  work: string; money: string; advice: string; image: string;
};

// 有料鑑定（1コイン消費）
eki.post("/reading", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const { question } = await c.req.json<{ question: string }>();
  if (!question?.trim()) return c.json({ error: "質問を入力してください" }, 400);

  const COST = 1;
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(payload.sub).first<{ id: string; coins: number }>();
  if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);
  if (user.coins < COST) {
    return c.json({ error: "コインが不足しています", required: COST, current: user.coins }, 402);
  }

  // 卦を生成
  const hexagram = generateHexagram();

  // D1から本卦・之卦のテキストを取得
  const [honke, nouke] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM eki_hexagrams WHERE number = ?")
      .bind(hexagram.number).first<HexagramRow>(),
    hexagram.changingHexagramNumber
      ? c.env.DB.prepare("SELECT * FROM eki_hexagrams WHERE number = ?")
          .bind(hexagram.changingHexagramNumber).first<HexagramRow>()
      : Promise.resolve(null),
  ]);

  if (!honke) return c.json({ error: "卦データが見つかりません" }, 500);

  // 爻の表示
  const lineSymbols = hexagram.lines.map((line, i) => ({
    index: i,
    symbol: lineToSymbol(line),
    isChanging: hexagram.changingLines.includes(i),
    position: `${i + 1}爻`,
  }));

  const readingId = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET coins = coins - ? WHERE id = ?").bind(COST, user.id),
    c.env.DB.prepare(
      "INSERT INTO coin_transactions (id, user_id, amount, type, created_at) VALUES (?, ?, ?, 'use', ?)"
    ).bind(crypto.randomUUID(), user.id, -COST, now),
    c.env.DB.prepare(
      `INSERT INTO eki_readings (id, user_id, question, hexagram_number, changing_hexagram_number, changing_lines, coins_used, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      readingId, user.id, question,
      hexagram.number,
      hexagram.changingHexagramNumber,
      JSON.stringify(hexagram.changingLines),
      COST, now
    ),
  ]);

  return c.json({
    readingId,
    coinsUsed: COST,
    remainingCoins: user.coins - COST,
    question,
    hexagram: {
      number: hexagram.number,
      lines: hexagram.lines,
      lineSymbols,
      changingLines: hexagram.changingLines,
    },
    honke: {
      number: honke.number,
      name: honke.name_jp,
      reading: honke.name_reading,
      symbol: honke.symbol,
      upper: honke.upper,
      lower: honke.lower,
      kaji: honke.kaji,
      overview: honke.overview,
      love: honke.love,
      work: honke.work,
      money: honke.money,
      advice: honke.advice,
      image: honke.image,
    },
    nouke: nouke ? {
      number: nouke.number,
      name: nouke.name_jp,
      reading: nouke.name_reading,
      symbol: nouke.symbol,
      kaji: nouke.kaji,
      overview: nouke.overview,
      advice: nouke.advice,
    } : null,
  });
});

// 鑑定履歴
eki.get("/history", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);
  const rows = await c.env.DB.prepare(
    "SELECT id, question, hexagram_number, coins_used, created_at FROM eki_readings WHERE user_id = ? ORDER BY created_at DESC LIMIT 20"
  ).bind(payload.sub).all();
  return c.json({ readings: rows.results });
});

export default eki;

// 特定の易鑑定結果を取得
eki.get("/reading/:id", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const id = c.req.param("id");
  const reading = await c.env.DB.prepare(
    "SELECT * FROM eki_readings WHERE id = ? AND user_id = ?"
  ).bind(id, payload.sub).first<{
    id: string; question: string; hexagram_number: number;
    changing_hexagram_number: number | null; coins_used: number; created_at: string;
  }>();

  if (!reading) return c.json({ error: "鑑定結果が見つかりません" }, 404);

  const [honke, nouke] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM eki_hexagrams WHERE number = ?")
      .bind(reading.hexagram_number).first<{
        number: number; name_jp: string; name_reading: string;
        upper: string; lower: string; kaji: string; overview: string;
        love: string; work: string; money: string; advice: string; image: string;
      }>(),
    reading.changing_hexagram_number
      ? c.env.DB.prepare("SELECT * FROM eki_hexagrams WHERE number = ?")
          .bind(reading.changing_hexagram_number).first<{
            number: number; name_jp: string; name_reading: string;
            kaji: string; overview: string; advice: string;
          }>()
      : Promise.resolve(null),
  ]);

  return c.json({
    id: reading.id,
    question: reading.question,
    coins_used: reading.coins_used,
    created_at: reading.created_at,
    honke,
    nouke,
  });
});
