import type { LetterStats, PlayerProgress, TargetKind } from '../types'

const STORAGE_KEY = 'moji-ranger-progress'
const SCHEMA_VERSION = 2

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
    stageStars: {},
    totalStars: 0,
    playSessions: 0,
  }
}

/**
 * localStorage から読み込む。壊れていたり古いスキーマでも安全に既定値へマージする。
 * スキーマ移行履歴:
 *   v1 → v2: stageStars を追加（v1 の totalStars は再計算されるため引き継がない）
 */
export function loadProgress(): PlayerProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultProgress()
    const parsed = JSON.parse(raw) as Partial<PlayerProgress>
    const base = defaultProgress()
    const merged = { ...base, ...parsed, schemaVersion: SCHEMA_VERSION }
    if ((parsed.schemaVersion ?? 1) < 2) {
      merged.stageStars = {}
      merged.totalStars = 0
    }
    return merged
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

function statsMapFor(progress: PlayerProgress, kind: TargetKind | 'math'): Record<string, LetterStats> {
  if (kind === 'math') return progress.mathStats
  if (kind === 'number') return progress.numberStats
  return progress.letterStats
}

/**
 * 1回の解答を記録する。
 * - 正解: correct++ と反応時間の移動平均を更新
 * - 誤答: wrong++（出題された文字・問題に対して記録し、後の再出題の材料にする）
 */
export function recordAnswer(label: string, kind: TargetKind | 'math', correct: boolean, reactionMs?: number): void {
  const progress = loadProgress()
  const map = statsMapFor(progress, kind)
  const stats = map[label] ?? defaultStats()
  if (correct) {
    stats.correct += 1
    if (reactionMs !== undefined && reactionMs > 0) {
      stats.avgReactionTime = stats.avgReactionTime === 0
        ? Math.round(reactionMs)
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
export function recordSeen(label: string, kind: TargetKind | 'math'): void {
  const progress = loadProgress()
  const map = statsMapFor(progress, kind)
  const stats = map[label] ?? defaultStats()
  stats.seen += 1
  map[label] = stats
  saveProgress(progress)
}

/**
 * ステージクリアを記録する。
 * ベスト★を更新し、totalStars はベスト★の合計として再計算。
 * 次ステージがあればアンロックする。
 */
export function recordStageClear(stageId: string, stars: number, unlockStageId?: string | null): void {
  const progress = loadProgress()
  progress.stageStars[stageId] = Math.max(progress.stageStars[stageId] ?? 0, stars)
  progress.totalStars = Object.values(progress.stageStars).reduce((sum, s) => sum + s, 0)
  progress.playSessions += 1
  if (unlockStageId && !progress.unlockedStages.includes(unlockStageId)) {
    progress.unlockedStages.push(unlockStageId)
  }
  saveProgress(progress)
}
