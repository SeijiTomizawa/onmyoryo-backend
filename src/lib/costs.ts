// src/lib/costs.ts
// reading_costsテーブルからコストを取得する共通関数

export async function getCost(db: D1Database, readingType: string, fallback: number): Promise<number> {
  try {
    const row = await db.prepare(
      "SELECT coins FROM reading_costs WHERE reading_type = ?"
    ).bind(readingType).first<{ coins: number }>();
    return row?.coins ?? fallback;
  } catch {
    return fallback;
  }
}

export async function getAllCosts(db: D1Database): Promise<Record<string, number>> {
  try {
    const rows = await db.prepare(
      "SELECT reading_type, coins FROM reading_costs"
    ).all<{ reading_type: string; coins: number }>();
    const map: Record<string, number> = {};
    for (const row of rows.results) {
      map[row.reading_type] = row.coins;
    }
    return map;
  } catch {
    return {};
  }
}