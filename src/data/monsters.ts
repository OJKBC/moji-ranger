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
  /**
   * ボス抽選の重み（㉖）。まだ捕まえていないつよいモンスターを優先しつつ、
   * 捕獲済みも「ゼロにはしない」で低確率に残す（捕獲は確率制なので再挑戦の機会を確保）。
   * 全部captured済みなら全員が captured 重み＝実質いつもの均等抽選になる。
   */
  bossWeights: { uncaptured: number; captured: number }
}

export const MONSTER_TABLE: MonsterSpawnTable = {
  sampleSize: { weak: 6, strong: 5 }, // 道中はよわいのみになったので顔ぶれを少し増やす
  // ㉝ 道中（ボス以外）は全難易度「よわい」のみ。つよいモンスターは最後のボス専用
  //   （＝捕獲・図鑑対象）。将来ここを再編集すれば道中にもつよいを混ぜられる（データ調整可）。
  weights: {
    1: { weak: 1, strong: 0 },
    2: { weak: 1, strong: 0 },
    3: { weak: 1, strong: 0 },
    4: { weak: 1, strong: 0 },
    5: { weak: 1, strong: 0 },
  },
  purifySteps: { weak: [1, 2], strong: [2, 3] },
  bossWeights: { uncaptured: 1.0, captured: 0.2 },
}
