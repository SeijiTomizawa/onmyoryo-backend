/**
 * 易（周易）計算ライブラリ
 * コイン投げで六爻を生成し、64卦を判定する
 */

export interface Hexagram {
  number: number;
  lines: number[]; // 6爻 (6=老陰,7=少陽,8=少陰,9=老陽)
  changingLines: number[]; // 変爻のインデックス
  changingHexagramNumber: number | null;
}

/**
 * 三枚コイン法で一爻を生成
 * 表=3, 裏=2
 * 合計: 6=老陰(変), 7=少陽, 8=少陰, 9=老陽(変)
 */
export function throwCoins(): number {
  const coins = [
    Math.random() < 0.5 ? 2 : 3,
    Math.random() < 0.5 ? 2 : 3,
    Math.random() < 0.5 ? 2 : 3,
  ];
  return coins.reduce((a, b) => a + b, 0);
}

/**
 * 六爻を生成
 */
export function generateLines(): number[] {
  return Array.from({ length: 6 }, () => throwCoins());
}

/**
 * 爻から卦番号を算出
 * 陽爻(7,9)=1, 陰爻(6,8)=0
 */
function linesToTrigram(lines: number[]): number {
  return lines.reduce((acc, line, i) => {
    const isYang = line === 7 || line === 9 ? 1 : 0;
    return acc | (isYang << i);
  }, 0);
}

/**
 * 三爻から八卦インデックスを算出
 * 乾(7)=0,兌(6)=1,離(5)=2,震(4)=3,巽(0)=4,坎(1)=5,艮(2)=6,坤(3)=7
 */
const TRIGRAM_TO_IDX: Record<number, number> = {
  0b111: 0, // 乾
  0b011: 1, // 兌
  0b101: 2, // 離
  0b001: 3, // 震
  0b110: 4, // 巽
  0b010: 5, // 坎
  0b100: 6, // 艮
  0b000: 7, // 坤
};

/**
 * 上卦・下卦から64卦番号を算出
 * 周易の卦序表
 */
const HEXAGRAM_TABLE: number[][] = [
  // 上卦: 乾  兌  離  震  巽  坎  艮  坤
  [1,  43, 14, 34,  9,  5, 26, 11], // 下卦: 乾
  [10, 58, 38, 54, 61, 60, 41, 19], // 下卦: 兌
  [13, 49, 30, 55, 37, 63, 22, 36], // 下卦: 離
  [25, 17, 21, 51, 42, 3,  27, 24], // 下卦: 震
  [44, 28, 50, 32, 57, 48, 18, 46], // 下卦: 巽
  [6,  47, 64, 40, 59, 29,  4,  7], // 下卦: 坎
  [33, 31, 56, 62, 53, 39, 52, 15], // 下卦: 艮
  [12, 45, 35, 16, 20,  8, 23,  2], // 下卦: 坤
];

export function calcHexagramNumber(lines: number[]): number {
  const lower = linesToTrigram(lines.slice(0, 3));
  const upper = linesToTrigram(lines.slice(3, 6));
  const lowerIdx = TRIGRAM_TO_IDX[lower] ?? 0;
  const upperIdx = TRIGRAM_TO_IDX[upper] ?? 0;
  return HEXAGRAM_TABLE[lowerIdx][upperIdx];
}

/**
 * 変爻のインデックスを取得（老陰=6, 老陽=9）
 */
export function getChangingLines(lines: number[]): number[] {
  return lines
    .map((line, i) => (line === 6 || line === 9) ? i : -1)
    .filter(i => i !== -1);
}

/**
 * 之卦を計算（変爻を反転）
 */
export function calcChangingHexagram(lines: number[], changingLines: number[]): number | null {
  if (changingLines.length === 0) return null;
  const newLines = lines.map((line, i) => {
    if (!changingLines.includes(i)) return line;
    if (line === 9) return 8; // 老陽→少陰
    if (line === 6) return 7; // 老陰→少陽
    return line;
  });
  return calcHexagramNumber(newLines);
}

/**
 * 爻の表示記号
 */
export function lineToSymbol(line: number): string {
  if (line === 7) return '⚊'; // 少陽（不変）
  if (line === 8) return '⚋'; // 少陰（不変）
  if (line === 9) return '⚊○'; // 老陽（変）
  if (line === 6) return '⚋×'; // 老陰（変）
  return '';
}

export function generateHexagram(): Hexagram {
  const lines = generateLines();
  const number = calcHexagramNumber(lines);
  const changingLines = getChangingLines(lines);
  const changingHexagramNumber = calcChangingHexagram(lines, changingLines);
  return { number, lines, changingLines, changingHexagramNumber };
}
