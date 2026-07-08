import type { DifficultyLevel } from '../types'

/**
 * 難易度ごとの共通チューニング（全ステージで参照）。
 * 上の難易度ほど「選択肢を増やす・似た紛らわしいものを増やす・テンポを上げる・
 * 出題プールを広げる」。ただし4〜6歳が心折れない範囲（正答率70〜85%狙いは維持）。
 *
 * 難易度を増減したいときは、この表と types.ts の MAX_DIFFICULTY を編集するだけでよい
 * （エンジン側は数値を直接持たず、必ずこの表を引く）。
 */
export interface DifficultyTuning {
  /** 選択肢を base に足す数（find/spell/meaning。合計は MAX_CHOICES で頭打ち） */
  choiceBonus: number
  /** 出題プールの開放を base.poolStart に足して広げる（ひらがな/カタカナ） */
  poolBonus: number
  /** 巡航速度の倍率（テンポ） */
  speedMul: number
  /** 似た文字（形が紛らわしい選択肢）を混ぜるか */
  useConfusables: boolean
  /** 混ぜる似た文字の最大数（上の難易度ほど紛らわしさを増やす） */
  maxConfusables: number
  /** 出題→選択肢表示の間を詰めてテンポを上げるか */
  fastPrompt: boolean
  /** さんすうの選択肢（ゲート）の数 */
  mathChoices: number
}

/** リング配置・可読性の都合で、選択肢は最大この数まで（find/spell/meaning） */
export const MAX_CHOICES = 6

export const DIFFICULTY: Record<DifficultyLevel, DifficultyTuning> = {
  1: { choiceBonus: 0, poolBonus: 0, speedMul: 1.0, useConfusables: false, maxConfusables: 0, fastPrompt: false, mathChoices: 3 },
  2: { choiceBonus: 0, poolBonus: 3, speedMul: 1.0, useConfusables: true, maxConfusables: 2, fastPrompt: false, mathChoices: 3 },
  3: { choiceBonus: 1, poolBonus: 5, speedMul: 1.15, useConfusables: true, maxConfusables: 2, fastPrompt: true, mathChoices: 3 },
  4: { choiceBonus: 2, poolBonus: 9, speedMul: 1.22, useConfusables: true, maxConfusables: 3, fastPrompt: true, mathChoices: 4 },
  5: { choiceBonus: 3, poolBonus: 14, speedMul: 1.30, useConfusables: true, maxConfusables: 3, fastPrompt: true, mathChoices: 4 },
}

export function tuningFor(level: DifficultyLevel): DifficultyTuning {
  return DIFFICULTY[level] ?? DIFFICULTY[1]
}
