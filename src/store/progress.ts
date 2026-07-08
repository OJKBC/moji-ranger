import { idbReadNewest, idbWrite } from './persistence'
import type { DifficultyLevel, LetterStats, PlayerProgress, Stage, TargetKind } from '../types'

const STORAGE_KEY = 'moji-ranger-progress'
const SCHEMA_VERSION = 5

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
    englishStats: {},
    stageStars: {},
    stageLevels: {},
    capturedMonsters: [],
    captureFailCounts: {},
    totalStars: 0,
    playSessions: 0,
  }
}

/**
 * 旧スキーマ・部分破損データを、安全に現行スキーマの PlayerProgress へ変換する。
 * 型がおかしいフィールドは既定値に戻し、可能な部分だけ復元する（全消しにしない）。
 * スキーマ移行履歴:
 *   v1 → v2: stageStars を追加（v1 の totalStars は再計算されるため引き継がない）
 *   v2 → v3: stageLevels（ステージ×難易度のクリア状況）を追加。
 *            旧データで★のあるステージは「難易度1クリア済み」とみなす
 *   v3 → v4: capturedMonsters（なかま）と captureFailCounts（pity 救済）を追加
 *   v4 → v5: englishStats（英語ステージの学習統計）を追加
 */
export function migrateProgress(parsed: Partial<PlayerProgress>): PlayerProgress {
  const base = defaultProgress()
  const merged = { ...base, ...parsed, schemaVersion: SCHEMA_VERSION }
  // 型の整合性チェック（壊れたフィールドだけ既定値に戻す＝部分復元）
  if (!Array.isArray(merged.capturedMonsters)) merged.capturedMonsters = []
  if (!Array.isArray(merged.unlockedStages)) merged.unlockedStages = base.unlockedStages
  for (const key of ['letterStats', 'numberStats', 'mathStats', 'englishStats', 'stageStars', 'stageLevels', 'captureFailCounts'] as const) {
    if (typeof merged[key] !== 'object' || merged[key] === null || Array.isArray(merged[key])) {
      ;(merged as Record<string, unknown>)[key] = {}
    }
  }
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
  if ((parsed.schemaVersion ?? 1) < 5) {
    merged.englishStats = {}
  }
  return merged
}

/**
 * localStorage から読み込む。壊れていたり古いスキーマでも安全に既定値へマージする
 * （エラー画面は絶対に出さない。失敗時は初期状態＝「？」の並んだずかんで開く）。
 */
export function loadProgress(): PlayerProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultProgress()
    return migrateProgress(JSON.parse(raw) as Partial<PlayerProgress>)
  } catch {
    return defaultProgress()
  }
}

/**
 * 保存。localStorage（同期・主読み込み元）と IndexedDB（耐久ミラー・ダブルバッファ）の
 * 両方へ書き込む。なかま獲得・難易度クリア・解答記録など「失うと痛い瞬間」は
 * すべて record 系関数がこの saveProgress を通るため、その場で毎回二重保存される。
 */
export function saveProgress(progress: PlayerProgress): void {
  progress.savedAt = Date.now()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // ストレージが使えない環境（プライベートモード等）でもゲームは続行できる
  }
  void idbWrite(progress, progress.savedAt)
}

/**
 * 起動時の復旧処理。localStorage が消えていて IndexedDB に残っていれば復活させる。
 * 両方あれば保存日時の新しいほうを採用する（描画前に1回だけ呼ぶ）。
 */
export async function initPersistence(): Promise<void> {
  let local: PlayerProgress | null = null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) local = migrateProgress(JSON.parse(raw) as Partial<PlayerProgress>)
  } catch {
    local = null
  }
  const idb = await idbReadNewest()
  const idbData = idb ? migrateProgress(idb.data as Partial<PlayerProgress>) : null
  const localAt = local?.savedAt ?? 0
  const idbAt = idb?.savedAt ?? 0
  if (idbData && (!local || idbAt > localAt)) {
    // localStorage が消えた/古い → IndexedDB から復活
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(idbData))
    } catch { /* localStorage 不可でも IndexedDB 側で継続 */ }
  } else if (local && !idbData) {
    // 初回移行: 既存の localStorage セーブを IndexedDB へ複製
    void idbWrite(local, localAt || Date.now())
  }
}

// ---- 保護者向けバックアップ／復元（⑳b） ----

/** 全セーブデータを JSON 文字列で書き出す（ファイル保存・コード共有兼用） */
export function exportSave(): string {
  return JSON.stringify(loadProgress(), null, 2)
}

/**
 * JSON 文字列（またはファイル内容）からセーブデータを復元する。
 * 古い schemaVersion はマイグレーション。壊れていれば false（現データは変更しない）。
 */
export function importSave(json: string): boolean {
  try {
    const parsed = JSON.parse(json) as Partial<PlayerProgress>
    if (typeof parsed !== 'object' || parsed === null) return false
    // セーブデータらしさの最低限チェック（無関係なJSONの誤読み込みを防ぐ）
    if (!('schemaVersion' in parsed) && !('letterStats' in parsed) && !('capturedMonsters' in parsed)) {
      return false
    }
    saveProgress(migrateProgress(parsed))
    return true
  } catch {
    return false
  }
}

function statsMapFor(progress: PlayerProgress, kind: TargetKind | 'math'): Record<string, LetterStats> {
  if (kind === 'math') return progress.mathStats
  if (kind === 'number') return progress.numberStats
  if (kind === 'english') return progress.englishStats
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
