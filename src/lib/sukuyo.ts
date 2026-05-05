export const SUKUYO_NAMES = [
  '昴宿','畢宿','觜宿','参宿','井宿','鬼宿','柳宿','星宿','張宿',
  '翼宿','軫宿','角宿','亢宿','氐宿','房宿','心宿','尾宿','箕宿',
  '斗宿','牛宿','女宿','虚宿','危宿','室宿','壁宿','奎宿','婁宿',
];

export interface SukuyoResult {
  shukuIndex: number;
  shuku: string;
  compatibility: { name: string; relation: string; desc: string }[];
  birthDate: string;
}

export function calcShukuIndex(year: number, month: number, day: number): number {
  const base = new Date(1900, 0, 1);
  const target = new Date(year, month - 1, day);
  const diff = Math.floor((target.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
  return ((diff % 27) + 27) % 27;
}

// 宿同士の関係を返す（全27宿対応）
export function getRelation(a: number, b: number): string {
  const diff = ((b - a) + 27) % 27;
  const relationMap: Record<number, string> = {
    0:  '本宿（同宿）',
    9:  '安宿',
    18: '栄宿',
    3:  '友宿',
    6:  '友宿',
    12: '友宿',
    15: '友宿',
    21: '友宿',
    24: '友宿',
    1:  '業宿',
    2:  '業宿',
    4:  '業宿',
    5:  '業宿',
    7:  '業宿',
    8:  '業宿',
    10: '衰宿',
    11: '衰宿',
    13: '衰宿',
    14: '衰宿',
    16: '衰宿',
    17: '衰宿',
    19: '命宿',
    20: '命宿',
    22: '命宿',
    23: '命宿',
    25: '命宿',
    26: '命宿',
  };
  return relationMap[diff] ?? '普通';
}

// 相性の詳細説明
export function getRelationDesc(relation: string, myShuku: string, targetShuku: string): string {
  const descs: Record<string, string> = {
    '安宿': `${myShuku}と${targetShuku}は最高の相性です。互いに補い合い、深く安心できる関係。恋愛・友情・仕事どの場面でも最良のパートナーになれます。`,
    '栄宿': `${myShuku}と${targetShuku}は共に発展する相性です。互いの才能を引き出し合い、一緒にいることでどちらも成長できます。`,
    '友宿': `${myShuku}と${targetShuku}は自然と仲良くなれる相性です。一緒にいると心地よく、友好的な関係を築きやすいです。`,
    '命宿': `${myShuku}と${targetShuku}は深い縁で結ばれています。前世からの縁を感じるほど強く引き合いますが、時に執着になることも。`,
    '業宿': `${myShuku}と${targetShuku}は刺激し合う相性です。互いに触発されて成長できる一方、衝突することもあります。`,
    '衰宿': `${myShuku}と${targetShuku}は相性に注意が必要です。関係を深めるには互いの違いを尊重することが大切です。`,
    '本宿（同宿）': `同じ宿を持つ同士です。価値観や感性がよく似ており、深く理解し合えます。`,
  };
  return descs[relation] ?? '普通の相性です。';
}

// 全27宿との相性リストを返す
export function calcFullCompatibility(shukuIndex: number): {
  shukuIndex: number;
  name: string;
  relation: string;
  desc: string;
  level: number;
}[] {
  const levelMap: Record<string, number> = {
    '安宿': 5, '栄宿': 4, '命宿': 4, '友宿': 3,
    '本宿（同宿）': 3, '業宿': 2, '衰宿': 1,
  };
  return SUKUYO_NAMES.map((name, i) => {
    const relation = getRelation(shukuIndex, i);
    return {
      shukuIndex: i,
      name,
      relation,
      desc: getRelationDesc(relation, SUKUYO_NAMES[shukuIndex], name),
      level: levelMap[relation] ?? 3,
    };
  });
}

// 既存の互換性維持
export function calcCompatibility(shukuIndex: number): { name: string; relation: string; desc: string }[] {
  return [
    { name: SUKUYO_NAMES[(shukuIndex + 9) % 27],  relation: '安宿（最良の相性）', desc: '互いに補い合い、最高のパートナーシップを築けます。' },
    { name: SUKUYO_NAMES[(shukuIndex + 18) % 27], relation: '栄宿（発展の相性）', desc: '共に成長し、互いの才能を引き出し合える関係です。' },
    { name: SUKUYO_NAMES[(shukuIndex + 3) % 27],  relation: '友宿（友好の相性）', desc: '自然と仲良くなれる、友好的な関係です。' },
  ];
}