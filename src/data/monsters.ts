import type { DifficultyLevel } from '../types'

/**
 * モンスターの出現テーブル。すべてここのデータ編集だけで調整できる（ハードコードしない）。
 * 画像そのものの一覧は src/game/monsterManifest.ts（prepare-monsters.mjs が自動生成）。
 */
export interface MonsterSpawnTable {
  /** 1プレイでプリロードする画像の数（グループごと。多いほど多彩だが読み込みが増える） */
  sampleSize: { weak: number; strong: number }
  /** 難易度ごとの出現グループの重み */
  weights: Record<DifficultyLevel, { weak: number; strong: number }>
  /** グループごとの浄化に必要な正解数 [最小, 最大]（この範囲からランダム） */
  purifySteps: { weak: [number, number]; strong: [number, number] }
}

export const MONSTER_TABLE: MonsterSpawnTable = {
  sampleSize: { weak: 4, strong: 4 },
  weights: {
    1: { weak: 1, strong: 0 }, // 難易度1: よわいのみ
    2: { weak: 0.7, strong: 0.3 }, // 難易度2: よわい中心＋ときどきつよい
    3: { weak: 0.25, strong: 0.75 }, // 難易度3: つよい中心
  },
  purifySteps: { weak: [1, 2], strong: [2, 3] },
}
