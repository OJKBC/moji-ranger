import type { Hero, Stage } from '../types'

/**
 * ステージデータ集約ファイル。
 * ステージを増やすときは、この配列にオブジェクトを1件追加するだけでよい。
 */
export const STAGES: Stage[] = [
  {
    id: 'hiragana-a',
    title: '「あ」をさがせ！',
    type: 'hiragana',
    recommendedAgeMin: 4,
    recommendedAgeMax: 6,
    missionText: '「あ」を さがして ビーム！',
    voicePrompts: [
      'あ を さがして、ビーム！',
      'あ は どこかな？',
      'つぎの あ を みつけて！',
    ],
    correctAnswer: 'あ',
    correctKind: 'hiragana',
    distractors: [
      { label: 'お', kind: 'hiragana' },
      { label: 'め', kind: 'hiragana' },
      { label: 'ア', kind: 'katakana' },
      { label: '3', kind: 'number' },
    ],
    rounds: 8,
    targetsPerRound: 5,
    reward: 1,
    difficulty: 1,
  },
]

export const HEROES: Hero[] = [
  { id: 'red', name: 'あかレンジャー', color: 0xff4d4d, beamType: 'spark', specialMove: 'スターバースト', unlocked: true, frameIndex: 0 },
  { id: 'blue', name: 'あおレンジャー', color: 0x3da9ff, beamType: 'ice', specialMove: 'こおりのきらめき', unlocked: false, frameIndex: 1 },
  { id: 'pink', name: 'ももレンジャー', color: 0xff6bb5, beamType: 'flower', specialMove: 'はなふぶき', unlocked: false, frameIndex: 2 },
  { id: 'green', name: 'みどレンジャー', color: 0x4ccb5a, beamType: 'leaf', specialMove: 'はっぱシュート', unlocked: false, frameIndex: 3 },
  { id: 'yellow', name: 'きいロレンジャー', color: 0xffc93d, beamType: 'thunder', specialMove: 'かみなりフラッシュ', unlocked: false, frameIndex: 4 },
]
