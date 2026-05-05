import { Hono } from "hono";
import { signJWT } from "../lib/auth";

type Env = { DB: D1Database; JWT_SECRET: string };
const auth = new Hono<{ Bindings: Env }>();

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", salt, iterations:100000, hash:"SHA-256" }, key, 256);
  const saltHex = [...salt].map(b => b.toString(16).padStart(2,"0")).join("");
  const hashHex = [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2,"0")).join("");
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", salt, iterations:100000, hash:"SHA-256" }, key, 256);
  const candidate = [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2,"0")).join("");
  return candidate === hashHex;
}

auth.post("/register", async (c) => {
  const { email, password, birth_date } = await c.req.json<{ email:string; password:string; birth_date:string }>();
  if (!email || !password || !birth_date) return c.json({ error:"必須項目が不足しています" }, 400);
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, birth_date, coins) VALUES (?, ?, ?, ?, 0)"
    ).bind(id, email, await hashPassword(password), birth_date).run();
  } catch {
    return c.json({ error:"このメールアドレスは既に登録されています" }, 409);
  }
  const token = await signJWT({ sub:id, email }, c.env.JWT_SECRET);
  return c.json({ token, user:{ id, email, birth_date, coins:0 } }, 201);
});

auth.post("/login", async (c) => {
  const { email, password } = await c.req.json<{ email:string; password:string }>();
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?")
    .bind(email).first<{ id:string; email:string; password_hash:string; birth_date:string; coins:number }>();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error:"メールアドレスまたはパスワードが違います" }, 401);
  }
  const token = await signJWT({ sub:user.id, email:user.email }, c.env.JWT_SECRET);
  return c.json({ token, user:{ id:user.id, email:user.email, birth_date:user.birth_date, coins:user.coins } });
});

export default auth;
