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

export type StageType = 'hiragana' | 'katakana' | 'number' | 'math' | 'boss' | 'english'
export type TargetKind = 'hiragana' | 'katakana' | 'number' | 'picture' | 'english'
/** ゲームプレイの型。find=正解さがし / sequence=順序撃ち / math=算数ゲート */
export type StageMode = 'find' | 'sequence' | 'math'
/**
 * 英語ステージ（type: 'english'・mode は 'find' を使う）の出題種別。
 * letter=アルファベット認識 / spell=スペル選択 / meaning=英語→意味（ひらがな）
 */
export type EnglishMode = 'letter' | 'spell' | 'meaning'

/** ステージデータ内のターゲット定義（出現位置・速度はランタイムで決まる） */
export interface TargetSpec {
  label: string
  kind: TargetKind
}

// ---- 2.5D オンレール対峙モード（renderer: '2.5d'）用 ----

export type EncounterLayout = 'A_single_boss' | 'B_enemy_per_choice'

/** 対峙エンカウントの定義（データ編集だけで追加できる） */
export interface EncounterSpec {
  id: string
  layout: EncounterLayout
  /** 完全浄化に必要な正解回数 */
  purifySteps: number
  /** 出す選択肢の数（難易度で増減） */
  choiceCount: number
  /** 次に狙う文字を学習システム（間隔反復）が選ぶ候補プール */
  letterPool: string[]
  /** まぎらわしい選択肢のプール */
  distractorPool: TargetSpec[]
  /** ボス対峙なら true（演出強化・フェーズ3） */
  boss?: boolean
}

/** ルートの1区間。ride=前進 / encounter=対峙（レガシー: battle 形式を推奨） */
export type StageSegment =
  | { type: 'ride'; distance: number }
  | { type: 'encounter'; encounterId: string }

/**
 * 連戦→ボス形式のステージ定義。
 * 前進中に敵が近づいてくる→1体ずつ対峙して浄化→規定体数でボス出現。
 * すべてデータ編集だけで調整できる。
 */
export interface StageBattle {
  /** ボス出現までに浄化するザコの体数 */
  enemyCount: number
  /** ザコ1体の浄化に必要な正解数（1推奨=テンポ重視。メーターは2以上で表示） */
  purifyStepsPerEnemy: number
  /** ボスの浄化に必要な正解数 */
  bossPurifySteps: number
  /** 選択肢の数（正答率<70%で自動で1減る / >85%で似た文字が混ざる） */
  choiceCount: number
  /** 敵と敵の間の前進距離 */
  rideDistance: number
  /** 出題プール（習わせたい順）。習得に応じて先頭から徐々に開放される */
  letterPool: string[]
  /** 最初に開放しておくプールの文字数 */
  poolStart: number
}

/** 敵のランタイム状態 */
export interface EnemyState {
  id: string
  /** 0..1。正解ごとに進む（=もやが晴れる） */
  purifyMeter: number
  mood: 'hazy' | 'clearing' | 'happy'
}

/** プレイヤーの視点・快適性設定（フェーズ3で設定画面から変更可能にする） */
export interface PlayerViewState {
  cameraProgress: number
  aimX: number
  aimY: number
  isAutoAimEnabled: boolean
  /** 0=なし 1=すこし 2=ふつう */
  motionComfortLevel: 0 | 1 | 2
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

/** ステージ内の難易度段階。1→2→3→4→5 の順に解放される */
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5
/** 最高難易度（今後さらに増やすときはここと data/difficulty.ts を広げる） */
export const MAX_DIFFICULTY = 5

/** さんすうバトルの難易度別出題パラメータ（毎ラウンドのランダム生成に使う） */
export interface MathLevelSpec {
  /** 使う演算の種類 */
  ops: Array<'+' | '-'>
  /** 答えの最大値（最小は常に1。0以下になる問題は生成しない） */
  maxAnswer: number
}

export interface Stage {
  id: string
  title: string
  type: StageType
  mode: StageMode
  /**
   * 解放条件（省略時は常時解放）。
   * 「stageId の難易度 minLevel をクリア済み」で解放される。
   */
  unlock?: { stageId: string; minLevel: DifficultyLevel }
  /** true ならステージマップに出さない（データ・進捗は温存したまま無効化） */
  hidden?: boolean
  /** math モード: 難易度別のランダム出題パラメータ（あれば problems より優先） */
  mathLevels?: Record<number, MathLevelSpec>
  /** english ステージの出題種別（type: 'english' のとき必須。出題内容は src/data/english.ts） */
  enMode?: EnglishMode
  /** ゲームシーンの描画方式。'2.5d'=オンレール対峙 / 省略時 '2d'=固定画面（レガシー） */
  renderer?: '2d' | '2.5d'
  /** 2.5d 用: 連戦→ボスのバトル定義（推奨） */
  battle?: StageBattle
  /** 2.5d 用: ルート構成（レガシー・battle があれば不要） */
  segments?: StageSegment[]
  /** 2.5d 用: 対峙エンカウント定義（レガシー・battle があれば不要） */
  encounters?: EncounterSpec[]
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
  /**
   * 補助あり正解の回数（㉛）。選択肢を減らす等の支援下で当てた正解は、
   * 通常正解（correct）と区別してここに記録し、masteryLevel には加算しない
   * （習熟度の水増しを防ぐ）。古いセーブには無いので任意項目。
   */
  assistedCorrect?: number
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
  /** 英語（アルファベット・単語）の学習統計（schemaVersion 5 で追加） */
  englishStats: Record<string, LetterStats>
  /** ステージごとのベスト★（schemaVersion 2 で追加） */
  stageStars: Record<string, number>
  /** ステージごとのクリア済み最高難易度 0〜3（schemaVersion 3 で追加） */
  stageLevels: Record<string, number>
  /** なかまにしたモンスターのID一覧（schemaVersion 4 で追加） */
  capturedMonsters: string[]
  /** なかま失敗回数（モンスターIDごと・pity 救済用。schemaVersion 4 で追加） */
  captureFailCounts: Record<string, number>
  /** 全ステージのベスト★合計 */
  totalStars: number
  playSessions: number
  /** 最終保存日時（多重保存の新旧判定用。schemaVersion 4 以降で付与） */
  savedAt?: number
}

/** ステージクリア時に Phaser → React へ渡す結果 */
export interface StageResult {
  stageId: string
  /** プレイした難易度（リザルトの「つぎ」判定に使う） */
  difficulty: DifficultyLevel
  rounds: number
  wrongCount: number
  maxCombo: number
  stars: 1 | 2 | 3
  playTimeMs: number
}
