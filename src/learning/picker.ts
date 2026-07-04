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
