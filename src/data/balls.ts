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
  /**
   * ㊷ ログインボーナスの日替わり抽選に出るか（＝「青以上」だけ true）。
   * 赤（成功率20%）は出さず、青40%/黒60%/紫100% のみをボーナスで抽選する。データで調整可。
   */
  bonusEligible?: boolean
}

export const BALLS: BallSpec[] = [
  // 出現率（rouletteWeight）はデータで調整可能。赤が出やすすぎたので少し下げ、青・黒を上げた
  // （赤34/青33/黒23/紫10）。紫（必ず成功）は据え置き。
  { id: 'red', name: 'あかボール', file: 'ball-red.png', successRate: 0.2, rouletteWeight: 34, trailColor: 0xff5a5a, bonusEligible: false },
  { id: 'blue', name: 'あおボール', file: 'ball-blue.png', successRate: 0.4, rouletteWeight: 33, trailColor: 0x4db2ff, bonusEligible: true },
  { id: 'black', name: 'ブラックボール', file: 'ball-black.png', successRate: 0.6, rouletteWeight: 23, trailColor: 0xffd94d, bonusEligible: true },
  { id: 'purple', name: 'むらさきボール', file: 'ball-purple.png', successRate: 1.0, rouletteWeight: 10, trailColor: 0xc07bff, rainbow: true, bonusEligible: true },
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

/** ㊷ ログインボーナスの日替わり抽選に出るボール（青以上のみ） */
export const BONUS_BALLS: BallSpec[] = BALLS.filter(b => b.bonusEligible)

/**
 * ㊷ ログインボーナス用の抽選。青以上（BONUS_BALLS）だけを重み付きで引く。
 * pity（同じモンスターで2回失敗済み）のときは通常どおり紫（必ず成功）を返す。
 */
export function bonusRollBall(pity: boolean): BallSpec {
  if (pity) return BALLS[BALLS.length - 1]
  const total = BONUS_BALLS.reduce((s, b) => s + b.rouletteWeight, 0)
  let r = Math.random() * total
  for (const b of BONUS_BALLS) {
    r -= b.rouletteWeight
    if (r <= 0) return b
  }
  return BONUS_BALLS[0]
}
