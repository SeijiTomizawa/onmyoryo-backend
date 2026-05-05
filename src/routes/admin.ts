import { Hono } from "hono";

type Env = {
  DB: D1Database;
  ADMIN_PASSWORD: string;
};

const admin = new Hono<{ Bindings: Env }>();

admin.use("*", async (c, next) => {
  const auth = c.req.header("X-Admin-Password");
  if (auth !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: "認証が必要です" }, 401);
  }
  await next();
});

// ユーザー一覧・検索
admin.get("/users", async (c) => {
  const q = c.req.query("q");
  let rows;
  if (q) {
    rows = await c.env.DB.prepare(
      "SELECT id, email, display_name as name, coins, created_at FROM users WHERE email LIKE ? OR id = ? ORDER BY created_at DESC LIMIT 50"
    ).bind(`%${q}%`, q).all();
  } else {
    rows = await c.env.DB.prepare(
      "SELECT id, email, display_name as name, coins, created_at FROM users ORDER BY created_at DESC LIMIT 100"
    ).all();
  }
  return c.json({ users: rows.results });
});

// ユーザーのコイン履歴
admin.get("/users/:id/transactions", async (c) => {
  const id = c.req.param("id");
  const rows = await c.env.DB.prepare(
    "SELECT * FROM coin_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20"
  ).bind(id).all();
  return c.json({ transactions: rows.results });
});

// ユーザーの占い履歴
admin.get("/users/:id/readings", async (c) => {
  const id = c.req.param("id");
  const rows = await c.env.DB.prepare(
    "SELECT * FROM readings WHERE user_id = ? ORDER BY created_at DESC LIMIT 30"
  ).bind(id).all();
  const ekiRows = await c.env.DB.prepare(
    "SELECT *, 'eki' as source FROM eki_readings WHERE user_id = ? ORDER BY created_at DESC LIMIT 30"
  ).bind(id).all();
  return c.json({ readings: rows.results, eki_readings: ekiRows.results });
});

// コイン残高更新
admin.post("/coins", async (c) => {
  const body = await c.req.json<{ userId: string; operation: "add" | "sub" | "set"; amount: number }>();
  const { userId, operation, amount } = body;
  if (!userId || isNaN(amount) || amount < 0) return c.json({ error: "無効なパラメータです" }, 400);
  const user = await c.env.DB.prepare("SELECT id, coins FROM users WHERE id = ?").bind(userId).first<{ id: string; coins: number }>();
  if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);
  let newBalance = operation === "add" ? user.coins + amount : operation === "sub" ? Math.max(0, user.coins - amount) : amount;
  const diff = newBalance - user.coins;
  const now = new Date().toISOString();
  const txId = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET coins = ? WHERE id = ?").bind(newBalance, userId),
    c.env.DB.prepare("INSERT INTO coin_transactions (id, user_id, amount, type, created_at) VALUES (?, ?, ?, 'bonus', ?)").bind(txId, userId, diff, now),
  ]);
  return c.json({ success: true, newBalance });
});

// 占い利用履歴（全体統計）
admin.get("/readings", async (c) => {
  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");

  const rows = await c.env.DB.prepare(
    `SELECT r.id, r.user_id, r.reading_type, r.coins_used, r.created_at, u.email
     FROM readings r LEFT JOIN users u ON r.user_id = u.id
     ORDER BY r.created_at DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();

  const ekiRows = await c.env.DB.prepare(
    `SELECT e.id, e.user_id, 'eki' as reading_type, e.coins_used, e.created_at, e.question, u.email
     FROM eki_readings e LEFT JOIN users u ON e.user_id = u.id
     ORDER BY e.created_at DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();

  const stats = await c.env.DB.prepare(
    `SELECT reading_type, COUNT(*) as count, SUM(coins_used) as total_coins FROM readings GROUP BY reading_type`
  ).all();

  const ekiCount = await c.env.DB.prepare(
    `SELECT COUNT(*) as count, SUM(coins_used) as total_coins FROM eki_readings`
  ).first<{ count: number; total_coins: number }>();

  const totalReadings = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM readings`
  ).first<{ count: number }>();

  const totalEki = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM eki_readings`
  ).first<{ count: number }>();

  return c.json({
    readings: rows.results,
    eki_readings: ekiRows.results,
    stats: stats.results,
    eki_stats: ekiCount,
    total_count: (totalReadings?.count || 0) + (totalEki?.count || 0),
  });
});

// ===== fortune_texts =====
admin.get("/fortune-texts", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM fortune_texts ORDER BY star_number").all();
  return c.json({ data: rows.results });
});

admin.put("/fortune-texts/:star", async (c) => {
  const star = parseInt(c.req.param("star"));
  const body = await c.req.json<{ personality: string; talent: string; weakness: string; love: string; work: string }>();
  await c.env.DB.prepare(`INSERT INTO fortune_texts (star_number, star_name, personality, talent, weakness, love, work) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(star_number) DO UPDATE SET personality=excluded.personality, talent=excluded.talent, weakness=excluded.weakness, love=excluded.love, work=excluded.work, updated_at=datetime('now')`).bind(star, ["一白水星","二黒土星","三碧木星","四緑木星","五黄土星","六白金星","七赤金星","八白土星","九紫火星"][star-1], body.personality, body.talent, body.weakness, body.love, body.work).run();
  return c.json({ success: true });
});

// ===== year_fortunes =====
admin.get("/year-fortunes", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM year_fortunes ORDER BY honmei_star, year_star").all();
  return c.json({ data: rows.results });
});

admin.put("/year-fortunes/:honmei/:year", async (c) => {
  const honmei = parseInt(c.req.param("honmei"));
  const year = parseInt(c.req.param("year"));
  const body = await c.req.json<{ title: string; overview: string; love: string; work: string; money: string; advice: string }>();
  await c.env.DB.prepare(`INSERT INTO year_fortunes (honmei_star, year_star, title, overview, love, work, money, advice) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(honmei_star, year_star) DO UPDATE SET title=excluded.title, overview=excluded.overview, love=excluded.love, work=excluded.work, money=excluded.money, advice=excluded.advice, updated_at=datetime('now')`).bind(honmei, year, body.title, body.overview, body.love, body.work, body.money, body.advice).run();
  return c.json({ success: true });
});

// ===== month_fortunes =====
admin.get("/month-fortunes", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM month_fortunes ORDER BY honmei_star, month_star").all();
  return c.json({ data: rows.results });
});

admin.put("/month-fortunes/:honmei/:month", async (c) => {
  const honmei = parseInt(c.req.param("honmei"));
  const month = parseInt(c.req.param("month"));
  const body = await c.req.json<{ overview: string; advice: string }>();
  await c.env.DB.prepare(`INSERT INTO month_fortunes (honmei_star, month_star, overview, advice) VALUES (?, ?, ?, ?) ON CONFLICT(honmei_star, month_star) DO UPDATE SET overview=excluded.overview, advice=excluded.advice, updated_at=datetime('now')`).bind(honmei, month, body.overview, body.advice).run();
  return c.json({ success: true });
});

// ===== direction_texts =====
admin.get("/direction-texts", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM direction_texts ORDER BY star_number").all();
  return c.json({ data: rows.results });
});

admin.put("/direction-texts/:star", async (c) => {
  const star = parseInt(c.req.param("star"));
  const body = await c.req.json<{ lucky_detail: string; unlucky_detail: string; travel_advice: string }>();
  await c.env.DB.prepare(`INSERT INTO direction_texts (star_number, lucky_detail, unlucky_detail, travel_advice) VALUES (?, ?, ?, ?) ON CONFLICT(star_number) DO UPDATE SET lucky_detail=excluded.lucky_detail, unlucky_detail=excluded.unlucky_detail, travel_advice=excluded.travel_advice, updated_at=datetime('now')`).bind(star, body.lucky_detail, body.unlucky_detail, body.travel_advice).run();
  return c.json({ success: true });
});

// ===== reading_costs =====

// コスト一覧取得
admin.get("/costs", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM reading_costs ORDER BY coins, reading_type"
  ).all();
  return c.json({ data: rows.results });
});

// コスト更新
admin.put("/costs/:reading_type", async (c) => {
  const readingType = c.req.param("reading_type");
  const body = await c.req.json<{ coins: number; label?: string; description?: string }>();
  if (isNaN(body.coins) || body.coins < 0) {
    return c.json({ error: "無効なコイン数です" }, 400);
  }
  await c.env.DB.prepare(`
    UPDATE reading_costs
    SET coins = ?, label = COALESCE(?, label), description = COALESCE(?, description), updated_at = datetime('now')
    WHERE reading_type = ?
  `).bind(body.coins, body.label ?? null, body.description ?? null, readingType).run();
  return c.json({ success: true });
});

export default admin;