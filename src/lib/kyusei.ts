/**
 * 九星気学 計算ライブラリ
 * 本命星・月命星・傾斜宮・吉方位を算出する
 */

export type KyuseiStar =
  | "一白水星"
  | "二黒土星"
  | "三碧木星"
  | "四緑木星"
  | "五黄土星"
  | "六白金星"
  | "七赤金星"
  | "八白土星"
  | "九紫火星";

export const STAR_NAMES: KyuseiStar[] = [
  "一白水星",
  "二黒土星",
  "三碧木星",
  "四緑木星",
  "五黄土星",
  "六白金星",
  "七赤金星",
  "八白土星",
  "九紫火星",
];

export type Direction =
  | "北"
  | "北東"
  | "東"
  | "南東"
  | "南"
  | "南西"
  | "西"
  | "北西"
  | "中央";

export interface KyuseiResult {
  honmeisei: KyuseiStar;
  honmeiseiNumber: number;
  tsukimeisei: KyuseiStar;
  tsukimeiseiNumber: number;
  keishakyuu: string;
  luckyDirections: Direction[];
  unluckyDirections: Direction[];
  personality: string;
  yearFortune: string;
  birthYear: number;
  birthMonth: number;
  birthDate: string;
}

/**
 * 節分補正済みの年を返す（2月3日以前は前年扱い）
 */
function adjustedYear(year: number, month: number, day: number): number {
  if (month === 1) return year - 1;
  if (month === 2 && day <= 3) return year - 1;
  return year;
}

/**
 * 節入り補正済みの月を返す（各月の節入り日以前は前月扱い）
 * 簡易版：節入り日を固定値で近似
 */
function adjustedMonth(month: number, day: number): number {
  const SETSUIRI_DAYS: Record<number, number> = {
    1: 6,
    2: 4,
    3: 6,
    4: 5,
    5: 6,
    6: 6,
    7: 7,
    8: 8,
    9: 8,
    10: 8,
    11: 7,
    12: 7,
  };
  const setsuiri = SETSUIRI_DAYS[month] ?? 6;
  if (day < setsuiri) {
    return month === 1 ? 12 : month - 1;
  }
  return month;
}

/**
 * 本命星番号を計算（1〜9）
 */
export function calcHonmeiseiNumber(
  year: number,
  month: number,
  day: number
): number {
  const adj = adjustedYear(year, month, day);
  // 各桁の和を繰り返し1桁にする
  let sum = adj
    .toString()
    .split("")
    .reduce((a, b) => a + parseInt(b), 0);
  while (sum > 9) {
    sum = sum
      .toString()
      .split("")
      .reduce((a, b) => a + parseInt(b), 0);
  }
  // 11から引いた余り（1〜9）
  const num = ((11 - sum - 1) % 9) + 1;
  return num;
}

/**
 * 月命星番号を計算（1〜9）
 */
export function calcTsukimeiseiNumber(
  honmeiseiNum: number,
  month: number,
  day: number
): number {
  const adjMonth = adjustedMonth(month, day);
  // 本命星グループ（1,4,7 / 2,5,8 / 3,6,9）で基準月が変わる
  const group = ((honmeiseiNum - 1) % 3) as 0 | 1 | 2;
  const BASE_MONTH: Record<0 | 1 | 2, number> = {
    0: 8, // 1,4,7 → 2月=8
    1: 2, // 2,5,8 → 2月=2
    2: 5, // 3,6,9 → 2月=5
  };
  const base = BASE_MONTH[group];
  // 2月を基準に月ごとに−1
  const offset = (adjMonth === 1 ? 13 : adjMonth) - 2;
  const raw = base - offset;
  return ((raw - 1 + 90) % 9) + 1;
}

/**
 * 傾斜宮を算出（本命星×月命星）
 */
export function calcKeishakyuu(
  honmei: number,
  tsukimei: number
): string {
  // 簡易版：代表的な傾斜パターン
  const map: Record<string, string> = {
    "1-1": "坎宮傾斜",
    "1-2": "坤宮傾斜",
    "1-3": "震宮傾斜",
    "1-4": "巽宮傾斜",
    "1-5": "中宮傾斜",
    "1-6": "乾宮傾斜",
    "1-7": "兌宮傾斜",
    "1-8": "艮宮傾斜",
    "1-9": "離宮傾斜",
  };
  const key = `${honmei}-${tsukimei}`;
  return map[key] ?? `${STAR_NAMES[honmei - 1]}×${STAR_NAMES[tsukimei - 1]}傾斜`;
}

/**
 * 吉方位を返す（本命星ベース・簡易版）
 */
export function calcLuckyDirections(honmei: number): {
  lucky: Direction[];
  unlucky: Direction[];
} {
  const directionMap: Record<
    number,
    { lucky: Direction[]; unlucky: Direction[] }
  > = {
    1: { lucky: ["北", "東", "南東"], unlucky: ["南", "北東", "南西"] },
    2: { lucky: ["南西", "北西", "西"], unlucky: ["東", "南東", "北"] },
    3: { lucky: ["東", "南", "北"], unlucky: ["西", "北西", "南西"] },
    4: { lucky: ["南東", "北", "東"], unlucky: ["北西", "西", "南"] },
    5: { lucky: ["北東", "南西", "中央"], unlucky: ["東", "南東", "西"] },
    6: { lucky: ["北西", "西", "南西"], unlucky: ["東", "北東", "南"] },
    7: { lucky: ["西", "北西", "北東"], unlucky: ["東", "南東", "南"] },
    8: { lucky: ["北東", "南", "北西"], unlucky: ["西", "南西", "東"] },
    9: { lucky: ["南", "東", "南東"], unlucky: ["北", "北西", "西"] },
  };
  return directionMap[honmei] ?? { lucky: [], unlucky: [] };
}

/**
 * 本命星の性格特性テキスト
 */
export function getPersonality(honmei: number): string {
  const personalities: Record<number, string> = {
    1: "冷静沈着で洞察力が鋭く、物事の本質を見極める力があります。柔軟性が高く、どんな環境にも適応できる才能を持ちます。",
    2: "誠実で粘り強く、人の世話を焼くことが得意です。縁の下の力持ち的な存在で、信頼される人物です。",
    3: "行動力があり、新しいことへのチャレンジ精神旺盛。発展と成長のエネルギーを持ち、リーダーシップを発揮します。",
    4: "信頼性が高く、穏やかで協調性があります。コツコツと努力を積み重ね、長期的な成果を出す才能があります。",
    5: "強いカリスマ性と影響力を持つ帝王の星。中心的存在として活躍しますが、周囲への配慮も大切です。",
    6: "高い理想と完璧主義を持ち、リーダーとして組織を率いる力があります。誇り高く、責任感が強いです。",
    7: "社交的で話術に長け、人を楽しませる才能があります。金運と商才に恵まれ、楽しみながら成果を上げます。",
    8: "変革と新生のエネルギーを持ち、困難を乗り越える精神力があります。忍耐力と実行力で大きな成果を出します。",
    9: "直感力と表現力に優れ、文化・芸術・知識の分野で輝きます。華やかさと知性を兼ね備えた存在です。",
  };
  return personalities[honmei] ?? "";
}

/**
 * 今年の運勢テキスト（本命星×当年の年盤星）
 */
export function getYearFortune(
  honmei: number,
  targetYear: number
): string {
  // 当年の年盤中宮星を計算
  const yearStar = calcHonmeiseiNumber(targetYear, 6, 15);
  const fortunes: Record<string, string> = {
    "1-1": "水の流れのように自然な展開が続きます。焦らず流れに乗ることで好機が訪れます。",
    "1-5": "変化の多い年。中心に据えた信念を守りつつ、柔軟に対応することが大切です。",
    "5-5": "大きな変革の年。新しい段階への移行期として、準備を整えることに注力しましょう。",
  };
  const key = `${honmei}-${yearStar}`;
  return (
    fortunes[key] ??
    `${STAR_NAMES[honmei - 1]}の方にとって、${targetYear}年は着実な積み重ねが実を結ぶ時期です。日々の行動を大切に、目標に向かって進んでください。`
  );
}

/**
 * メイン：生年月日から九星気学の結果を返す
 */
export function calcKyusei(
  year: number,
  month: number,
  day: number
): KyuseiResult {
  const honmeiseiNum = calcHonmeiseiNumber(year, month, day);
  const tsukimeiseiNum = calcTsukimeiseiNumber(honmeiseiNum, month, day);
  const { lucky, unlucky } = calcLuckyDirections(honmeiseiNum);
  const currentYear = new Date().getFullYear();

  return {
    honmeisei: STAR_NAMES[honmeiseiNum - 1],
    honmeiseiNumber: honmeiseiNum,
    tsukimeisei: STAR_NAMES[tsukimeiseiNum - 1],
    tsukimeiseiNumber: tsukimeiseiNum,
    keishakyuu: calcKeishakyuu(honmeiseiNum, tsukimeiseiNum),
    luckyDirections: lucky,
    unluckyDirections: unlucky,
    personality: getPersonality(honmeiseiNum),
    yearFortune: getYearFortune(honmeiseiNum, currentYear),
    birthYear: year,
    birthMonth: month,
    birthDate: `${year}年${month}月${day}日`,
  };
}
