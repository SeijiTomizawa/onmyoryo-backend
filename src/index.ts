import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import auth from "./routes/auth";
import fortune from "./routes/fortune";
import coins from "./routes/coins";
import admin from "./routes/admin";
import shichu from "./routes/shichu";
import sukuyo from "./routes/sukuyo";
import eki from "./routes/eki";
import profile from "./routes/profile";
import ai_fortune from "./routes/ai_fortune";
import webhook from "./routes/_webhook";

type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  ADMIN_PASSWORD: string;
};

const app = new Hono<{ Bindings: Env }>();

// ロガー
app.use("*", logger());

// CORSの設定（完全版）
app.use("*", cors({
  origin: (origin) => {
    // リクエスト元（origin）が以下のいずれかに一致する場合は、そのoriginを許可する
    if (origin && (
      origin === "http://localhost:4321" ||
      origin === "https://onmyoryo-frontend.pages.dev" ||
      origin.endsWith(".onmyoryo-frontend.pages.dev") // 動的なプレビューURL対応
    )) {
      return origin;
    }
    // 一致しない場合、またはOriginヘッダーが無い場合のデフォルト値
    return "https://onmyoryo-frontend.pages.dev";
  },
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Admin-Password"],
  credentials: true,
}));

// ルーティング
app.get("/", (c) => c.json({ status: "ok", service: "九星気学API" }));
app.route("/api/auth", auth);
app.route("/api/fortune", fortune);
app.route("/api/stripe/webhook", webhook);
app.route("/api/coins", coins);
app.route("/api/admin", admin);
app.route("/api/shichu", shichu);
app.route("/api/sukuyo", sukuyo);
app.route("/api/eki", eki);
app.route("/api/profile", profile);
app.route("/api/ai_fortune", ai_fortune);

// エラーハンドリング
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "サーバーエラーが発生しました" }, 500);
});

export default app;