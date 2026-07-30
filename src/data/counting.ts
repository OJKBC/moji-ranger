/**
 * 「かぞえて モンスター」（暗算不要のさんすう入口）の難易度別データ。
 *
 * 設計思想（最重要）: どのモードも「数える・増減を見る・10の枠を埋める」だけで解ける。
 *   暗算で答えの数字を先に出させない。数の表示はテンフレーム（2×5=10の枠）で統一。
 *
 * 難易度1〜7でモードを段階開放（stages.ts の count-monster は difficulty で level を渡す）:
 *   1〜2 = かぞえる（count・1〜6）
 *   3〜4 = ふえる・へる（addsub・合体/分裂・まず10以内）
 *   5〜6 = 10をつくる（make10・テンフレームの空きを埋める）
 *   7    = かずのみち（numberline・10前後への橋渡し。モード4）
 *
 * ここは「数の範囲・出題数」だけを持つデータ。出題生成・UIは CountMonster.tsx。
 * 数の範囲を変えたいときはこの表を編集するだけ（後から調整・追加しやすい）。
 */
export type CountMode = 'count' | 'addsub' | 'make10' | 'numberline'

export interface CountLevelSpec {
  mode: CountMode
  /** count: あつめる数の最小/最大 */
  min: number
  max: number
  /** addsub: ひき算も混ぜるか（false=たし算＝合体のみ） */
  includeSub?: boolean
  /** そのプレイの問題数 */
  rounds: number
}

export const COUNT_LEVELS: Record<number, CountLevelSpec> = {
  1: { mode: 'count', min: 1, max: 5, rounds: 5 },
  2: { mode: 'count', min: 3, max: 6, rounds: 5 },
  3: { mode: 'addsub', min: 1, max: 4, includeSub: false, rounds: 5 }, // 合体（たし算）・答え≤8
  4: { mode: 'addsub', min: 1, max: 5, includeSub: true, rounds: 5 },  // 合体/分裂・10以内
  5: { mode: 'make10', min: 1, max: 9, rounds: 5 }, // テンフレームの空きを埋めて10
  6: { mode: 'make10', min: 1, max: 9, rounds: 6 },
  7: { mode: 'numberline', min: 1, max: 9, rounds: 5 }, // かずのみち（モード4・橋渡し）
}

export function countLevel(difficulty: number): CountLevelSpec {
  return COUNT_LEVELS[difficulty] ?? COUNT_LEVELS[1]
}

/** テンフレームは常に10マス（2×5）。数の見せ方を全モードで統一する。 */
export const TEN_FRAME_SIZE = 10

/** 数字（1〜20）の読み（音声・DIGIT_READING と同じ。ここでも使えるよう複製） */
export const NUMBER_READING: Record<number, string> = {
  1: 'いち', 2: 'に', 3: 'さん', 4: 'よん', 5: 'ご',
  6: 'ろく', 7: 'なな', 8: 'はち', 9: 'きゅう', 10: 'じゅう',
  11: 'じゅう いち', 12: 'じゅう に', 13: 'じゅう さん', 14: 'じゅう よん',
  15: 'じゅう ご', 16: 'じゅう ろく', 17: 'じゅう なな', 18: 'じゅう はち',
  19: 'じゅう きゅう', 20: 'に じゅう',
}

/** 数字の読み（無い数はそのまま） */
export function readNumber(n: number): string {
  return NUMBER_READING[n] ?? String(n)
}
