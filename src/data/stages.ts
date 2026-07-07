import type { Hero, Stage } from '../types'

/**
 * ステージデータ集約ファイル。
 * ステージを増やすときは、この配列にオブジェクトを1件追加するだけでよい。
 * 並び順がそのままステージマップの順序・アンロック順になる。
 */
export const STAGES: Stage[] = [
  {
    id: 'hiragana-a', // 内部キーは変更しない（保存済み進捗を壊さないため）
    title: 'ひらがなこうえん',
    type: 'hiragana',
    mode: 'find',
    renderer: '2.5d',
    recommendedAgeMin: 4,
    recommendedAgeMax: 6,
    missionText: 'おとを きいて ねらおう！',
    voicePrompts: [],
    correctAnswer: 'あ',
    correctKind: 'hiragana',
    distractors: [
      { label: 'お', kind: 'hiragana' },
      { label: 'め', kind: 'hiragana' },
      { label: 'ぬ', kind: 'hiragana' },
      { label: 'ね', kind: 'hiragana' },
    ],
    battle: {
      enemyCount: 4,
      purifyStepsPerEnemy: 1,
      bossPurifySteps: 4,
      choiceCount: 5,
      rideDistance: 50,
      // 習わせたい順。習得（correct2回以上）に応じて先頭から徐々に開放される
      letterPool: ['あ', 'い', 'う', 'お', 'ん', 'め', 'ぬ', 'ね', 'れ', 'わ', 'さ', 'ち'],
      poolStart: 5,
    },
    rounds: 8,
    targetsPerRound: 5,
    reward: 1,
    difficulty: 1,
  },
  {
    id: 'katakana-a',
    title: 'カタカナこうえん',
    type: 'katakana',
    mode: 'find',
    renderer: '2.5d',
    // ひらがなこうえんの難易度3をクリアすると解放
    unlock: { stageId: 'hiragana-a', minLevel: 3 },
    recommendedAgeMin: 4,
    recommendedAgeMax: 6,
    missionText: 'おとを きいて ねらおう！',
    voicePrompts: [],
    correctAnswer: 'ア',
    correctKind: 'katakana',
    distractors: [
      { label: 'マ', kind: 'katakana' },
      { label: 'ヤ', kind: 'katakana' },
      { label: 'ウ', kind: 'katakana' },
      { label: 'イ', kind: 'katakana' },
    ],
    battle: {
      enemyCount: 4,
      purifyStepsPerEnemy: 1,
      bossPurifySteps: 4,
      choiceCount: 5,
      rideDistance: 50,
      // 紛らわしい定番（シ/ツ・ソ/ン・ク/ワ）は後半に置き、まず読みやすい字から
      letterPool: ['ア', 'イ', 'ウ', 'オ', 'ン', 'シ', 'ツ', 'ソ', 'ク', 'ワ', 'タ', 'メ'],
      poolStart: 5,
    },
    rounds: 8,
    targetsPerRound: 5,
    reward: 1,
    difficulty: 1,
  },
  {
    id: 'word-neko', // 内部キーは変更しない（保存済み進捗を壊さないため）
    title: 'もじもじアトラクション',
    type: 'hiragana',
    mode: 'sequence',
    renderer: '2.5d', // 画面仕様はひらがなこうえんと共通（差分は出題内容だけ）
    unlock: { stageId: 'hiragana-a', minLevel: 1 },
    recommendedAgeMin: 4,
    recommendedAgeMax: 6,
    missionText: 'じゅんばんに うって ことばを つくろう！',
    voicePrompts: [],
    correctKind: 'hiragana',
    // 出題は src/data/words.ts の単語プールから（難易度=文字数）。
    // 以下はプールが空のときのフォールバック
    correctSequence: ['ね', 'こ'],
    word: 'ねこ',
    celebration: '🐱',
    distractors: [
      { label: 'れ', kind: 'hiragana' },
      { label: 'わ', kind: 'hiragana' },
      { label: 'に', kind: 'hiragana' },
    ],
    battle: {
      enemyCount: 3, // 敵1体＝単語1つ（ボスも単語1つ。浄化ステップ＝文字数）
      purifyStepsPerEnemy: 1, // sequence では未使用（単語の文字数が優先）
      bossPurifySteps: 1, // 同上
      choiceCount: 5,
      rideDistance: 50,
      letterPool: [], // sequence では未使用（words.ts のプールを使う）
      poolStart: 0,
    },
    rounds: 5,
    targetsPerRound: 5,
    reward: 1,
    difficulty: 2,
  },
  {
    id: 'number-3',
    title: '「3」をさがせ！',
    type: 'number',
    mode: 'find',
    hidden: true, // 一旦マップから非表示（データ・進捗は温存）
    unlock: { stageId: 'word-neko', minLevel: 1 },
    recommendedAgeMin: 4,
    recommendedAgeMax: 6,
    missionText: 'すうじの「3」を さがして ビーム！',
    voicePrompts: [
      'すうじの さん を さがして、ビーム！',
      'さん は どこかな？',
      'つぎの さん を みつけて！',
    ],
    correctAnswer: '3',
    correctKind: 'number',
    distractors: [
      { label: '1', kind: 'number' },
      { label: '2', kind: 'number' },
      { label: '5', kind: 'number' },
      { label: '8', kind: 'number' },
    ],
    rounds: 8,
    targetsPerRound: 5,
    reward: 1,
    difficulty: 2,
  },
  {
    id: 'math-add-1', // 内部キーは変更しない（保存済み進捗を壊さないため）
    title: 'さんすうバトル',
    type: 'math',
    mode: 'math',
    renderer: '2.5d', // 画面仕様はひらがなこうえんと共通（差分は出題内容だけ）
    unlock: { stageId: 'word-neko', minLevel: 1 }, // number-3 非表示のため付け替え
    recommendedAgeMin: 5,
    recommendedAgeMax: 6,
    missionText: 'こたえの ゲートを ビームで えらぼう！',
    voicePrompts: [],
    battle: {
      enemyCount: 3,
      purifyStepsPerEnemy: 1, // 実際の回数は data/monsters.ts の purifySteps テーブルで決まる
      bossPurifySteps: 3,
      choiceCount: 3, // math の選択肢は問題の choices（3つ）
      rideDistance: 50,
      letterPool: [], // math では未使用（mathLevels から生成）
      poolStart: 0,
    },
    // 難易度別のランダム出題パラメータ（problems より優先。生成は GameScene）
    mathLevels: {
      1: { ops: ['+'], maxAnswer: 5 },
      2: { ops: ['+'], maxAnswer: 9 },
      3: { ops: ['+', '-'], maxAnswer: 9 },
    },
    correctKind: 'number',
    distractors: [],
    problems: [
      { question: '1+1', voicePrompt: 'いち たす いち は？', answer: '2', choices: ['1', '2', '3'] },
      { question: '2+1', voicePrompt: 'に たす いち は？', answer: '3', choices: ['2', '3', '4'] },
      { question: '1+2', voicePrompt: 'いち たす に は？', answer: '3', choices: ['3', '4', '1'] },
      { question: '2+2', voicePrompt: 'に たす に は？', answer: '4', choices: ['2', '3', '4'] },
      { question: '3+1', voicePrompt: 'さん たす いち は？', answer: '4', choices: ['4', '5', '3'] },
      { question: '3+2', voicePrompt: 'さん たす に は？', answer: '5', choices: ['4', '5', '2'] },
    ],
    rounds: 6,
    targetsPerRound: 3,
    reward: 1,
    difficulty: 3,
  },
]

/** 指定ステージの次のステージ（最後なら null） */
export function nextStageOf(stageId: string): Stage | null {
  const index = STAGES.findIndex(s => s.id === stageId)
  if (index < 0 || index + 1 >= STAGES.length) return null
  return STAGES[index + 1]
}

export const HEROES: Hero[] = [
  { id: 'red', name: 'あかレンジャー', color: 0xff4d4d, beamType: 'spark', specialMove: 'スターバースト', unlocked: true, frameIndex: 0 },
  { id: 'blue', name: 'あおレンジャー', color: 0x3da9ff, beamType: 'ice', specialMove: 'こおりのきらめき', unlocked: false, frameIndex: 1 },
  { id: 'pink', name: 'ももレンジャー', color: 0xff6bb5, beamType: 'flower', specialMove: 'はなふぶき', unlocked: false, frameIndex: 2 },
  { id: 'green', name: 'みどレンジャー', color: 0x4ccb5a, beamType: 'leaf', specialMove: 'はっぱシュート', unlocked: false, frameIndex: 3 },
  { id: 'yellow', name: 'きいロレンジャー', color: 0xffc93d, beamType: 'thunder', specialMove: 'かみなりフラッシュ', unlocked: false, frameIndex: 4 },
]
