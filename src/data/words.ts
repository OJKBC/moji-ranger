import type { DifficultyLevel } from '../types'

/**
 * もじもじアトラクション（sequence モード）の単語プール。
 * 単語を増やすときは、この配列に1行追加するだけでよい。
 * 難易度は文字数で決まる: 難易度1=2文字 / 難易度2=3文字 / 難易度3=4文字。
 */
export interface WordSpec {
  word: string
  /** 完成演出に使う絵文字 */
  celebration: string
}

export const WORDS: WordSpec[] = [
  // 2文字（難易度1）
  { word: 'ねこ', celebration: '🐱' },
  { word: 'いぬ', celebration: '🐶' },
  { word: 'ぞう', celebration: '🐘' },
  { word: 'しか', celebration: '🦌' },
  { word: 'うま', celebration: '🐴' },
  // 3文字（難易度2）
  { word: 'りんご', celebration: '🍎' },
  { word: 'みかん', celebration: '🍊' },
  { word: 'すいか', celebration: '🍉' },
  { word: 'さかな', celebration: '🐟' },
  { word: 'うさぎ', celebration: '🐰' },
  // 4文字（難易度3）
  { word: 'くだもの', celebration: '🍇' },
  { word: 'ひまわり', celebration: '🌻' },
  { word: 'にわとり', celebration: '🐔' },
  { word: 'かまきり', celebration: '🦗' },
]

/** 難易度に応じた文字数の単語だけを返す */
export function wordsForLevel(level: DifficultyLevel): WordSpec[] {
  const length = level + 1 // 難易度1=2文字, 2=3文字, 3=4文字
  return WORDS.filter(w => [...w.word].length === length)
}
