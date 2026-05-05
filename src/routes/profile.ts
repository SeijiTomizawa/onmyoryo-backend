import { Hono } from "hono";
import { verifyJWT, extractBearerToken } from "../lib/auth";

type Env = { DB: D1Database; JWT_SECRET: string };
const profile = new Hono<{ Bindings: Env }>();

// プロフィール取得
profile.get("/", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const user = await c.env.DB.prepare(
    "SELECT id, email, display_name, birth_date, gender, coins, created_at FROM users WHERE id = ?"
  ).bind(payload.sub).first<{
    id: string; email: string; display_name: string | null;
    birth_date: string; coins: number; created_at: string;
  }>();

  if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);
  return c.json({ user });
});

// 表示名・生年月日の更新
profile.put("/", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const { display_name, birth_date, gender } = await c.req.json<{
    display_name?: string;
    gender?: string;
    birth_date?: string;
  }>();

  const updates: string[] = [];
  const values: unknown[] = [];

  if (display_name !== undefined) {
    updates.push("display_name = ?");
    values.push(display_name.trim());
  }
  if (birth_date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth_date)) {
      return c.json({ error: "生年月日の形式が正しくありません" }, 400);
    }
    updates.push("birth_date = ?");
    values.push(birth_date);
  }
  if (gender !== undefined) {
    if (!['m', 'f'].includes(gender)) {
      return c.json({ error: "性別の値が正しくありません" }, 400);
    }
    updates.push("gender = ?");
    values.push(gender);
  }

  if (updates.length === 0) return c.json({ error: "更新内容がありません" }, 400);

  values.push(payload.sub);
  await c.env.DB.prepare(
    `UPDATE users SET ${updates.join(", ")}, updated_at = datetime('now') WHERE id = ?`
  ).bind(...values).run();

  // 更新後のユーザー情報を返す
  const user = await c.env.DB.prepare(
    "SELECT id, email, display_name, birth_date, gender, coins FROM users WHERE id = ?"
  ).bind(payload.sub).first();

  // localStorageのユーザー情報更新用にトークンも返す
  return c.json({ success: true, user });
});

// パスワード変更
profile.put("/password", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const { current_password, new_password } = await c.req.json<{
    current_password: string;
    new_password: string;
  }>();

  if (!current_password || !new_password) {
    return c.json({ error: "現在のパスワードと新しいパスワードを入力してください" }, 400);
  }
  if (new_password.length < 8) {
    return c.json({ error: "新しいパスワードは8文字以上にしてください" }, 400);
  }

  const user = await c.env.DB.prepare(
    "SELECT password_hash FROM users WHERE id = ?"
  ).bind(payload.sub).first<{ password_hash: string }>();

  if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);

  // 現在のパスワード確認
  const valid = await verifyPassword(current_password, user.password_hash);
  if (!valid) return c.json({ error: "現在のパスワードが正しくありません" }, 401);

  // 新しいパスワードをハッシュ化して保存
  const newHash = await hashPassword(new_password);
  await c.env.DB.prepare(
    "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(newHash, payload.sub).run();

  return c.json({ success: true });
});

// パスワードハッシュ
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  const saltHex = [...salt].map(b => b.toString(16).padStart(2, "0")).join("");
  const hashHex = [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  const candidate = [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
  return candidate === hashHex;
}

export default profile;
