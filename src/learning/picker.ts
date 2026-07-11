import { LEARNING } from '../data/learningConfig'
import { loadProgress, weaknessScore } from '../store/progress'
import type { TargetKind } from '../types'

/**
 * 次に狙う文字を選ぶ簡易・間隔反復ピッカー（ボスの復習出題用）。
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
 *
 * 出題バランス（数値は data/learningConfig.ts で調整）:
 * - 復習（苦手優先）は maxReviewRatio までに抑え、残りはプール全体からまんべんなく選ぶ
 *   （完全ランダムにはしない＝間隔反復は生かしつつ、同じ文字への張り付きを防ぐ）
 * - 直前の文字は出さない（2連続禁止）。直近 recentWindow 問に出た文字も選ばれにくくする
 * - 未出題の文字を優先的に露出させ、出題回数が少ない文字ほど選ばれやすくする
 */
export function pickTargetLetter(pool: string[], poolStart: number, kind: TargetKind, recent: string[] = []): string {
  const progress = loadProgress()
  const map = kind === 'number' ? progress.numberStats : progress.letterStats
  const learned = pool.filter(l => (map[l]?.correct ?? 0) >= 2).length
  const unlockedCount = Math.min(pool.length, poolStart + learned)
  let unlocked = pool.slice(0, unlockedCount)
  // 同じ文字を2回連続で出題しない
  const last = recent[recent.length - 1]
  if (last && unlocked.length > 1) unlocked = unlocked.filter(l => l !== last)

  // この1問を「復習の回」にするかどうか（比率の上限を守る）
  const isReviewTurn = Math.random() < LEARNING.maxReviewRatio
  const recentSet = new Set(recent.slice(-LEARNING.recentWindow))
  // 出題回数はプール内の最小値との「差」で評価する（昔たくさん出た文字が
  // 永久に選ばれなくなるのを防ぎつつ、露出の少ない文字を優先する）
  const minSeen = Math.min(...unlocked.map(l => map[l]?.seen ?? 0))

  let best = unlocked[0]
  let bestScore = -Infinity
  for (const label of unlocked) {
    const s = map[label]
    const seen = s?.seen ?? 0
    let score = Math.random() * 2
    // まんべんなく露出させる（未出題は必ず優先・出題回数が相対的に多いほど後回し）
    if (seen === 0) score += LEARNING.unseenBoost
    score -= Math.min(seen - minSeen, 15) * LEARNING.seenPenaltyPerCount
    // 直近に出た文字は避ける
    if (recentSet.has(label)) score -= LEARNING.recentPenalty
    // 間違えた項目は難易度をまたいで少し出やすくする（常時の弱いブースト）。
    // weaknessScore は正解の積み上げで減衰し、習熟したら 0（通常頻度）に戻る。
    const weak = weaknessScore(s)
    score += weak * 0.3
    // 復習の回はさらに強く苦手を優先する（比率上限は maxReviewRatio で守られる）
    if (isReviewTurn) score += weak * 1.2

    if (score > bestScore) {
      bestScore = score
      best = label
    }
  }
  return best
}
