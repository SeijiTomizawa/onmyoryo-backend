/**
 * 四柱推命・算命学 計算ライブラリ
 */

// 十干
export const JIKKAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
// 十二支
export const JUNISHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
// 十干の自然界シンボル
export const JIKKAN_SYMBOL: Record<string, string> = {
  '甲':'大樹','乙':'草花','丙':'太陽','丁':'灯火',
  '戊':'山','己':'大地','庚':'鋼鉄','辛':'宝石','壬':'海','癸':'雨'
};
// 十干の陰陽
export const JIKKAN_INYO: Record<string, string> = {
  '甲':'陽','乙':'陰','丙':'陽','丁':'陰','戊':'陽',
  '己':'陰','庚':'陽','辛':'陰','壬':'陽','癸':'陰'
};
// 十干の五行
export const JIKKAN_GOGYO: Record<string, string> = {
  '甲':'木','乙':'木','丙':'火','丁':'火','戊':'土',
  '己':'土','庚':'金','辛':'金','壬':'水','癸':'水'
};
// 十二支の五行
export const JUNISHI_GOGYO: Record<string, string> = {
  '子':'水','丑':'土','寅':'木','卯':'木','辰':'土','巳':'火',
  '午':'火','未':'土','申':'金','酉':'金','戌':'土','亥':'水'
};
// 十干の性格説明
export const NIKKAN_DESC: Record<string, { personality: string; talent: string; weakness: string; love: string; work: string }> = {
  '甲':{
    personality:'大樹のように真っ直ぐで、強い意志と向上心を持ちます。リーダーシップがあり、周囲を引っ張る力があります。正義感が強く、曲がったことが嫌いな一本気な性格です。',
    talent:'統率力・企画力・開拓精神。新しいことへの挑戦と、組織をまとめる力が天賦の才です。',
    weakness:'頑固で融通が利かないことがあります。プライドが高く、人の意見を聞き入れにくい面も。',
    love:'一途で情熱的な恋愛をします。相手に誠実で、長期的な関係を大切にします。',
    work:'経営者・リーダー・開拓者として活躍します。新しいプロジェクトの立ち上げや独立に向いています。'
  },
  '乙':{
    personality:'草花のように柔軟でしなやか。環境への適応力が高く、どんな状況でも生き抜く強さを持ちます。表面は穏やかですが、内面には強い芯があります。',
    talent:'適応力・共感力・美的センス。人の心を読む力と、美しいものを創り出す才能があります。',
    weakness:'優柔不断になりやすく、流されることがあります。自己主張が苦手な面も。',
    love:'相手に寄り添う献身的な恋愛をします。穏やかで安定した関係を好みます。',
    work:'芸術・デザイン・カウンセリング・営業など、人との関わりと感性を活かせる仕事が向いています。'
  },
  '丙':{
    personality:'太陽のように明るく、エネルギッシュ。周囲を照らし、人を元気にする存在です。直感力が高く、行動力があります。正直で裏表がありません。',
    talent:'表現力・行動力・明るさ。人を惹きつけるカリスマ性と、直感で状況を打開する力があります。',
    weakness:'感情的になりやすく、衝動的な言動でトラブルを起こすことがあります。飽きっぽい面も。',
    love:'情熱的で積極的な恋愛をします。相手を楽しませることが得意ですが、長続きさせるには忍耐が必要。',
    work:'芸能・営業・政治・起業など、表舞台で人々をリードする仕事で輝きます。'
  },
  '丁':{
    personality:'灯火のように温かく、周囲を照らす存在です。繊細な感性と強い信念を持ちます。人の心の機微を読み取る能力が高く、深い思いやりがあります。',
    talent:'洞察力・共感力・芸術性。人の心を温める力と、細部まで磨き上げる繊細さが才能です。',
    weakness:'繊細すぎて傷つきやすく、感情の起伏が激しいことがあります。内向きになりすぎる面も。',
    love:'深い絆を求める一途な恋愛をします。相手への思いやりが深く、献身的です。',
    work:'教育・医療・芸術・宗教など、人の心を育て温める仕事で才能を発揮します。'
  },
  '戊':{
    personality:'山のように大きく、どっしりとした存在感があります。安定感と包容力が魅力で、周囲から頼りにされます。変化を好まず、長期的な視点で物事を考えます。',
    talent:'包容力・安定性・信頼感。大きな視野で物事を見渡し、長期的な計画を実現する力があります。',
    weakness:'頑固で変化を嫌う傾向があります。動き出すまでに時間がかかることも。',
    love:'安定した深い愛情を注ぎます。焦らずゆっくりと関係を深めていくタイプです。',
    work:'不動産・建設・政治・経営など、大きな責任を担う仕事で力を発揮します。'
  },
  '己':{
    personality:'大地のように豊かで、人を育てる力があります。誠実で勤勉、地道な努力を惜しまない性格です。縁の下の力持ちとして組織を支えます。',
    talent:'育成力・継続力・誠実さ。コツコツと積み重ねる力と、人を育てる温かさが才能です。',
    weakness:'慎重すぎて行動が遅くなりがちです。自己評価が低く、実力を過小評価することも。',
    love:'誠実で献身的な恋愛をします。尽くしすぎる傾向があるため、自分の気持ちも大切に。',
    work:'農業・教育・医療・事務など、地道な努力が報われる仕事で実力を発揮します。'
  },
  '庚':{
    personality:'鋼鉄のように強く、正義感があります。決断力と実行力があり、一度決めたことは必ずやり遂げます。正直で裏表がなく、真っ直ぐな性格です。',
    talent:'決断力・実行力・正義感。困難に屈しない強さと、物事をバッサリ決める決断力が才能です。',
    weakness:'融通が利かず、完璧主義になりすぎることがあります。人の感情への配慮が不足することも。',
    love:'一度愛したら真剣で、相手に誠実です。感情表現は苦手ですが、行動で愛情を示します。',
    work:'軍・警察・法律・外科・スポーツなど、強さと決断力が求められる仕事が天職です。'
  },
  '辛':{
    personality:'宝石のように輝き、美しさと鋭さを兼ね備えます。審美眼が高く、完璧を追求する完璧主義者です。繊細な感性と鋭い知性を持ちます。',
    talent:'審美眼・完璧主義・洗練さ。美しいものを見極め、磨き上げる才能と、鋭い分析力があります。',
    weakness:'批判的になりすぎることがあります。完璧主義ゆえに行動が遅くなることも。',
    love:'理想が高く、なかなか恋愛に踏み切れないことがあります。一度愛したら深く誠実です。',
    work:'ファッション・芸術・外科・宝飾・批評など、美と精密さを追求する仕事で輝きます。'
  },
  '壬':{
    personality:'海のように広大で、包容力があります。知的好奇心が旺盛で、広い視野を持ちます。自由を愛し、既存の枠にとらわれない発想力があります。',
    talent:'包容力・創造力・知的好奇心。広い視野で物事を捉え、新しい発想を生み出す力が才能です。',
    weakness:'気分にムラがあり、集中力が続かないことがあります。浮気心が出やすい面も。',
    love:'自由で開放的な恋愛を好みます。束縛を嫌い、お互いの自由を尊重する関係が理想です。',
    work:'国際ビジネス・旅行・芸術・研究など、広い世界を舞台にした仕事で力を発揮します。'
  },
  '癸':{
    personality:'雨のように静かに、しかし確実に浸透していく力があります。鋭い洞察力と深い感性を持ちます。表面は穏やかですが、内面には強い意志があります。',
    talent:'洞察力・感受性・忍耐力。物事の本質を見抜く力と、じっくりと物事を育てる忍耐力が才能です。',
    weakness:'感情的になりやすく、気分の波が激しいことがあります。内向きになりすぎる面も。',
    love:'深い感情を持つ一途な恋愛をします。相手の気持ちを敏感に察知します。',
    work:'心理・研究・文学・音楽・カウンセリングなど、感性と洞察力を活かせる仕事が向いています。'
  },
};

export interface ShichuResult {
  // 四柱
  nenchu: { kan: string; shi: string };  // 年柱
  getchu: { kan: string; shi: string };  // 月柱
  nichu: { kan: string; shi: string };   // 日柱
  jichu: { kan: string; shi: string } | null; // 時柱（不明の場合null）
  // 日干情報
  nikkan: string;
  nikkanSymbol: string;
  nikkanInyo: string;
  nikkanGogyo: string;
  // 性格・才能
  personality: string;
  talent: string;
  weakness: string;
  love: string;
  work: string;
  // 十二運（日干から見た月支）
  juniunSelf: string;
  // 通変星（簡易）
  tsuhensei: string[];
  // 算命学：宿命星
  shukumeisei: string;
  // 大運（10年ごとの運勢）
  daiun: { age: number; kan: string; shi: string }[];
  birthDate: string;
  gender: string;
}

/**
 * 年干支を計算（1984年=甲子を基準）
 */
export function calcNenchu(year: number): { kan: string; shi: string } {
  const base = 1984; // 甲子年
  const diff = (year - base + 600) % 60;
  return {
    kan: JIKKAN[diff % 10],
    shi: JUNISHI[diff % 12],
  };
}

/**
 * 月干支を計算
 * 月支は固定（寅月=1月、卯月=2月...）
 * 月干は年干から算出
 */
export function calcGetchu(year: number, month: number, day: number): { kan: string; shi: string } {
  // 節入り補正（簡易版）
  const SETSUIRI: Record<number, number> = {1:6,2:4,3:6,4:5,5:6,6:6,7:7,8:8,9:8,10:8,11:7,12:7};
  let adjMonth = month;
  if (day < (SETSUIRI[month] ?? 6)) adjMonth = month === 1 ? 12 : month - 1;
  let adjYear = year;
  if (adjMonth === 12 && month === 1) adjYear = year - 1;

  // 月支：寅(2)から始まる（adjMonth=1→丑、2→寅...）
  const MONTH_SHI_BASE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0]; // 子=0
  const shi = JUNISHI[MONTH_SHI_BASE[adjMonth - 1]];

  // 月干：年干から算出（甲己年は丙から、乙庚年は戊から...）
  const nenKan = calcNenchu(adjYear).kan;
  const nenKanIdx = JIKKAN.indexOf(nenKan);
  const BASE_GETKAN = [2, 4, 6, 8, 0, 2, 4, 6, 8, 0]; // 甲→丙,乙→戊...
  const baseGetKanIdx = BASE_GETKAN[nenKanIdx];
  const kanIdx = (baseGetKanIdx + (adjMonth - 1)) % 10;

  return { kan: JIKKAN[kanIdx], shi };
}

/**
 * 日干支を計算
 * ユリウス通日から算出
 */
export function calcNichu(year: number, month: number, day: number): { kan: string; shi: string } {
  // 簡易計算：1900年1月1日=甲戌(10,10)を基準
  const base = new Date(1900, 0, 1);
  const target = new Date(year, month - 1, day);
  const diff = Math.floor((target.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
  // 1900/1/1=甲戌: 甲=0, 戌=10
  const kanIdx = ((diff % 10) + 10) % 10;
  const shiIdx = ((diff % 12) + 12) % 12;
  return {
    kan: JIKKAN[kanIdx],
    shi: JUNISHI[shiIdx],
  };
}

/**
 * 時干支を計算
 */
export function calcJichu(hour: number, nikkan: string): { kan: string; shi: string } {
  // 時支：子(23-1時)=0, 丑(1-3時)=1...
  const shiIdx = Math.floor(((hour + 1) % 24) / 2);
  const shi = JUNISHI[shiIdx];
  // 時干：日干から算出
  const nikkanIdx = JIKKAN.indexOf(nikkan);
  const BASE_JIKAN = [0, 2, 4, 6, 8, 0, 2, 4, 6, 8];
  const baseIdx = BASE_JIKAN[nikkanIdx];
  const kanIdx = (baseIdx + shiIdx) % 10;
  return { kan: JIKKAN[kanIdx], shi };
}

/**
 * 十二運を算出（日干から見た月支の関係）
 */
export function calcJuniun(nikkan: string, shi: string): string {
  const JUNIUN_TABLE: Record<string, string[]> = {
    '甲': ['沐浴','冠帯','建禄','帝旺','衰','病','死','墓','絶','胎','養','長生'],
    '乙': ['長生','養','胎','絶','墓','死','病','衰','帝旺','建禄','冠帯','沐浴'],
    '丙': ['胎','絶','墓','死','病','衰','帝旺','建禄','冠帯','沐浴','長生','養'],
    '丁': ['養','長生','沐浴','冠帯','建禄','帝旺','衰','病','死','墓','絶','胎'],
    '戊': ['胎','絶','墓','死','病','衰','帝旺','建禄','冠帯','沐浴','長生','養'],
    '己': ['養','長生','沐浴','冠帯','建禄','帝旺','衰','病','死','墓','絶','胎'],
    '庚': ['絶','胎','養','長生','沐浴','冠帯','建禄','帝旺','衰','病','死','墓'],
    '辛': ['墓','死','病','衰','帝旺','建禄','冠帯','沐浴','長生','養','胎','絶'],
    '壬': ['長生','養','胎','絶','墓','死','病','衰','帝旺','建禄','冠帯','沐浴'],
    '癸': ['沐浴','冠帯','建禄','帝旺','衰','病','死','墓','絶','胎','養','長生'],
  };
  const shiIdx = JUNISHI.indexOf(shi);
  return JUNIUN_TABLE[nikkan]?.[shiIdx] ?? '';
}

/**
 * 通変星を算出（日干から見た各柱の干）
 */
export function calcTsuhensei(nikkan: string, targetKan: string): string {
  const nikkanGogyo = JIKKAN_GOGYO[nikkan];
  const targetGogyo = JIKKAN_GOGYO[targetKan];
  const nikkanInyo = JIKKAN_INYO[nikkan];
  const targetInyo = JIKKAN_INYO[targetKan];
  const sameStar = nikkanInyo === targetInyo;

  const GOGYO_REL: Record<string, Record<string, string>> = {
    '木': { '木': sameStar ? '比肩' : '劫財', '火': '食神', '土': '偏財', '金': '偏官', '水': '偏印' },
    '火': { '火': sameStar ? '比肩' : '劫財', '土': '食神', '金': '偏財', '水': '偏官', '木': '偏印' },
    '土': { '土': sameStar ? '比肩' : '劫財', '金': '食神', '水': '偏財', '木': '偏官', '火': '偏印' },
    '金': { '金': sameStar ? '比肩' : '劫財', '水': '食神', '木': '偏財', '火': '偏官', '土': '偏印' },
    '水': { '水': sameStar ? '比肩' : '劫財', '木': '食神', '火': '偏財', '土': '偏官', '金': '偏印' },
  };

  // 陰陽で正偏を決定
  const base = GOGYO_REL[nikkanGogyo]?.[targetGogyo] ?? '';
  if (base === '比肩' || base === '劫財') return sameStar ? '比肩' : '劫財';
  if (!base) return '';
  // 同じ陰陽→偏、異なる→正
  const isHen = (nikkanInyo === targetInyo);
  const map: Record<string, [string, string]> = {
    '食神': ['食神', '傷官'],
    '偏財': ['偏財', '正財'],
    '偏官': ['偏官', '正官'],
    '偏印': ['偏印', '印綬'],
  };
  return map[base]?.[isHen ? 0 : 1] ?? base;
}

/**
 * 算命学：宿命星（天中殺グループ）
 */
export function calcShukumeisei(nenchu: { kan: string; shi: string }): string {
  const TENCHUSATSU: Record<string, string> = {
    '子': '子丑天中殺', '丑': '子丑天中殺',
    '寅': '寅卯天中殺', '卯': '寅卯天中殺',
    '辰': '辰巳天中殺', '巳': '辰巳天中殺',
    '午': '午未天中殺', '未': '午未天中殺',
    '申': '申酉天中殺', '酉': '申酉天中殺',
    '戌': '戌亥天中殺', '亥': '戌亥天中殺',
  };
  return TENCHUSATSU[nenchu.shi] ?? '';
}

/**
 * 大運を計算（10年ごとの運勢サイクル）
 */
export function calcDaiun(
  year: number, month: number, day: number,
  gender: string
): { age: number; kan: string; shi: string }[] {
  const nenKan = calcNenchu(year).kan;
  const nenKanIdx = JIKKAN.indexOf(nenKan);
  // 陽干＋男 or 陰干＋女 → 順行、それ以外→逆行
  const isYo = nenKanIdx % 2 === 0;
  const isMale = gender === 'm';
  const forward = (isYo && isMale) || (!isYo && !isMale);

  const getchu = calcGetchu(year, month, day);
  const kanIdx0 = JIKKAN.indexOf(getchu.kan);
  const shiIdx0 = JUNISHI.indexOf(getchu.shi);

  // 60干支インデックスで管理（干と支を別々に動かすと存在しない組み合わせが生まれる）
  let idx60 = -1;
  for (let i = 0; i < 60; i++) {
    if (i % 10 === kanIdx0 && i % 12 === shiIdx0) {
      idx60 = i;
      break;
    }
  }
  if (idx60 < 0) idx60 = 0;

  const result = [];
  for (let i = 0; i < 8; i++) {
    if (forward) {
      idx60 = (idx60 + 1) % 60;
    } else {
      idx60 = (idx60 - 1 + 60) % 60;
    }
    result.push({
      age: 3 + i * 10,
      kan: JIKKAN[idx60 % 10],
      shi: JUNISHI[idx60 % 12],
    });
  }
  return result;
}

/**
 * メイン：四柱推命の命式を計算
 */
export function calcShichu(
  year: number, month: number, day: number,
  hour: number | null, gender: string
): ShichuResult {
  const nenchu = calcNenchu(year);
  const getchu = calcGetchu(year, month, day);
  const nichu = calcNichu(year, month, day);
  const jichu = hour !== null ? calcJichu(hour, nichu.kan) : null;
  const nikkan = nichu.kan;
  const desc = NIKKAN_DESC[nikkan];

  const tsuhensei = [
    calcTsuhensei(nikkan, nenchu.kan),
    calcTsuhensei(nikkan, getchu.kan),
    jichu ? calcTsuhensei(nikkan, jichu.kan) : '',
  ].filter(Boolean);

  return {
    nenchu, getchu, nichu, jichu,
    nikkan,
    nikkanSymbol: JIKKAN_SYMBOL[nikkan],
    nikkanInyo: JIKKAN_INYO[nikkan],
    nikkanGogyo: JIKKAN_GOGYO[nikkan],
    personality: desc.personality,
    talent: desc.talent,
    weakness: desc.weakness,
    love: desc.love,
    work: desc.work,
    juniunSelf: calcJuniun(nikkan, getchu.shi),
    tsuhensei,
    shukumeisei: calcShukumeisei(nenchu),
    daiun: calcDaiun(year, month, day, gender),
    birthDate: `${year}年${month}月${day}日`,
    gender,
  };
}
