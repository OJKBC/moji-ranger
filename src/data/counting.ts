/**
 * 「かぞえて モンスター」系（暗算不要のさんすう入口）の数値スケール。
 *
 * 設計思想（最重要）: どのモードも「数える・増減を見る・10の枠を埋める」だけで解ける。
 *   暗算で答えの数字を先に出させない。答えの数は画面に大きく出さない（数えさせる）。
 *
 * モードは「ステージごと」に固定（別ステージに分割）:
 *   count   = かぞえる       （count-monster）
 *   addsub  = ふえる・へる   （count-addsub）
 *   make10  = 10をつくる     （count-make10）
 *   numberline = かずのみち  （未実装・モード4）
 * 各ステージの難易度1〜7で「数の大きさ」を段階的に上げる（モードは変わらない）。
 *
 * ここは数の範囲だけを持つデータ。出題生成・UIは CountMonster.tsx。
 */
export type CountMode = 'count' | 'addsub' | 'make10' | 'numberline'

export interface CountSpec {
  mode: CountMode
  /** count: あつめる数の最小/最大 */
  countMin: number
  countMax: number
  /** addsub: 合体の合計の上限（10以内に収める）。ひき算も混ぜるか */
  addMax: number
  includeSub: boolean
  /** そのプレイの問題数 */
  rounds: number
}

/** モード×難易度 → 数の範囲。難易度が上がるほど数を大きく（モードは固定）。 */
export function countSpec(mode: CountMode, difficulty: number): CountSpec {
  const d = Math.max(1, Math.min(7, difficulty))
  if (mode === 'count') {
    // L1=1〜3 … L7=最大10（少しずつ大きく）
    const max = Math.min(10, 2 + d)
    return { mode, countMin: Math.max(1, max - 2), countMax: max, addMax: 0, includeSub: false, rounds: 5 }
  }
  if (mode === 'addsub') {
    // 合計の上限: L1=5 … L6以上=10。ひき算は L3 から混ぜる
    const addMax = Math.min(10, 4 + d)
    return { mode, countMin: 1, countMax: 0, addMax, includeSub: d >= 3, rounds: 5 }
  }
  // make10（10をつくる）: いつも「10のおうち」を埋める。難易度は据え置き（10の合成が主目的）
  return { mode, countMin: 1, countMax: 9, addMax: 10, includeSub: false, rounds: 5 }
}

/** テンフレームは常に10（2×5）。10をつくる の「おうち」に使う。 */
export const TEN_FRAME_SIZE = 10
