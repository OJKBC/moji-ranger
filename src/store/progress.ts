import type { LetterStats, PlayerProgress, TargetKind } from '../types'

const STORAGE_KEY = 'moji-ranger-progress'
const SCHEMA_VERSION = 1

function defaultStats(): LetterStats {
  return { seen: 0, correct: 0, wrong: 0, avgReactionTime: 0, masteryLevel: 0 }
}

function defaultProgress(): PlayerProgress {
  return {
    schemaVersion: SCHEMA_VERSION,
    age: 5,
    unlockedStages: ['hiragana-a'],
    heroUnlocks: ['red'],
    selectedHero: 'red',
    letterStats: {},
    numberStats: {},
    mathStats: {},
    totalStars: 0,
    playSessions: 0,
  }
}

/** localStorage から読み込む。壊れていたり古いスキーマでも安全に既定値へマージする */
export function loadProgress(): PlayerProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultProgress()
    const parsed = JSON.parse(raw) as Partial<PlayerProgress>
    const base = defaultProgress()
    // 将来 schemaVersion が上がったらここで移行処理を分岐する
    return { ...base, ...parsed, schemaVersion: SCHEMA_VERSION }
  } catch {
    return defaultProgress()
  }
}

export function saveProgress(progress: PlayerProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // ストレージが使えない環境（プライベートモード等）でもゲームは続行できる
  }
}

function statsMapFor(progress: PlayerProgress, kind: TargetKind): Record<string, LetterStats> {
  if (kind === 'number') return progress.numberStats
  return progress.letterStats
}

/**
 * 1回の解答を記録する。
 * - 正解: correct++ と反応時間の移動平均を更新
 * - 誤答: wrong++（出題された文字に対して記録し、後の再出題の材料にする）
 */
export function recordAnswer(label: string, kind: TargetKind, correct: boolean, reactionMs?: number): void {
  const progress = loadProgress()
  const map = statsMapFor(progress, kind)
  const stats = map[label] ?? defaultStats()
  if (correct) {
    stats.correct += 1
    if (reactionMs !== undefined && reactionMs > 0) {
      stats.avgReactionTime = stats.avgReactionTime === 0
        ? reactionMs
        : Math.round(stats.avgReactionTime * 0.7 + reactionMs * 0.3)
    }
  } else {
    stats.wrong += 1
  }
  stats.masteryLevel = Math.min(5, Math.max(0, Math.round((stats.correct - stats.wrong) / 3)))
  map[label] = stats
  saveProgress(progress)
}

/** ラウンド開始時に「出題された」ことを記録する */
export function recordSeen(label: string, kind: TargetKind): void {
  const progress = loadProgress()
  const map = statsMapFor(progress, kind)
  const stats = map[label] ?? defaultStats()
  stats.seen += 1
  map[label] = stats
  saveProgress(progress)
}

export function recordStageClear(stars: number): void {
  const progress = loadProgress()
  progress.totalStars += stars
  progress.playSessions += 1
  saveProgress(progress)
}
