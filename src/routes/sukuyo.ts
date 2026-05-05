import { Hono } from "hono";
import { calcShukuIndex, calcCompatibility, calcFullCompatibility, SUKUYO_NAMES } from "../lib/sukuyo";
import { verifyJWT, extractBearerToken } from "../lib/auth";

type Env = { DB: D1Database; JWT_SECRET: string };
const sukuyo = new Hono<{ Bindings: Env }>();

type SukuyoRow = {
  shuku_index: number; shuku_name: string; symbol: string; element: string;
  personality: string; talent: string; weakness: string;
  love: string; work: string; lucky: string;
};

// 無料プレビュー
sukuyo.get("/preview", async (c) => {
  const { year, month, day } = c.req.query();
  const y = parseInt(year), m = parseInt(month), d = parseInt(day);
  if (!y || !m || !d || y < 1900 || y > 2010) {
    return c.json({ error: "生年月日が正しくありません" }, 400);
  }
  const idx = calcShukuIndex(y, m, d);
  const text = await c.env.DB.prepare(
    "SELECT * FROM sukuyo_texts WHERE shuku_index = ?"
  ).bind(idx).first<SukuyoRow>();
  return c.json({
    shukuIndex: idx,
    shuku: text?.shuku_name ?? SUKUYO_NAMES[idx],
    symbol: text?.symbol ?? '🌙',
    element: text?.element ?? '',
    personality: text ? text.personality.slice(0, 60) + '...' : '',
    preview: true,
  });
});

// 有料詳細鑑定（2コイン）
sukuyo.post("/reading", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const COST = 2;
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(payload.sub).first<{ id: string; birth_date: string; coins: number }>();
  if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);
  if (user.coins < COST) return c.json({ error: "コインが不足しています", required: COST, current: user.coins }, 402);

  const [y, m, d] = user.birth_date.split('-').map(Number);
  const idx = calcShukuIndex(y, m, d);
  const text = await c.env.DB.prepare(
    "SELECT * FROM sukuyo_texts WHERE shuku_index = ?"
  ).bind(idx).first<SukuyoRow>();
  if (!text) return c.json({ error: "宿曜データが登録されていません" }, 500);

  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET coins = coins - ? WHERE id = ?").bind(COST, user.id),
    c.env.DB.prepare(
      "INSERT INTO coin_transactions (id, user_id, amount, type, created_at) VALUES (?, ?, ?, 'use', ?)"
    ).bind(crypto.randomUUID(), user.id, -COST, now),
  ]);

  return c.json({
    coinsUsed: COST,
    remainingCoins: user.coins - COST,
    shukuIndex: idx,
    shuku: text.shuku_name,
    symbol: text.symbol,
    element: text.element,
    personality: text.personality,
    talent: text.talent,
    weakness: text.weakness,
    love: text.love,
    work: text.work,
    lucky: text.lucky,
    compatibility: calcCompatibility(idx),
    birthDate: `${y}年${m}月${d}日`,
  });
});

// 相性鑑定（3コイン）
sukuyo.post("/compat", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const COST = 3;
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(payload.sub).first<{ id: string; birth_date: string; coins: number }>();
  if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);
  if (user.coins < COST) return c.json({ error: "コインが不足しています", required: COST, current: user.coins }, 402);

  const body = await c.req.json<{ targetYear?: number; targetMonth?: number; targetDay?: number }>();
  const { targetYear, targetMonth, targetDay } = body;
  if (!targetYear || !targetMonth || !targetDay) {
    return c.json({ error: "相手の生年月日が必要です" }, 400);
  }

  const [y, m, d] = user.birth_date.split('-').map(Number);
  const myIdx = calcShukuIndex(y, m, d);
  const targetIdx = calcShukuIndex(targetYear, targetMonth, targetDay);

  const [myText, targetText] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM sukuyo_texts WHERE shuku_index = ?").bind(myIdx).first<SukuyoRow>(),
    c.env.DB.prepare("SELECT * FROM sukuyo_texts WHERE shuku_index = ?").bind(targetIdx).first<SukuyoRow>(),
  ]);

  // 全相性リスト
  const fullCompat = calcFullCompatibility(myIdx);
  const targetCompat = fullCompat.find(c => c.shukuIndex === targetIdx);

  // 相性スコア（100点満点）
  const scoreMap: Record<string, number> = {
    '安宿': 95, '栄宿': 85, '命宿': 80, '友宿': 70,
    '本宿（同宿）': 75, '業宿': 50, '衰宿': 30,
  };
  const score = scoreMap[targetCompat?.relation ?? ''] ?? 60;

  // コイン消費
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET coins = coins - ? WHERE id = ?").bind(COST, user.id),
    c.env.DB.prepare(
      "INSERT INTO coin_transactions (id, user_id, amount, type, created_at) VALUES (?, ?, ?, 'use', ?)"
    ).bind(crypto.randomUUID(), user.id, -COST, now),
  ]);

  return c.json({
    coinsUsed: COST,
    remainingCoins: user.coins - COST,
    // 自分
    my: {
      shukuIndex: myIdx,
      shuku: myText?.shuku_name ?? SUKUYO_NAMES[myIdx],
      symbol: myText?.symbol ?? '🌙',
      element: myText?.element ?? '',
      personality: myText?.personality ?? '',
      birthDate: `${y}年${m}月${d}日`,
    },
    // 相手
    target: {
      shukuIndex: targetIdx,
      shuku: targetText?.shuku_name ?? SUKUYO_NAMES[targetIdx],
      symbol: targetText?.symbol ?? '🌙',
      element: targetText?.element ?? '',
      personality: targetText?.personality ?? '',
      birthDate: `${targetYear}年${targetMonth}月${targetDay}日`,
    },
    // 相性
    relation: targetCompat?.relation ?? '普通',
    desc: targetCompat?.desc ?? '',
    score,
    // 分野別アドバイス
    love: score >= 80
      ? `${myText?.shuku_name ?? ''}と${targetText?.shuku_name ?? ''}は恋愛において深い絆を築けます。${myText?.love?.slice(0, 40) ?? ''}という特質が相手にとって魅力的に映ります。`
      : score >= 60
      ? `お互いの違いを尊重することで、恋愛関係を深めることができます。コミュニケーションを大切に。`
      : `恋愛には工夫が必要な相性です。相手の価値観を理解し、焦らずゆっくり関係を築きましょう。`,
    work: score >= 80
      ? `仕事でのパートナーシップは最高です。互いの強みを活かして大きな成果を生み出せます。`
      : score >= 60
      ? `お互いの役割を明確にすることで、仕事上でも良い関係を築けます。`
      : `仕事上では意見が合わないこともありますが、それが新たな視点を生む可能性もあります。`,
    friendship: score >= 70
      ? `友人としても最良の相性です。自然と打ち解けられ、長期的な友情を育めます。`
      : `友人関係では共通の趣味や目標を見つけることが、関係を深めるカギです。`,
    advice: score >= 80
      ? `この出会いを大切に。宿曜の縁に従い、積極的に関係を深めていきましょう。`
      : score >= 60
      ? `お互いの宿の特性を理解し、相手の良いところに目を向けることで関係が豊かになります。`
      : `相性の課題はありますが、乗り越えることで深い絆が生まれます。忍耐と理解が大切です。`,
    // 全相性リスト（参考）
    allCompat: fullCompat,
  });
});

// 年間運勢（3コイン）
sukuyo.post("/yearly", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const COST = 3;
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(payload.sub).first<{ id: string; birth_date: string; coins: number }>();
  if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);
  if (user.coins < COST) return c.json({ error: "コインが不足しています", required: COST, current: user.coins }, 402);

  const body = await c.req.json<{ targetYear?: number }>();
  const targetYear = body.targetYear || new Date().getFullYear();

  const [y, m, d] = user.birth_date.split('-').map(Number);
  const idx = calcShukuIndex(y, m, d);

  const text = await c.env.DB.prepare(
    "SELECT * FROM sukuyo_texts WHERE shuku_index = ?"
  ).bind(idx).first<SukuyoRow>();
  if (!text) return c.json({ error: "宿曜データが登録されていません" }, 500);

  const months = Array.from({ length: 12 }, (_, i) => {
    const monthIdx = i + 1;
    const cycle = (idx + i) % 9;
    const levelMap: number[] = [5, 4, 3, 4, 3, 2, 3, 4, 5];
    const level = levelMap[cycle] ?? 3;
    const keywords = ['新たな出会い', '積極行動', '内省期', '運気上昇', '慎重に', '好機到来', '安定期', '変化の波', '飛躍の時'];
    const messages = [
      `${monthIdx}月は積極的に動くことで新たな縁が生まれます。人との交流を大切に。`,
      `${monthIdx}月は実力を発揮できる時期。チャレンジを恐れずに。`,
      `${monthIdx}月は焦らず内側を整える時期。準備が後の成功を呼びます。`,
      `${monthIdx}月は運気の流れが良く、新しい取り組みに吉。`,
      `${monthIdx}月は慎重さが求められます。大きな決断は次月まで待って。`,
      `${monthIdx}月は好機が到来します。直感を信じて行動を。`,
      `${monthIdx}月は安定した運気が続きます。基盤を固めましょう。`,
      `${monthIdx}月は変化の波が来ます。柔軟に対応することが吉。`,
      `${monthIdx}月は大きな飛躍が期待できます。全力で取り組んで。`,
    ];
    return {
      month: monthIdx,
      level,
      keyword: keywords[cycle],
      message: messages[cycle],
      advice: level <= 2 ? `${monthIdx}月は無理をせず、体を休めることを優先しましょう。重要な契約や投資は避けて。` : undefined,
    };
  });

  const overviewLevel = months.reduce((sum, m) => sum + m.level, 0) / 12;
  const overview = overviewLevel >= 3.5
    ? `${targetYear}年は${text.shuku_name}にとって躍進の年です。持ち前の${text.element}の気が活性化し、新たな展開が次々と訪れます。`
    : `${targetYear}年は${text.shuku_name}にとって内側を深める年です。焦らず着実に歩むことで、来年以降の大きな飛躍の種を蒔く時期となります。`;

  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET coins = coins - ? WHERE id = ?").bind(COST, user.id),
    c.env.DB.prepare(
      "INSERT INTO coin_transactions (id, user_id, amount, type, created_at) VALUES (?, ?, ?, 'use', ?)"
    ).bind(crypto.randomUUID(), user.id, -COST, now),
  ]);

  return c.json({
    coinsUsed: COST,
    remainingCoins: user.coins - COST,
    shukuIndex: idx,
    shuku: text.shuku_name,
    symbol: text.symbol,
    targetYear,
    overview,
    months,
    keywords: [text.element + 'の気', '月の守護', text.shuku_name],
    advice: `今年は${text.lucky}を意識した行動が開運の鍵です。${text.personality.slice(0, 50)}という本質を活かし、${targetYear}年をあなたらしく輝いてください。`,
  });
});

export default sukuyo;