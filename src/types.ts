// ゲーム全体で使う型定義。ゲームロジックと UI の共通言語。

export type BeamType = 'spark' | 'ice' | 'flower' | 'leaf' | 'thunder'

export interface Hero {
  id: string
  name: string
  /** 0xRRGGBB のテーマカラー（ビーム・エフェクトに使用） */
  color: number
  beamType: BeamType
  specialMove: string
  unlocked: boolean
  /** heroes.png スプライトシート内のフレーム番号 */
  frameIndex: number
}

export type StageType = 'hiragana' | 'katakana' | 'number' | 'math' | 'boss'
export type TargetKind = 'hiragana' | 'katakana' | 'number' | 'picture'

/** ステージデータ内のターゲット定義（出現位置・速度はランタイムで決まる） */
export interface TargetSpec {
  label: string
  kind: TargetKind
}

export interface Stage {
  id: string
  title: string
  type: StageType
  recommendedAgeMin: number
  recommendedAgeMax: number
  /** ミッションバーに表示する文（読めない子には音声＋文字強調で伝える） */
  missionText: string
  /** ラウンド開始時に読み上げる文の候補（バリエーション。順に循環） */
  voicePrompts: string[]
  /** 正解ラベル（単一ターゲットステージ用） */
  correctAnswer: string
  correctKind: TargetKind
  /** まぎらわしい選択肢 */
  distractors: TargetSpec[]
  /** 順序撃ちステージ用（フェーズ2）。例: ['ね','こ'] */
  correctSequence?: string[]
  /** 算数ゲートステージ用（フェーズ2） */
  gates?: string[]
  /** 1ステージのラウンド数 */
  rounds: number
  /** 1ラウンドに出すターゲット数（正解1＋誤答n-1） */
  targetsPerRound: number
  reward: number
  difficulty: number
}

/** 文字ごとの学習統計。難易度調整と親レポートの両方の材料になる */
export interface LetterStats {
  seen: number
  correct: number
  wrong: number
  /** 正解時の平均反応時間（ms・移動平均） */
  avgReactionTime: number
  /** 0〜5 の熟達度 */
  masteryLevel: number
}

export interface PlayerProgress {
  /** 保存データのスキーマバージョン。構造変更時に移行処理を行うため必須 */
  schemaVersion: number
  age: number
  unlockedStages: string[]
  heroUnlocks: string[]
  selectedHero: string
  letterStats: Record<string, LetterStats>
  numberStats: Record<string, LetterStats>
  mathStats: Record<string, LetterStats>
  totalStars: number
  playSessions: number
}

/** ステージクリア時に Phaser → React へ渡す結果 */
export interface StageResult {
  stageId: string
  rounds: number
  wrongCount: number
  maxCombo: number
  stars: 1 | 2 | 3
  playTimeMs: number
}
