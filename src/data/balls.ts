/**
 * なかまボールの定義。名前・成功率・ルーレット出現重み・軌跡の色は
 * すべてここのデータ編集だけで調整できる（ボールを増やすときも1件追加するだけ）。
 * 画像は public/assets/balls/（scripts/prepare-visual-assets.mjs が生成）。
 */
export interface BallSpec {
  id: string
  /** 表示・読み上げ用の名前（音声クリップは generate-voice.mjs に「◯◯だ」で登録） */
  name: string
  file: string
  /** なかま成功率（0〜1） */
  successRate: number
  /** ルーレットの出現重み（強いボールほど出にくい） */
  rouletteWeight: number
  /** 投げたときの軌跡の光の色 */
  trailColor: number
  /** 虹演出つきの特別なボールか（登場時に豪華なファンファーレ） */
  rainbow?: boolean
}

export const BALLS: BallSpec[] = [
  { id: 'red', name: 'あかボール', file: 'ball-red.png', successRate: 0.2, rouletteWeight: 40, trailColor: 0xff5a5a },
  { id: 'blue', name: 'あおボール', file: 'ball-blue.png', successRate: 0.4, rouletteWeight: 30, trailColor: 0x4db2ff },
  { id: 'black', name: 'ブラックボール', file: 'ball-black.png', successRate: 0.6, rouletteWeight: 20, trailColor: 0xffd94d },
  { id: 'purple', name: 'むらさきボール', file: 'ball-purple.png', successRate: 1.0, rouletteWeight: 10, trailColor: 0xc07bff, rainbow: true },
]

/** 同じモンスターで何回失敗したら次のルーレットを紫（必ず成功）にするか */
export const PITY_FAILS = 2

/** ルーレットの抽選（重み付き）。pity 発動時は必ず紫を返す */
export function rollBall(pity: boolean): BallSpec {
  if (pity) return BALLS[BALLS.length - 1]
  const total = BALLS.reduce((s, b) => s + b.rouletteWeight, 0)
  let r = Math.random() * total
  for (const b of BALLS) {
    r -= b.rouletteWeight
    if (r <= 0) return b
  }
  return BALLS[0]
}
