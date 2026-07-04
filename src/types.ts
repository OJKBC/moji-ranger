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
/** ゲームプレイの型。find=正解さがし / sequence=順序撃ち / math=算数ゲート */
export type StageMode = 'find' | 'sequence' | 'math'

/** ステージデータ内のターゲット定義（出現位置・速度はランタイムで決まる） */
export interface TargetSpec {
  label: string
  kind: TargetKind
}

/** 算数ゲート用の1問 */
export interface MathProblem {
  /** 表示する式。例: '2+1' */
  question: string
  /** 読み上げ文。例: '2 たす 1 は？' */
  voicePrompt: string
  answer: string
  /** ゲートに出す選択肢（answer を含む3つ） */
  choices: string[]
}

export interface Stage {
  id: string
  title: string
  type: StageType
  mode: StageMode
  recommendedAgeMin: number
  recommendedAgeMax: number
  /** ミッションバーに表示する文（読めない子には音声＋文字強調で伝える） */
  missionText: string
  /** ラウンド開始時に読み上げる文の候補（バリエーション。順に循環） */
  voicePrompts: string[]
  /** 正解ラベル（find モード用） */
  correctAnswer?: string
  correctKind: TargetKind
  /** まぎらわしい選択肢（find / sequence モード用） */
  distractors: TargetSpec[]
  /** sequence モード: 撃つ順序。例: ['ね','こ'] */
  correctSequence?: string[]
  /** sequence モード: 完成する単語。例: 'ねこ' */
  word?: string
  /** sequence モード: 完成演出に使う絵文字。例: '🐱' */
  celebration?: string
  /** math モード: 出題する問題（ラウンドごとに順に出す） */
  problems?: MathProblem[]
  /** 1ステージのラウンド数 */
  rounds: number
  /** 1ラウンドに出すターゲット数（find: 正解1＋誤答n-1） */
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
  /** ステージごとのベスト★（schemaVersion 2 で追加） */
  stageStars: Record<string, number>
  /** 全ステージのベスト★合計 */
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
