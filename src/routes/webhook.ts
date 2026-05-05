import { Hono } from "hono";

type Env = {
  DB: D1Database;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
};

const webhook = new Hono<{ Bindings: Env }>();

const COIN_MAP: Record<number, number> = {
  500: 100,
  1200: 300,
  1800: 500,
};

webhook.post("/", async (c) => {
  const body = await c.req.text();
  const event = JSON.parse(body);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_details?.email;
    const amount = session.amount_total;

    if (email && amount) {
      const coins = COIN_MAP[amount] || Math.floor(amount / 100);
      const user = await c.env.DB.prepare(
        "SELECT id FROM users WHERE email = ?"
      ).bind(email).first<{ id: string }>();

      if (user) {
        const existing = await c.env.DB.prepare(
          "SELECT id FROM coin_transactions WHERE stripe_payment_id = ?"
        ).bind(session.id).first();

        if (!existing) {
          const now = new Date().toISOString();
          const txId = crypto.randomUUID();
          await c.env.DB.batch([
            c.env.DB.prepare("UPDATE users SET coins = coins + ? WHERE id = ?").bind(coins, user.id),
            c.env.DB.prepare(
              "INSERT INTO coin_transactions (id, user_id, amount, type, stripe_payment_id, created_at) VALUES (?, ?, ?, 'purchase', ?, ?)"
            ).bind(txId, user.id, coins, session.id, now),
          ]);
        }
      }
    }
  }

  return c.json({ received: true });
});

export default webhook;
