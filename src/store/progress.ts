import { idbReadNewest, idbWrite } from './persistence'
import { MAX_DIFFICULTY } from '../types'
import type { DifficultyLevel, LetterStats, PlayerProgress, Stage, TargetKind } from '../types'

const STORAGE_KEY = 'moji-ranger-progress'
const SCHEMA_VERSION = 8

function defaultStats(): LetterStats {
  return { seen: 0, correct: 0, wrong: 0, avgReactionTime: 0, masteryLevel: 0, assistedCorrect: 0 }
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
    countryStats: {},
    collectedCountries: [],
    stageStars: {},
    stageLevels: {},
    capturedMonsters: [],
    captureFailCounts: {},
    totalStars: 0,
    playSessions: 0,
    buddyMonsterId: null,
    lastBonusDate: undefined,
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
 *   v5 → v6: buddyMonsterId（あいぼう・㊸）と lastBonusDate（ログインボーナス・㊷）を追加
 *            ＝どちらも任意項目なので構造移行は不要（欠けていれば既定値のまま）
 */
export function migrateProgress(parsed: Partial<PlayerProgress>): PlayerProgress {
  const base = defaultProgress()
  const merged = { ...base, ...parsed, schemaVersion: SCHEMA_VERSION }
  // 型の整合性チェック（壊れたフィールドだけ既定値に戻す＝部分復元）
  if (!Array.isArray(merged.capturedMonsters)) merged.capturedMonsters = []
  if (!Array.isArray(merged.collectedCountries)) merged.collectedCountries = []
  if (!Array.isArray(merged.unlockedStages)) merged.unlockedStages = base.unlockedStages
  for (const key of ['letterStats', 'numberStats', 'mathStats', 'englishStats', 'countryStats', 'stageStars', 'stageLevels', 'captureFailCounts'] as const) {
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
  // v6 は任意項目の追加のみ。壊れた型だけ既定へ戻す（部分復元）
  if (typeof merged.buddyMonsterId !== 'string') merged.buddyMonsterId = null
  if (typeof merged.lastBonusDate !== 'string') merged.lastBonusDate = undefined
  // v7: 難易度を7段階に拡張（stageLevels は上限が広がるだけでデータ移行は不要）。
  //     たしざんは既存 'math-add-1' のまま引き継ぎ、ひきざんは新ID 'math-sub-1' で0から。
  // v8: 「くに」ステージ（countryStats・collectedCountries）を追加。
  //     どちらも新規の任意データ＝欠けていれば既定値（{} / []）のまま。既存データは無変更。
  if ((parsed.schemaVersion ?? 1) < 8) {
    if (!merged.countryStats) merged.countryStats = {}
    if (!Array.isArray(merged.collectedCountries)) merged.collectedCountries = []
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
  if (kind === 'country') return progress.countryStats
  return progress.letterStats
}

/**
 * 1回の解答を記録する。
 * - 正解: correct++ と反応時間の移動平均を更新
 * - 誤答: wrong++（出題された文字・問題に対して記録し、後の再出題の材料にする）
 * - 補助あり正解（assisted=㉛。選択肢を減らす等の支援下での正解）:
 *   assistedCorrect++ のみ。correct・反応時間・masteryLevel には加算せず、
 *   通常正解と区別して記録する（支援で当てた分で習熟度を水増ししない）。
 */
export function recordAnswer(
  label: string,
  kind: TargetKind | 'math',
  correct: boolean,
  reactionMs?: number,
  assisted = false,
): void {
  const progress = loadProgress()
  const map = statsMapFor(progress, kind)
  const stats = map[label] ?? defaultStats()
  if (correct && assisted) {
    stats.assistedCorrect = (stats.assistedCorrect ?? 0) + 1
  } else if (correct) {
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

/**
 * その項目の「にがて度」。間違いが多く・まだ習熟していないほど高い。
 * 正解が積み上がると段階的に下がり、習熟（masteryLevel 上昇）で 0（＝通常頻度）に戻る。
 * ＝間違えた項目は難易度をまたいで出やすくし、できるようになったら自然に頻度を戻す（復習の減衰）。
 */
export function weaknessScore(s: LetterStats | undefined): number {
  if (!s || !(s.wrong > 0)) return 0
  return Math.max(0, s.wrong * 2 - (s.correct ?? 0) * 0.6 + (5 - (s.masteryLevel ?? 0)))
}

export interface WeakItem {
  label: string
  kind: TargetKind | 'math'
  score: number
}

/**
 * にがて項目（weaknessScore ≥ minScore）を全種類（かな・すうじ・さんすう・えいご）から
 * 集め、にがて度の強い順に返す。クリア後の「にがて振り返り」やふくしゅうステージで使う。
 * 既存の *Stats を参照するだけ（新しい統計は作らない）。
 */
export function collectWeakItems(minScore = 2): WeakItem[] {
  const p = loadProgress()
  const groups: Array<[TargetKind | 'math', Record<string, LetterStats>]> = [
    ['hiragana', p.letterStats],
    ['number', p.numberStats],
    ['math', p.mathStats],
    ['english', p.englishStats],
  ]
  const out: WeakItem[] = []
  for (const [kind, map] of groups) {
    for (const [label, s] of Object.entries(map)) {
      const score = weaknessScore(s)
      if (score >= minScore) out.push({ label, kind, score })
    }
  }
  return out.sort((a, b) => b.score - a.score)
}

/**
 * ㊾c ふくしゅうステージの出現条件（にがてかな数）。データで調整可。
 * これ以上にがてが溜まったらマップに「ふくしゅうステージ」が出る。
 */
export const REVIEW_MIN_WEAK = 5

/**
 * ㊾c ふくしゅうステージ用の「にがてかな」（ひらがな/カタカナ）を強い順に返す。
 * letterStats（かなの学習統計）だけから判定する（新しい統計は作らない）。
 * すうじ・さんすう・えいごは各ステージ内の間隔反復で復習するため、ここでは対象外。
 */
export function weakKanaForReview(max = 12): string[] {
  const p = loadProgress()
  return Object.entries(p.letterStats)
    .map(([label, s]) => ({ label, score: weaknessScore(s) }))
    .filter(x => x.score > 0 && /[ぁ-ゖァ-ヶー]/.test(x.label))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(x => x.label)
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

/** そのステージで次に挑戦する難易度（全クリア後は最高難易度で遊び続けられる） */
export function nextLevelOf(progress: PlayerProgress, stageId: string): DifficultyLevel {
  return Math.min(MAX_DIFFICULTY, clearedLevelOf(progress, stageId) + 1) as DifficultyLevel
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

// ---- せかいずかん（くに・schemaVersion 8） ----

/** その国をあつめた（＝一度でも正解した）か */
export function isCountryCollected(progress: PlayerProgress, code: string): boolean {
  return progress.collectedCountries.includes(code)
}

/** 国を正解した＝せかいずかんに登録する（重複しない） */
export function recordCountryCollected(code: string): void {
  const progress = loadProgress()
  if (!progress.collectedCountries.includes(code)) {
    progress.collectedCountries.push(code)
    saveProgress(progress)
  }
}

// ---- あいぼう（相棒・㊸） ----

/** あいぼうのモンスターID（未選択・または捕獲していなければ null） */
export function getBuddy(progress: PlayerProgress): string | null {
  const id = progress.buddyMonsterId ?? null
  if (!id) return null
  return progress.capturedMonsters.includes(id) ? id : null // 捕獲解除された等の保険
}

/** あいぼうを選ぶ（null で解除）。捕獲済みのモンスターのみ設定できる */
export function setBuddy(monsterId: string | null): void {
  const progress = loadProgress()
  if (monsterId && !progress.capturedMonsters.includes(monsterId)) return
  progress.buddyMonsterId = monsterId
  saveProgress(progress)
}

// ---- ログインボーナス（1日1回・㊷） ----

/** ローカル日付を YYYY-MM-DD で返す（端末のタイムゾーン基準） */
export function localDateKey(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 今日ぶんのログインボーナスがまだ受け取れるか（前回受取日が今日でなければ true） */
export function canClaimBonus(progress: PlayerProgress = loadProgress()): boolean {
  return progress.lastBonusDate !== localDateKey()
}

/** ログインボーナスを受け取った（＝挑戦した）ことを記録する。成功/失敗にかかわらず今日は1回 */
export function markBonusClaimed(): void {
  const progress = loadProgress()
  progress.lastBonusDate = localDateKey()
  saveProgress(progress)
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
