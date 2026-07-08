import type { DifficultyLevel, LetterStats, PlayerProgress, Stage, TargetKind } from '../types'

const STORAGE_KEY = 'moji-ranger-progress'
const SCHEMA_VERSION = 4

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
    stageLevels: {},
    capturedMonsters: [],
    captureFailCounts: {},
    totalStars: 0,
    playSessions: 0,
  }
}

/**
 * localStorage から読み込む。壊れていたり古いスキーマでも安全に既定値へマージする。
 * スキーマ移行履歴:
 *   v1 → v2: stageStars を追加（v1 の totalStars は再計算されるため引き継がない）
 *   v2 → v3: stageLevels（ステージ×難易度のクリア状況）を追加。
 *            旧データで★のあるステージは「難易度1クリア済み」とみなす
 *   v3 → v4: capturedMonsters（なかま）と captureFailCounts（pity 救済）を追加
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
    if ((parsed.schemaVersion ?? 1) < 3) {
      merged.stageLevels = {}
      for (const [stageId, stars] of Object.entries(merged.stageStars)) {
        if (stars > 0) merged.stageLevels[stageId] = 1
      }
    }
    if ((parsed.schemaVersion ?? 1) < 4) {
      merged.capturedMonsters = []
      merged.captureFailCounts = {}
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
 * ベスト★とクリア済み最高難易度を更新し、totalStars はベスト★の合計として再計算。
 * ステージの解放判定は isStageUnlocked が stageLevels から導出する（配列の追記は不要）。
 */
export function recordStageClear(stageId: string, stars: number, difficulty: DifficultyLevel): void {
  const progress = loadProgress()
  progress.stageStars[stageId] = Math.max(progress.stageStars[stageId] ?? 0, stars)
  progress.stageLevels[stageId] = Math.max(progress.stageLevels[stageId] ?? 0, difficulty)
  progress.totalStars = Object.values(progress.stageStars).reduce((sum, s) => sum + s, 0)
  progress.playSessions += 1
  saveProgress(progress)
}

/** ステージのクリア済み最高難易度（0=未クリア） */
export function clearedLevelOf(progress: PlayerProgress, stageId: string): number {
  return progress.stageLevels[stageId] ?? 0
}

/** そのステージで次に挑戦する難易度（全クリア後は3で遊び続けられる） */
export function nextLevelOf(progress: PlayerProgress, stageId: string): DifficultyLevel {
  return Math.min(3, clearedLevelOf(progress, stageId) + 1) as DifficultyLevel
}

// ---- なかまボール（捕獲）関連 ----

/** なかまにしているか */
export function isCaptured(progress: PlayerProgress, monsterId: string): boolean {
  return progress.capturedMonsters.includes(monsterId)
}

/** なかま成功を記録（失敗カウントもリセット） */
export function recordCaptureSuccess(monsterId: string): void {
  const progress = loadProgress()
  if (!progress.capturedMonsters.includes(monsterId)) {
    progress.capturedMonsters.push(monsterId)
  }
  delete progress.captureFailCounts[monsterId]
  saveProgress(progress)
}

/** なかま失敗を記録（pity 救済のカウント） */
export function recordCaptureFail(monsterId: string): void {
  const progress = loadProgress()
  progress.captureFailCounts[monsterId] = (progress.captureFailCounts[monsterId] ?? 0) + 1
  saveProgress(progress)
}

/** そのモンスターの累計失敗回数（pity 判定用） */
export function captureFailCount(progress: PlayerProgress, monsterId: string): number {
  return progress.captureFailCounts[monsterId] ?? 0
}

/**
 * ステージが解放されているか。
 * データ宣言の unlock 条件（〜の難易度nクリア）から導出する。
 * 旧セーブの unlockedStages に入っているステージはそのまま解放扱い（ロックアウト防止）。
 */
export function isStageUnlocked(stage: Stage, progress: PlayerProgress): boolean {
  if (progress.unlockedStages.includes(stage.id)) return true
  if (!stage.unlock) return true
  return clearedLevelOf(progress, stage.unlock.stageId) >= stage.unlock.minLevel
}
