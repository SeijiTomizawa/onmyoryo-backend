import { Hono } from "hono";

type Env = {
  DB: D1Database;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
};

const webhook = new Hono<{ Bindings: Env }>();

// コイン付与マップ
const COIN_MAP: Record<number, number> = {
  100: 1,    // ¥100 → 1コイン
  900: 10,   // ¥900 → 10コイン
  1700: 20,  // ¥1,700 → 20コイン
  990: 10,   // ¥990/月 → 10コイン
};

webhook.post("/", async (c) => {
  const signature = c.req.header("stripe-signature");
  if (!signature) return c.json({ error: "No signature" }, 400);

  const body = await c.req.text();
  

  // 署名ヘッダーをログに出力
  console.log("stripe-signature:", signature);
  // Stripe署名検証
  // try {
  //   const isValid = await verifyStripeSignature(
  //     body,
  //     signature,
  //     c.env.STRIPE_WEBHOOK_SECRET
  //   );
  //   if (!isValid) return c.json({ error: "Invalid signature" }, 400);
  // } catch {
  //   return c.json({ error: "Signature verification failed" }, 400);
  // }

  const event = JSON.parse(body);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    await handleCheckoutCompleted(session, c.env.DB, c.env.STRIPE_SECRET_KEY);
  }

  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object;
    await handleInvoicePaymentSucceeded(invoice, c.env.DB, c.env.STRIPE_SECRET_KEY);
  }

  return c.json({ received: true });
});

async function handleCheckoutCompleted(session: any, DB: D1Database, stripeKey: string) {
  const customerEmail = session.customer_email || session.customer_details?.email;
  const amountTotal = session.amount_total;

  if (!customerEmail || !amountTotal) return;

  // サブスクリプションの場合はinvoice.payment_succeededで処理
  if (session.mode === "subscription") return;

  const coins = COIN_MAP[amountTotal] || Math.floor(amountTotal / 100);
  await addCoins(DB, customerEmail, coins, amountTotal, session.id);
}

async function handleInvoicePaymentSucceeded(invoice: any, DB: D1Database, stripeKey: string) {
  // サブスクリプションの請求のみ処理
  if (!invoice.subscription) return;

  const customerEmail = invoice.customer_email;
  const amountPaid = invoice.amount_paid;

  if (!customerEmail || !amountPaid) return;

  const coins = COIN_MAP[amountPaid] || Math.floor(amountPaid / 100);
  await addCoins(DB, customerEmail, coins, amountPaid, invoice.id);
}

async function addCoins(
  DB: D1Database,
  email: string,
  coins: number,
  amountPaid: number,
  stripeId: string
) {
  // メールアドレスからユーザーを検索
  const user = await DB.prepare(
    "SELECT id FROM users WHERE email = ?"
  ).bind(email).first<{ id: string }>();

  if (!user) return;

  // 重複付与防止（同じstripeIdで既に付与済みか確認）
  const existing = await DB.prepare(
    "SELECT id FROM coin_transactions WHERE stripe_payment_id = ?"
  ).bind(stripeId).first();

  if (existing) return;

  const now = new Date().toISOString();
  const txId = crypto.randomUUID();

  await DB.batch([
    DB.prepare("UPDATE users SET coins = coins + ? WHERE id = ?").bind(coins, user.id),
    DB.prepare(
      "INSERT INTO coin_transactions (id, user_id, amount, type, stripe_payment_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(txId, user.id, coins, "purchase", stripeId, now),
  ]);
}

// Stripe署名検証（Web Crypto API使用）
async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  const parts = sigHeader.split(",");
  const tPart = parts.find(p => p.startsWith("t="));
  const v1Part = parts.find(p => p.startsWith("v1="));

  if (!tPart || !v1Part) return false;

  const timestamp = tPart.split("=")[1];
  const signature = v1Part.split("=")[1];

  const signedPayload = `${timestamp}.${payload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload)
  );

  const expected = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  // タイムスタンプが5分以内か確認
  const ts = parseInt(timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return false;

  return expected === signature;
}

export default webhook;
