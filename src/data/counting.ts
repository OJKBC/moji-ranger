/**
 * 「かぞえて」系（暗算不要のさんすう入口）の数値スケール。
 *
 * 設計思想: どのモードも「数える・増減を見る」だけで解ける。暗算で答えを先に出させない。
 *
 * モードはステージ固定（別ステージ）:
 *   count   = かぞえて モンスター（3段階）
 *   addsub  = ふえる・へる      （3段階・「ここに●こ ふえたら/へったら なんこ？」＋数字カード）
 *   make10  = すうじを つくろう  （5段階・目標の数を少しずつ大きく。空きマスは出さない）
 *
 * 各ステージの難易度で「数の大きさ」を段階的に上げる（モードは変わらない）。
 */
export type CountMode = 'count' | 'addsub' | 'make10' | 'numberline'

export interface CountSpec {
  mode: CountMode
  /** count: あつめる数の最小/最大 */
  countMin: number
  countMax: number
  /** addsub: たす/ひく数の上限。ひき算も混ぜるか */
  addMax: number
  includeSub: boolean
  /** make10（すうじをつくろう）: 作る目標の数の最小/最大 */
  targetMin: number
  targetMax: number
  rounds: number
}

/** モード×難易度 → 数の範囲。難易度が上がるほど数を大きく（モードは固定）。 */
export function countSpec(mode: CountMode, difficulty: number): CountSpec {
  if (mode === 'count') {
    // 3段階: L1=1〜3 / L2=3〜6 / L3=5〜9
    const d = Math.max(1, Math.min(3, difficulty))
    const max = [3, 6, 9][d - 1]
    return { mode, countMin: Math.max(1, max - 2), countMax: max, addMax: 0, includeSub: false, targetMin: 0, targetMax: 0, rounds: 5 }
  }
  if (mode === 'addsub') {
    // 3段階: L1=たし算 合計≤5 / L2=たし引き ≤8 / L3=たし引き ≤10
    const d = Math.max(1, Math.min(3, difficulty))
    const addMax = [5, 8, 10][d - 1]
    return { mode, countMin: 1, countMax: 0, addMax, includeSub: d >= 2, targetMin: 0, targetMax: 0, rounds: 5 }
  }
  // make10（すうじをつくろう）: 目標を段階的に大きく（5段階）。5〜8 → 10 → 10〜12 → 12〜15 → 15〜18
  const d = Math.max(1, Math.min(5, difficulty))
  const ranges: Array<[number, number]> = [[5, 8], [10, 10], [10, 12], [12, 15], [15, 18]]
  const [tMin, tMax] = ranges[d - 1] ?? [10, 10]
  return { mode, countMin: 1, countMax: 9, addMax: 10, includeSub: false, targetMin: tMin, targetMax: tMax, rounds: 5 }
}
