import { Hono } from "hono";
import { verifyJWT, extractBearerToken } from "../lib/auth";

type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
};

const coins = new Hono<{ Bindings: Env }>();

// コインプラン定義
const COIN_PLANS = [
  { id: "plan_100", coins: 100, price: 500, label: "100コイン" },
  { id: "plan_300", coins: 300, price: 1200, label: "300コイン（お得）" },
  { id: "plan_500", coins: 500, price: 1800, label: "500コイン（最もお得）" },
] as const;

// プラン一覧
coins.get("/plans", (c) => {
  return c.json({ plans: COIN_PLANS });
});

// 残高確認
coins.get("/balance", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const user = await c.env.DB.prepare(
    "SELECT coins FROM users WHERE id = ?"
  ).bind(payload.sub).first<{ coins: number }>();

  return c.json({ coins: user?.coins ?? 0 });
});

// Stripe決済セッション作成
coins.post("/purchase", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const { plan_id, success_url, cancel_url } = await c.req.json<{
    plan_id: string;
    success_url: string;
    cancel_url: string;
  }>();

  const plan = COIN_PLANS.find((p) => p.id === plan_id);
  if (!plan) return c.json({ error: "無効なプランです" }, 400);

  // ユーザーのメールアドレスを取得
  const user = await c.env.DB.prepare(
    "SELECT email FROM users WHERE id = ?"
  ).bind(payload.sub).first<{ email: string }>();

  if (!user?.email) return c.json({ error: "ユーザーが見つかりません" }, 404);

  // Stripe Checkout Session作成
  const stripeRes = await fetch(
    "https://api.stripe.com/v1/checkout/sessions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "line_items[0][price_data][currency]": "jpy",
        "line_items[0][price_data][unit_amount]": plan.price.toString(),
        "line_items[0][price_data][product_data][name]": plan.label,
        "line_items[0][quantity]": "1",
        mode: "payment",
        success_url,
        cancel_url,
        customer_email: user.email,
        "metadata[user_id]": payload.sub,
        "metadata[plan_id]": plan.id,
        "metadata[coins]": plan.coins.toString(),
      }),
    }
  );

  const session = await stripeRes.json() as { url?: string; error?: { message: string } };
  if (!session.url) {
    return c.json({ error: "決済の開始に失敗しました" }, 500);
  }
  return c.json({ checkoutUrl: session.url });
});

export default coins;