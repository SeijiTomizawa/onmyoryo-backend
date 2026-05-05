/**
 * JWT 認証ユーティリティ（Web Crypto API使用 / Cloudflare Workers対応）
 */

export interface JWTPayload {
  sub: string;      // user id
  email: string;
  iat: number;
  exp: number;
}

function base64url(data: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(data)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  return new Uint8Array([...binary].map((c) => c.charCodeAt(0)));
}

async function getKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signJWT(
  payload: Omit<JWTPayload, "iat" | "exp">,
  secret: string,
  expiresIn = 60 * 60 * 24 * 7 // 7日
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
  };
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = btoa(JSON.stringify(header))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const payloadB64 = btoa(JSON.stringify(fullPayload))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const data = `${headerB64}.${payloadB64}`;
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );
  return `${data}.${base64url(sig)}`;
}

export async function verifyJWT(
  token: string,
  secret: string
): Promise<JWTPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  const key = await getKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64urlDecode(sigB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  );
  if (!valid) return null;
  const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))) as JWTPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}
