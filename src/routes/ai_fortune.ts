import { Hono } from "hono";
import { verifyJWT, extractBearerToken } from "../lib/auth";

type Env = { DB: D1Database; JWT_SECRET: string };
const ai_fortune = new Hono<{ Bindings: Env }>();

// ==========================================
// 相性鑑定（3コイン）
// ==========================================
ai_fortune.post("/compat", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const COST = 3;
  const { target_year, target_name } = await c.req.json<{
    target_year: number;
    target_name: string;
  }>();

  if (!target_year || target_year < 1900 || target_year > 2010) {
    return c.json({ error: "相手の生年を正しく入力してください" }, 400);
  }

  const user = await c.env.DB.prepare(
    "SELECT id, birth_date, coins FROM users WHERE id = ?"
  ).bind(payload.sub).first<{ id: string; birth_date: string; coins: number }>();

  if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);
  if (user.coins < COST) return c.json({ error: "コインが不足しています", required: COST, current: user.coins }, 402);

  const [myYear] = user.birth_date.split('-').map(Number);
  const myHonmei = getHonmei(myYear);
  const targetHonmei = getHonmei(target_year);

  const myText = await c.env.DB.prepare(
    "SELECT star_name, personality, love, work FROM fortune_texts WHERE star_number = ?"
  ).bind(myHonmei).first<{ star_name: string; personality: string; love: string; work: string }>();

  const targetText = await c.env.DB.prepare(
    "SELECT star_name, personality, love, work FROM fortune_texts WHERE star_number = ?"
  ).bind(targetHonmei).first<{ star_name: string; personality: string; love: string; work: string }>();

  const compat = calcCompat(myHonmei, targetHonmei);

  const now = new Date().toISOString();
  const readingId = crypto.randomUUID();
  const resultJson = JSON.stringify({
    myHonmei, targetHonmei,
    myStarName: myText?.star_name,
    targetStarName: targetText?.star_name,
    targetName: target_name,
    compat,
  });

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET coins = coins - ? WHERE id = ?").bind(COST, user.id),
    c.env.DB.prepare(
      "INSERT INTO readings (id, user_id, reading_type, coins_used, result_json, created_at) VALUES (?, ?, 'compat', ?, ?, ?)"
    ).bind(readingId, user.id, COST, resultJson, now),
  ]);

  return c.json({
    readingId,
    coinsUsed: COST,
    remainingCoins: user.coins - COST,
    myHonmei,
    myStarName: myText?.star_name,
    targetHonmei,
    targetStarName: targetText?.star_name,
    targetName: target_name,
    compat,
    myText,
    targetText,
  });
});

// ==========================================
// 月運詳細（2コイン）
// ==========================================
ai_fortune.post("/monthly", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const COST = 2;
  const user = await c.env.DB.prepare(
    "SELECT id, birth_date, coins FROM users WHERE id = ?"
  ).bind(payload.sub).first<{ id: string; birth_date: string; coins: number }>();

  if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);
  if (user.coins < COST) return c.json({ error: "コインが不足しています", required: COST, current: user.coins }, 402);

  const [myYear] = user.birth_date.split('-').map(Number);
  const honmei = getHonmei(myYear);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const monthStar = getMonthStar(currentYear, currentMonth);

  const [fortuneText, monthFortune] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM fortune_texts WHERE star_number = ?").bind(honmei).first<any>(),
    c.env.DB.prepare(
      "SELECT * FROM month_fortunes WHERE honmei_star = ? AND month_star = ?"
    ).bind(honmei, monthStar).first<any>(),
  ]);

  const score = calcMonthScore(honmei, monthStar);
  const dayFortunes = calcDayFortunes(honmei, currentYear, currentMonth);

  const nowIso = now.toISOString();
  const readingId = crypto.randomUUID();
  const resultJson = JSON.stringify({ honmei, monthStar, score, year: currentYear, month: currentMonth });

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET coins = coins - ? WHERE id = ?").bind(COST, user.id),
    c.env.DB.prepare(
      "INSERT INTO readings (id, user_id, reading_type, coins_used, result_json, created_at) VALUES (?, ?, 'monthly', ?, ?, ?)"
    ).bind(readingId, user.id, COST, resultJson, nowIso),
  ]);

  return c.json({
    readingId,
    coinsUsed: COST,
    remainingCoins: user.coins - COST,
    year: currentYear,
    month: currentMonth,
    honmei,
    starName: fortuneText?.star_name,
    monthStar,
    score,
    overview: monthFortune?.overview || generateMonthOverview(honmei, monthStar, currentMonth),
    advice: monthFortune?.advice || generateMonthAdvice(honmei, monthStar),
    love: generateMonthLove(honmei, monthStar),
    work: generateMonthWork(honmei, monthStar),
    money: generateMonthMoney(honmei, monthStar),
    health: generateMonthHealth(honmei, monthStar),
    luckyDay: calcLuckyDays(honmei, currentYear, currentMonth),
    cautionDay: calcCautionDays(honmei, currentYear, currentMonth),
    dayFortunes,
  });
});

// ==========================================
// 日運詳細（1コイン）
// ==========================================
ai_fortune.post("/daily", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const COST = 1;
  const user = await c.env.DB.prepare(
    "SELECT id, birth_date, coins FROM users WHERE id = ?"
  ).bind(payload.sub).first<{ id: string; birth_date: string; coins: number }>();

  if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);
  if (user.coins < COST) return c.json({ error: "コインが不足しています", required: COST, current: user.coins }, 402);

  const [myYear] = user.birth_date.split('-').map(Number);
  const honmei = getHonmei(myYear);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const weekDay = now.getDay();
  const WEEK_NAMES = ['日','月','火','水','木','金','土'];

  const base = new Date(2024, 0, 1);
  const diff = Math.floor((now.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
  const dayStarRaw = ((9 - (diff % 9)) % 9) + 1;
  const dayStar = dayStarRaw === 0 ? 9 : dayStarRaw;

  const score = calcMonthScore(honmei, dayStar);
  const level = score >= 85 ? 'best' : score >= 70 ? 'good' : score >= 55 ? 'normal' : 'caution';

  const SCORE_LABELS: Record<string, string> = {
    best: '大吉 ✦ 最高の一日',
    good: '吉 ✧ 良い一日',
    normal: '中吉 今日も誠実に',
    caution: '注意 休息が大切',
  };

  const rows = await c.env.DB.prepare(
    "SELECT category, value, sort_order FROM daily_fortune_texts WHERE star_number = ? ORDER BY sort_order"
  ).bind(honmei).all<{ category: string; value: string; sort_order: number }>();

  const d: Record<string, string[]> = {};
  for (const row of rows.results) {
    if (!d[row.category]) d[row.category] = [];
    d[row.category].push(row.value);
  }

  const colorIdx = day % (d['lucky_color']?.length || 1);
  const itemIdx = (day + dayStar) % (d['lucky_item']?.length || 1);
  const foodIdx = (day * 2) % (d['lucky_food']?.length || 1);
  const actionIdx = day % (d['recommended_action']?.length || 1);
  const cautionIdx = day % (d['caution_action']?.length || 1);

  const message = d[`message_${level}`]?.[0] || '';
  const luckyDirection = d['lucky_direction']?.[0] || '';
  const luckySpot = d['lucky_spot']?.[0] || '';

  const actions = d['recommended_action'] || [];
  const selectedActions = [
    actions[actionIdx % Math.max(actions.length, 1)],
    actions[(actionIdx + 1) % Math.max(actions.length, 1)],
    actions[(actionIdx + 2) % Math.max(actions.length, 1)],
  ].filter(Boolean);

  const cautions = d['caution_action'] || [];
  const selectedCautions = [
    cautions[cautionIdx % Math.max(cautions.length, 1)],
    cautions[(cautionIdx + 1) % Math.max(cautions.length, 1)],
  ].filter(Boolean);

  const nowIso = now.toISOString();
  const readingId = crypto.randomUUID();

  try {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE users SET coins = coins - ? WHERE id = ?").bind(COST, user.id),
      c.env.DB.prepare(
        "INSERT INTO readings (id, user_id, reading_type, coins_used, result_json, created_at) VALUES (?, ?, 'daily', ?, ?, ?)"
      ).bind(readingId, user.id, COST, JSON.stringify({ honmei, dayStar, score, year, month, day }), nowIso),
    ]);
  } catch (dbErr: any) {
    return c.json({ error: "DB error: " + dbErr.message }, 500);
  }

  return c.json({
    readingId,
    coinsUsed: COST,
    remainingCoins: user.coins - COST,
    date: `${year}年${month}月${day}日（${WEEK_NAMES[weekDay]}）`,
    honmei,
    dayStar,
    score,
    level,
    scoreLabel: SCORE_LABELS[level],
    message,
    luckyColor: d['lucky_color']?.slice(0, 2) || [],
    luckyItem: d['lucky_item']?.[itemIdx] || '',
    luckyFood: d['lucky_food']?.[foodIdx] || '',
    luckyDirection,
    luckySpot,
    recommendedActions: selectedActions,
    cautionActions: selectedCautions,
  });
});

// ==========================================
// 計算ロジック
// ==========================================
function getHonmei(year: number): number {
  const h = (11 - (year % 9)) % 9;
  return h === 0 ? 9 : h;
}

function getMonthStar(year: number, month: number): number {
  const base = ((year - 2000) * 12 + (month - 1)) % 9;
  const star = ((8 - base) % 9) + 1;
  return star <= 0 ? star + 9 : star;
}

function calcCompat(my: number, target: number) {
  const GOGYO: Record<number, string> = {
    1:'water', 2:'earth', 3:'wood', 4:'wood',
    5:'earth', 6:'metal', 7:'metal', 8:'earth', 9:'fire'
  };
  const COMPAT_MAP: Record<string, Record<string, string>> = {
    water: { water:'good', wood:'best', fire:'bad',  earth:'worst', metal:'best' },
    wood:  { water:'best', wood:'good', fire:'best', earth:'bad',   metal:'worst' },
    fire:  { water:'worst',wood:'best', fire:'good', earth:'best',  metal:'bad' },
    earth: { water:'bad',  wood:'worst',fire:'best', earth:'good',  metal:'best' },
    metal: { water:'best', wood:'bad',  fire:'worst',earth:'best',  metal:'good' },
  };
  const myEl = GOGYO[my];
  const targetEl = GOGYO[target];
  const level = COMPAT_MAP[myEl]?.[targetEl] || 'good';

  const COMPAT_DATA: Record<string, { score: number; label: string; overall: string; love: string; work: string; advice: string }> = {
    best: {
      score: 92,
      label: '大吉 ✦ 運命の縁',
      overall: '二人の気は自然に調和し、互いを高め合う最高の組み合わせです。一緒にいると自然と元気になれ、困難も共に乗り越えられる強い縁で結ばれています。この出会いは偶然ではなく、必然です。',
      love: '恋愛においては、魂レベルで共鳴し合える深い関係になれます。付き合い始めは穏やかに、しかし時間が経つほど二人の絆は強固なものになります。長く続く、本物の縁です。',
      work: '仕事やプロジェクトを共にすると、互いの強みが引き出され、1+1が3にも4にもなります。あなたの弱点を相手が、相手の弱点をあなたが自然と補い合える最高のパートナーです。',
      advice: 'この縁を大切に育ててください。焦らず、丁寧に関係を深めることで、人生の中で最も大切な縁のひとつになります。'
    },
    good: {
      score: 75,
      label: '吉 ✧ 相性良好',
      overall: '二人の気は基本的に良い相性です。大きな摩擦なく自然に関係を築くことができ、長期的に安定した縁になりやすい組み合わせです。',
      love: '恋愛では、友達から始まる自然な発展が向いています。急がず焦らず、お互いのことをよく知り合いながら関係を深めていくことで、安定した愛情が育まれます。',
      work: '協力関係を築きやすく、役割分担が自然とうまくいきます。大きな衝突は少なく、長期的な協業に向いています。',
      advice: '普通に接していれば自然と関係は深まります。特別なことをしなくても、誠実に向き合うことが最大のポイントです。'
    },
    bad: {
      score: 42,
      label: '波乱 ⚡ 刺激の縁',
      overall: '二人の気は真逆に近く、最初は強く惹かれ合うことがありますが、長続きさせるには互いの理解と努力が必要です。しかし、この摩擦が互いを大きく成長させる縁でもあります。',
      love: '恋愛では「好きだけど分かり合えない」という場面が多くなりがちです。感情的にならず、冷静に相手の立場を理解しようとする努力が関係継続の鍵です。',
      work: '仕事では意見の食い違いが生じやすいですが、それぞれの視点が異なるため、うまく調整できれば補完関係になれます。',
      advice: '「この人は私とは違う感性を持っている」という前提で接することが大切です。違いを責めず、違いから学ぶ姿勢が、この縁を豊かにします。'
    },
    worst: {
      score: 28,
      label: '試練 ⚠ 成長の縁',
      overall: '二人の気は大きく異なり、自然に関係を維持するには相当の努力と理解が必要です。しかし、最も困難な相性こそが、最も大きな成長をもたらすとも言われています。',
      love: '恋愛では価値観の根本的な違いが表れやすく、長続きさせるには双方の強い意志と覚悟が必要です。',
      work: '仕事では頻繁な摩擦が予想されます。相手の仕事スタイルを尊重し、感情的にならないルールを最初に決めておくことをお勧めします。',
      advice: 'この縁が続いているなら、それはあなたに必要な学びがあるからです。「なぜ合わないのか」を深く考えることで、自分自身への大切な気づきが得られます。'
    }
  };

  return {
    level,
    ...COMPAT_DATA[level],
    myElement: myEl,
    targetElement: targetEl,
    myStarNum: my,
    targetStarNum: target,
  };
}

function calcMonthScore(honmei: number, monthStar: number): number {
  const SCORE_MAP: Record<string, number> = {
    '1-1':65,'1-2':70,'1-3':75,'1-4':80,'1-5':45,'1-6':78,'1-7':82,'1-8':60,'1-9':88,
    '2-1':72,'2-2':68,'2-3':75,'2-4':80,'2-5':42,'2-6':76,'2-7':84,'2-8':62,'2-9':78,
    '3-1':70,'3-2':65,'3-3':88,'3-4':82,'3-5':40,'3-6':74,'3-7':80,'3-8':72,'3-9':90,
    '4-1':75,'4-2':68,'4-3':84,'4-4':88,'4-5':44,'4-6':72,'4-7':78,'4-8':68,'4-9':86,
    '5-1':55,'5-2':60,'5-3':65,'5-4':68,'5-5':88,'5-6':62,'5-7':66,'5-8':72,'5-9':70,
    '6-1':78,'6-2':74,'6-3':72,'6-4':76,'6-5':42,'6-6':92,'6-7':86,'6-8':80,'6-9':68,
    '7-1':80,'7-2':76,'7-3':78,'7-4':82,'7-5':40,'7-6':88,'7-7':90,'7-8':74,'7-9':72,
    '8-1':62,'8-2':66,'8-3':72,'8-4':70,'8-5':46,'8-6':78,'8-7':76,'8-8':88,'8-9':74,
    '9-1':86,'9-2':78,'9-3':90,'9-4':84,'9-5':44,'9-6':70,'9-7':74,'9-8':76,'9-9':92,
  };
  return SCORE_MAP[`${honmei}-${monthStar}`] || 65;
}

function calcLuckyDays(honmei: number, year: number, month: number): number[] {
  const days: number[] = [];
  const base = (honmei * 7 + month * 3) % 7;
  for (let d = 1; d <= 28; d++) {
    if ((d + base) % 9 === 0 || (d + base) % 9 === 1) days.push(d);
  }
  return days.slice(0, 5);
}

function calcCautionDays(honmei: number, year: number, month: number): number[] {
  const days: number[] = [];
  const base = (honmei * 7 + month * 3) % 7;
  for (let d = 1; d <= 28; d++) {
    if ((d + base) % 9 === 5) days.push(d);
  }
  return days.slice(0, 3);
}

function calcDayFortunes(honmei: number, year: number, month: number) {
  const results: { day: number; score: number; label: string }[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dayStar = ((honmei + d - 2 + 81) % 9) + 1;
    const score = calcMonthScore(honmei, dayStar);
    const label = score >= 80 ? '大吉' : score >= 70 ? '吉' : score >= 55 ? '中吉' : score >= 45 ? '小吉' : '注意';
    results.push({ day: d, score, label });
  }
  return results;
}

function generateMonthOverview(honmei: number, monthStar: number, month: number): string {
  const score = calcMonthScore(honmei, monthStar);
  const STAR_NAMES: Record<number, string> = {
    1:'一白水星', 2:'二黒土星', 3:'三碧木星', 4:'四緑木星', 5:'五黄土星',
    6:'六白金星', 7:'七赤金星', 8:'八白土星', 9:'九紫火星'
  };
  const starName = STAR_NAMES[honmei];
  if (score >= 85) return `${starName}のあなたにとって、今月は特別に運気が高まる絶好の月です。これまで温めてきた計画や夢を実行に移すには最高のタイミング。積極的に行動することで、思いがけない成果と出会いが訪れます。`;
  if (score >= 70) return `${starName}のあなたにとって、今月は着実に前進できる安定した月です。誠実に取り組んだことが確実に積み上がり、人との縁を大切にすることで運気がさらに高まります。`;
  if (score >= 55) return `${starName}のあなたにとって、今月は慎重に進む必要がある月です。焦らず、一歩一歩丁寧に取り組むことで、来月以降の大きな飛躍の準備ができます。`;
  return `${starName}のあなたにとって、今月は内側を充実させる充電期間です。無理に動こうとせず、心身を整えることを最優先にしてください。`;
}

function generateMonthLove(honmei: number, monthStar: number): string {
  const score = calcMonthScore(honmei, monthStar);
  if (score >= 85) return '今月の恋愛運は最高潮です。積極的にアプローチすることで良い結果が期待できます。一人の方は新しい出会いの場に積極的に参加を。パートナーがいる方は関係が次のステージへ進む予感があります。';
  if (score >= 70) return '今月の恋愛は安定した流れです。今ある縁を深めることに注力すると良い結果につながります。パートナーとの対話を増やし、互いの気持ちを確認し合いましょう。';
  if (score >= 55) return '今月は恋愛で少し慎重になる必要があります。感情的な言動は避け、相手の気持ちをよく聞くことを心がけてください。';
  return '今月は恋愛より自分自身のケアを優先してください。心身が整った状態でこそ、良い縁が訪れます。';
}

function generateMonthWork(honmei: number, monthStar: number): string {
  const score = calcMonthScore(honmei, monthStar);
  if (score >= 85) return '今月の仕事運は絶好調です。新しいプロジェクトの開始・重要なプレゼン・昇進の申請など、大切な行動を起こすには最高のタイミングです。';
  if (score >= 70) return '今月の仕事は安定して進みます。丁寧に取り組むことで信頼が積み上がります。チームとの協力を大切にしてください。';
  if (score >= 55) return '今月の仕事はペースを落として慎重に進めることをお勧めします。大きな決断は来月に持ち越し、基礎固めに集中してください。';
  return '今月の仕事は無理をせず、確実にこなせる量に絞ることが大切です。今月は「断る勇気」も大切な仕事の一つです。';
}

function generateMonthMoney(honmei: number, monthStar: number): string {
  const score = calcMonthScore(honmei, monthStar);
  if (score >= 85) return '今月の金運は上昇気流に乗っています。収入が増える可能性や臨時収入が期待できます。ただし、好調な時ほど浪費に注意を。';
  if (score >= 70) return '今月の金運は安定しています。堅実に財務を管理できる月です。今月始める積立投資は長期的に吉となります。';
  if (score >= 55) return '今月は計画外の出費に注意が必要です。衝動買いや感情的な金銭判断は避けてください。';
  return '今月は財布の紐をしっかり締める月です。大きな投資や高額な買い物は来月以降に延期してください。';
}

function generateMonthHealth(honmei: number, monthStar: number): string {
  const score = calcMonthScore(honmei, monthStar);
  if (score >= 85) return '今月の体調は好調です。新しいスポーツや健康習慣を始めるのに最適なタイミングです。';
  if (score >= 70) return '今月の体調は安定しています。定期的な運動と十分な睡眠を意識することで好調を維持できます。';
  if (score >= 55) return '今月は体調の変化に敏感になってください。疲れを感じたら早めに休むことが大切です。';
  return '今月は健康管理を最優先にしてください。十分な休息を取ることが今月最大の開運行動です。';
}

function generateMonthAdvice(honmei: number, monthStar: number): string {
  const score = calcMonthScore(honmei, monthStar);
  if (score >= 85) return '今月はあなたの運気が最高潮。迷っていることがあれば、今月中に決断を。行動した人だけが結果を手にします。';
  if (score >= 70) return '今月は「丁寧さ」が最大のキーワードです。急がず焦らず、一つひとつ誠実に取り組むことで、確かな成果と信頼が積み上がります。';
  if (score >= 55) return '今月は「準備の月」と思ってください。今月していることが来月以降の飛躍の土台になります。';
  return '今月は「休む勇気」を持ってください。しっかり充電した後に来る飛躍のための、必要な休息です。';
}

// ==========================================
// 年運詳細（2コイン）
// ==========================================
ai_fortune.post("/yearly", async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: "ログインが必要です" }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "認証トークンが無効です" }, 401);

  const COST = 2;
  const body = await c.req.json<{ targetYear?: number }>();
  const user = await c.env.DB.prepare(
    "SELECT id, birth_date, coins FROM users WHERE id = ?"
  ).bind(payload.sub).first<{ id: string; birth_date: string; coins: number }>();

  if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);
  if (user.coins < COST) return c.json({ error: "コインが不足しています", required: COST, current: user.coins }, 402);

  const [myYear] = user.birth_date.split('-').map(Number);
  const honmei = getHonmei(myYear);
  const targetYear = body.targetYear || new Date().getFullYear();
  const yearStar = getYearStar(targetYear);

  const [fortuneText, yearFortune] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM fortune_texts WHERE star_number = ?").bind(honmei).first<any>(),
    c.env.DB.prepare(
      "SELECT * FROM year_fortunes WHERE honmei_star = ? AND year_star = ?"
    ).bind(honmei, yearStar).first<any>(),
  ]);

  const score = calcMonthScore(honmei, yearStar);

  // 月別運気
  const monthlyScores = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const mStar = getMonthStar(targetYear, month);
    const s = calcMonthScore(honmei, mStar);
    const level = s >= 85 ? 5 : s >= 75 ? 4 : s >= 60 ? 3 : s >= 50 ? 2 : 1;
    return { month, score: s, level, monthStar: mStar };
  });

  const now = new Date().toISOString();
  const readingId = crypto.randomUUID();

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET coins = coins - ? WHERE id = ?").bind(COST, user.id),
    c.env.DB.prepare(
      "INSERT INTO readings (id, user_id, reading_type, coins_used, result_json, created_at) VALUES (?, ?, 'yearly', ?, ?, ?)"
    ).bind(readingId, user.id, COST, JSON.stringify({ honmei, yearStar, year: targetYear }), now),
  ]);

  return c.json({
    readingId,
    coinsUsed: COST,
    remainingCoins: user.coins - COST,
    year: targetYear,
    honmei,
    starName: fortuneText?.star_name,
    yearStar,
    score,
    title: yearFortune?.title || generateYearTitle(honmei, yearStar),
    overview: yearFortune?.overview || generateYearOverview(honmei, yearStar, targetYear),
    love: yearFortune?.love || generateYearLove(honmei, yearStar),
    work: yearFortune?.work || generateYearWork(honmei, yearStar),
    money: yearFortune?.money || generateYearMoney(honmei, yearStar),
    advice: yearFortune?.advice || generateYearAdvice(honmei, yearStar),
    monthlyScores,
  });
});

function getYearStar(year: number): number {
  const h = (11 - (year % 9)) % 9;
  return h === 0 ? 9 : h;
}

function generateYearTitle(honmei: number, yearStar: number): string {
  const score = calcMonthScore(honmei, yearStar);
  if (score >= 85) return "飛躍と収穫の年";
  if (score >= 75) return "前進と成長の年";
  if (score >= 60) return "着実に積み上げる年";
  if (score >= 50) return "内省と準備の年";
  return "休養と充電の年";
}

function generateYearOverview(honmei: number, yearStar: number, year: number): string {
  const score = calcMonthScore(honmei, yearStar);
  const STAR_NAMES = ['一白水星','二黒土星','三碧木星','四緑木星','五黄土星','六白金星','七赤金星','八白土星','九紫火星'];
  const star = STAR_NAMES[honmei - 1];
  const yStar = STAR_NAMES[yearStar - 1];
  if (score >= 85) return `${year}年は${star}にとって、努力が大きく花開く飛躍の年です。${yStar}の強いエネルギーが追い風となり、これまで積み重ねてきたものが形になります。積極的に動くことで、思いがけない幸運が舞い込む可能性があります。`;
  if (score >= 75) return `${year}年は${star}にとって、確かな手応えを感じられる前進の年です。${yStar}の気と相性よく、新しい挑戦が吉と出るでしょう。焦らず一歩一歩進むことが大切です。`;
  if (score >= 60) return `${year}年は${star}にとって、着実に土台を固める年です。${yStar}の影響で派手さはありませんが、誠実な行動が未来への財産となります。地道な積み重ねを大切にしてください。`;
  if (score >= 50) return `${year}年は${star}にとって、内側を磨く準備の年です。${yStar}との相性は穏やかで、大きな動きよりも現状維持と内省が吉。来年以降の飛躍に向けて、静かに力を蓄えましょう。`;
  return `${year}年は${star}にとって、休養と充電に専念すべき年です。${yStar}のエネルギーとの相性に注意が必要で、無理な挑戦は避けて。今は退いて力を蓄える時期。焦らず心身を整えることが最善です。`;
}

function generateYearLove(honmei: number, yearStar: number): string {
  const score = calcMonthScore(honmei, yearStar);
  if (score >= 85) return "恋愛運は最高潮。新しい出会いが期待でき、既存の関係も一段と深まります。積極的なアプローチが吉。理想の相手に近づける年です。";
  if (score >= 75) return "恋愛は順調に発展しやすい年。素直な気持ちを伝えることで関係が深まります。縁が整いやすく、良いご縁が舞い込む可能性があります。";
  if (score >= 60) return "恋愛は焦らず誠実に向き合うことが大切な年。急な展開より、じっくり信頼関係を育てることで良縁に恵まれます。";
  if (score >= 50) return "恋愛運は控えめな年。新しい出会いより、既存の関係を大切に育てることが吉。自分磨きに集中することで来年以降に備えましょう。";
  return "恋愛は慎重に。感情的な判断を避け、冷静に関係を見極めることが重要。焦らず自分のペースを守ることが最善です。";
}

function generateYearWork(honmei: number, yearStar: number): string {
  const score = calcMonthScore(honmei, yearStar);
  if (score >= 85) return "仕事運は絶好調。実力を存分に発揮できる機会が訪れます。新しいプロジェクトや昇進のチャンスも。積極的に手を挙げることで大きな成果が得られます。";
  if (score >= 75) return "仕事は順調に進む年。コツコツ積み上げてきた実績が評価される時期。チームとの協力を大切にすることでさらに成果が上がります。";
  if (score >= 60) return "仕事は安定した年。目立った変化は少ないですが、着実に実力を磨ける時期。資格取得や新スキルの習得が将来の財産になります。";
  if (score >= 50) return "仕事は現状維持が吉。大きな変化や転職は時期を見極めて。目の前の仕事に誠実に向き合うことが信頼を築きます。";
  return "仕事は慎重に。無理な拡大は避け、守りを固める時期。人間関係に特に注意し、丁寧なコミュニケーションを心がけましょう。";
}

function generateYearMoney(honmei: number, yearStar: number): string {
  const score = calcMonthScore(honmei, yearStar);
  if (score >= 85) return "金運は今年最高の年。収入アップや臨時収入が期待できます。投資や新しい資産形成を始めるのに良い時期。ただし過信は禁物。計画的に動きましょう。";
  if (score >= 75) return "金運は上昇気流。堅実な資産管理と積極的な行動のバランスが吉。副収入のチャンスも訪れる可能性があります。";
  if (score >= 60) return "金運は安定した年。大きな収入増は期待しにくいですが、着実な貯蓄が吉。無駄な出費を避け、将来への備えを充実させましょう。";
  if (score >= 50) return "金運は慎重に管理が必要な年。衝動買いや高額な投資は避けて。今あるものを大切にし、支出を見直す良い機会です。";
  return "金運は控えめな年。大きな出費や投資は時期を改めて。固定費の見直しや節約を心がけ、緊急時の備えを優先しましょう。";
}

function generateYearAdvice(honmei: number, yearStar: number): string {
  const score = calcMonthScore(honmei, yearStar);
  if (score >= 85) return "今年はあなたの年です。自信を持って前に進んでください。長年温めてきた夢や計画を実行に移す絶好のタイミング。周囲との協力を忘れず、感謝の気持ちを持ちながら飛躍しましょう。";
  if (score >= 75) return "着実に、そして勇気を持って。今年は努力が報われる年。一つひとつの行動が確かな実績となります。人との縁を大切にし、チャンスが来たら躊躇せず掴んでください。";
  if (score >= 60) return "急がば回れ。今年は土台を固める年と心得て。焦らず誠実に行動することが最善の道です。自分の強みを磨きながら、来る飛躍の時に備えましょう。";
  if (score >= 50) return "今年は「守り」の年。無理をせず、心身のバランスを保つことを最優先に。内省と自己研鑽に励むことで、来年以降の大きな成長の土台が築かれます。";
  return "今年は休養と充電の年。自分を責めず、しっかり休むことも運気回復への道です。信頼できる人に相談し、無理のないペースで過ごしましょう。来年からの好転を信じて。";
}

export default ai_fortune;
