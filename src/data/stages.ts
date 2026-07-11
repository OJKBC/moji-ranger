import type { Hero, Stage, StageCategory } from '../types'
import { HIRAGANA_POOL, KATAKANA_POOL } from './kana'

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
      // 清音46＋濁音＋半濁音＋小さい文字を「習わせたい順」で（src/data/kana.ts に集約）。
      // 習得（correct2回以上）と難易度（difficulty.ts の poolBonus）に応じて先頭から開放:
      // 清音46=難易度3で全部 / 濁音・半濁音=難易度4 / 小さい文字=難易度5。
      letterPool: HIRAGANA_POOL,
      poolStart: 12, // ㉟ 1プレイで開く字を広げ、同じ字ばかりにならないように
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
    // ステージ自体はロックしない（最初から選べる）。難易度1→2→3のゲートは各ステージ内で維持
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
      // カタカナ清音46＋濁音＋半濁音＋小さい文字/長音（src/data/kana.ts に集約）。
      // 紛らわしい定番（シ/ツ・ソ/ン・ク/ワ）も含む。開放順はひらがなと同じ設計。
      letterPool: KATAKANA_POOL,
      poolStart: 12, // ㉟ 1プレイで開く字を広げ、同じ字ばかりにならないように
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
    id: 'math-add-1', // 内部キーは変更しない（＝「たしざん」に改名しても既存クリア進捗を引き継ぐ）
    title: 'たしざんバトル',
    type: 'math',
    mode: 'math',
    renderer: '2.5d', // 画面仕様はひらがなこうえんと共通（差分は出題内容だけ）
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
    // たしざん専用（＋のみ）。小さい数から始めて上の難易度ほど数の範囲を広げる。
    // 答えが10を超えると自然にくり上がりが入る（maxAnswer で調整）。
    mathLevels: {
      1: { ops: ['+'], maxAnswer: 6 },
      2: { ops: ['+'], maxAnswer: 9 },
      3: { ops: ['+'], maxAnswer: 12 }, // ここから10超え＝くり上がり
      4: { ops: ['+'], maxAnswer: 14 },
      5: { ops: ['+'], maxAnswer: 16 },
      6: { ops: ['+'], maxAnswer: 18 },
      7: { ops: ['+'], maxAnswer: 20 },
    },
    correctKind: 'number',
    distractors: [],
    problems: [
      { question: '1+1', voicePrompt: 'いち たす いち、いくつ？', answer: '2', choices: ['1', '2', '3'] },
      { question: '2+1', voicePrompt: 'に たす いち、いくつ？', answer: '3', choices: ['2', '3', '4'] },
      { question: '3+2', voicePrompt: 'さん たす に、いくつ？', answer: '5', choices: ['4', '5', '2'] },
    ],
    rounds: 6,
    targetsPerRound: 3,
    reward: 1,
    difficulty: 3,
  },
  {
    id: 'math-sub-1', // 新規ステージ（ひきざん）。新IDなのでクリア進捗は0から。
    title: 'ひきざんバトル',
    type: 'math',
    mode: 'math',
    renderer: '2.5d',
    recommendedAgeMin: 5,
    recommendedAgeMax: 6,
    missionText: 'こたえの ゲートを ビームで えらぼう！',
    voicePrompts: [],
    battle: {
      enemyCount: 3,
      purifyStepsPerEnemy: 1,
      bossPurifySteps: 3,
      choiceCount: 3,
      rideDistance: 50,
      letterPool: [],
      poolStart: 0,
    },
    // ひきざん専用（−のみ）。答えは必ず1以上（生成側で b<a を保証）。
    // 上の難易度ほど数の範囲を広げ、10超えの数からのひき算＝くり下がりが入る。
    mathLevels: {
      1: { ops: ['-'], maxAnswer: 6 },
      2: { ops: ['-'], maxAnswer: 8 },
      3: { ops: ['-'], maxAnswer: 10 },
      4: { ops: ['-'], maxAnswer: 12 }, // ここから10超え＝くり下がり
      5: { ops: ['-'], maxAnswer: 14 },
      6: { ops: ['-'], maxAnswer: 16 },
      7: { ops: ['-'], maxAnswer: 18 },
    },
    correctKind: 'number',
    distractors: [],
    problems: [
      { question: '2-1', voicePrompt: 'に ひく いち、いくつ？', answer: '1', choices: ['1', '2', '3'] },
      { question: '3-1', voicePrompt: 'さん ひく いち、いくつ？', answer: '2', choices: ['2', '3', '1'] },
      { question: '5-2', voicePrompt: 'ご ひく に、いくつ？', answer: '3', choices: ['3', '4', '2'] },
    ],
    rounds: 6,
    targetsPerRound: 3,
    reward: 1,
    difficulty: 3,
  },
  // ---- 英語ステージ（㉔・マップ最後・さんすうのあと。最初から選択可・各ステージ内は難易度1→2→3）----
  {
    id: 'english-abc',
    title: 'えいご abc',
    type: 'english',
    mode: 'find', // 共通エンジン（find）を使う。出題内容は enMode で切替
    enMode: 'letter',
    renderer: '2.5d',
    recommendedAgeMin: 4,
    recommendedAgeMax: 6,
    missionText: 'きこえた アルファベットを ねらおう！',
    voicePrompts: [],
    correctKind: 'english',
    distractors: [],
    battle: {
      enemyCount: 3,
      purifyStepsPerEnemy: 1,
      bossPurifySteps: 3,
      choiceCount: 4,
      rideDistance: 50,
      letterPool: [], // english は data/english.ts から出題（このプールは未使用）
      poolStart: 0,
    },
    rounds: 6,
    targetsPerRound: 4,
    reward: 1,
    difficulty: 1,
  },
  {
    id: 'english-words',
    title: 'えいご words',
    type: 'english',
    mode: 'find',
    enMode: 'spell',
    renderer: '2.5d',
    recommendedAgeMin: 5,
    recommendedAgeMax: 6,
    missionText: 'ただしい スペルを えらぼう！',
    voicePrompts: [],
    correctKind: 'english',
    distractors: [],
    battle: {
      enemyCount: 3,
      purifyStepsPerEnemy: 1,
      bossPurifySteps: 3,
      choiceCount: 4,
      rideDistance: 50,
      letterPool: [],
      poolStart: 0,
    },
    rounds: 6,
    targetsPerRound: 4,
    reward: 1,
    difficulty: 1,
  },
  {
    id: 'english-meaning',
    title: 'えいご meaning',
    type: 'english',
    mode: 'find',
    enMode: 'meaning',
    renderer: '2.5d',
    recommendedAgeMin: 5,
    recommendedAgeMax: 6,
    missionText: 'えいごの いみを えらぼう！',
    voicePrompts: [],
    correctKind: 'hiragana', // バブルは意味（ひらがな）
    distractors: [],
    battle: {
      enemyCount: 3,
      purifyStepsPerEnemy: 1,
      bossPurifySteps: 3,
      choiceCount: 4,
      rideDistance: 50,
      letterPool: [],
      poolStart: 0,
    },
    rounds: 6,
    targetsPerRound: 4,
    reward: 1,
    difficulty: 1,
  },
]

/** ㊺ ステージの大枠カテゴリ（明示指定が無ければ type から推定） */
export function categoryOf(stage: Stage): StageCategory {
  if (stage.category) return stage.category
  if (stage.type === 'english') return 'en'
  if (stage.type === 'math' || stage.type === 'number') return 'math'
  return 'jp' // hiragana / katakana（もじもじ含む）
}

/** カテゴリの並び順 */
export const CATEGORY_ORDER: StageCategory[] = ['jp', 'en', 'math']

/** ㊺ カテゴリの見た目・読み上げ（読めない子にも絵＋色＋音で伝わるように） */
export const CATEGORY_META: Record<StageCategory, { label: string; icon: string; color: string; voice: string }> = {
  jp: { label: 'にほんご', icon: 'あ', color: '#ff7aa2', voice: 'にほんご' },
  en: { label: 'えいご', icon: 'A', color: '#4db2ff', voice: 'えいご' },
  math: { label: 'さんすう', icon: '123', color: '#4ccb5a', voice: 'さんすう' },
}

/** そのカテゴリに属する（非表示でない）ステージ一覧 */
export function stagesInCategory(category: StageCategory): Stage[] {
  return STAGES.filter(s => !s.hidden && categoryOf(s) === category)
}

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
