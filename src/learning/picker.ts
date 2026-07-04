import { loadProgress } from '../store/progress'
import type { TargetKind } from '../types'

/**
 * 次に狙う文字を選ぶ簡易・間隔反復ピッカー。
 * 統計（letterStats / numberStats）を出題に還元する入口で、
 * 対峙エンカウントは正解のたびにここへ「次は何を出す？」と聞きにくる。
 *
 * 優先度: 誤答が多い文字 > 未出題の文字 > 熟達度が低い文字。
 * わずかな乱数で同点をばらし、同じ文字ばかりの連続を避ける。
 */
export function pickNextLetter(pool: string[], kind: TargetKind): string {
  if (pool.length === 1) return pool[0]
  const progress = loadProgress()
  const map = kind === 'number' ? progress.numberStats : progress.letterStats
  let best = pool[0]
  let bestScore = -Infinity
  for (const label of pool) {
    const s = map[label]
    const wrong = s?.wrong ?? 0
    const seen = s?.seen ?? 0
    const mastery = s?.masteryLevel ?? 0
    const score = wrong * 3 + (seen === 0 ? 4 : 0) + (5 - mastery) + Math.random() * 2
    if (score > bestScore) {
      bestScore = score
      best = label
    }
  }
  return best
}

/**
 * 習得に応じて徐々に広がるプールから、次のターゲットを選ぶ。
 * - プール（習わせたい順）の先頭 poolStart 文字から始める
 * - correct が2回以上になった文字が増えるたびに、次の文字が1つ開放される
 * - exclude（直前のターゲット）は候補が2つ以上あれば避け、同じ文字の連続を防ぐ
 */
export function pickTargetLetter(pool: string[], poolStart: number, kind: TargetKind, exclude?: string): string {
  const progress = loadProgress()
  const map = kind === 'number' ? progress.numberStats : progress.letterStats
  const learned = pool.filter(l => (map[l]?.correct ?? 0) >= 2).length
  const unlockedCount = Math.min(pool.length, poolStart + learned)
  let unlocked = pool.slice(0, unlockedCount)
  if (exclude && unlocked.length > 1) unlocked = unlocked.filter(l => l !== exclude)
  return pickNextLetter(unlocked, kind)
}
