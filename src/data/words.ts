import type { DifficultyLevel } from '../types'

/**
 * もじもじアトラクション（sequence モード）の単語プール。
 * 単語を増やすときは、この配列に1行追加するだけでよい。
 * 難易度は文字数で決まる: 1=2文字 / 2=3文字 / 3=4文字 / 4=5文字 / 5=6文字。
 * ※ もじもじは1文字ずつ順に撃つため、拗音・促音（ゃゅょっ）を含まない語だけにする。
 */
export interface WordSpec {
  word: string
  /** 完成演出に使う絵文字 */
  celebration: string
}

export const WORDS: WordSpec[] = [
  // 2文字（難易度1）＝幼児に身近な動物・もの
  { word: 'ねこ', celebration: '🐱' },
  { word: 'いぬ', celebration: '🐶' },
  { word: 'うま', celebration: '🐴' },
  { word: 'しか', celebration: '🦌' },
  { word: 'ぞう', celebration: '🐘' },
  { word: 'とり', celebration: '🐦' },
  { word: 'くま', celebration: '🐻' },
  { word: 'さる', celebration: '🐵' },
  { word: 'うし', celebration: '🐮' },
  { word: 'ぶた', celebration: '🐷' },
  { word: 'たこ', celebration: '🐙' },
  { word: 'かに', celebration: '🦀' },
  { word: 'かめ', celebration: '🐢' },
  { word: 'へび', celebration: '🐍' },
  { word: 'はち', celebration: '🐝' },
  { word: 'あり', celebration: '🐜' },
  { word: 'ふね', celebration: '⛵' },
  { word: 'くつ', celebration: '👟' },
  { word: 'はな', celebration: '🌸' },
  { word: 'つき', celebration: '🌙' },
  // 3文字（難易度2）＝動物・くだもの・のりもの・身近なもの
  { word: 'りんご', celebration: '🍎' },
  { word: 'みかん', celebration: '🍊' },
  { word: 'すいか', celebration: '🍉' },
  { word: 'さかな', celebration: '🐟' },
  { word: 'うさぎ', celebration: '🐰' },
  { word: 'ばなな', celebration: '🍌' },
  { word: 'きりん', celebration: '🦒' },
  { word: 'ぱんだ', celebration: '🐼' },
  { word: 'こあら', celebration: '🐨' },
  { word: 'いちご', celebration: '🍓' },
  { word: 'めろん', celebration: '🍈' },
  { word: 'れもん', celebration: '🍋' },
  { word: 'ぶどう', celebration: '🍇' },
  { word: 'くるま', celebration: '🚗' },
  { word: 'かえる', celebration: '🐸' },
  { word: 'ひよこ', celebration: '🐤' },
  { word: 'たまご', celebration: '🥚' },
  { word: 'とけい', celebration: '🕐' },
  { word: 'たいこ', celebration: '🥁' },
  { word: 'こおり', celebration: '🧊' },
  // 4文字（難易度3）＝身近な野菜・生き物・のりもの・食べもの
  { word: 'くだもの', celebration: '🍇' },
  { word: 'ひまわり', celebration: '🌻' },
  { word: 'にわとり', celebration: '🐔' },
  { word: 'かまきり', celebration: '🦗' },
  { word: 'たまねぎ', celebration: '🧅' },
  { word: 'にんじん', celebration: '🥕' },
  { word: 'だいこん', celebration: '🥬' },
  { word: 'こうもり', celebration: '🦇' },
  { word: 'のりもの', celebration: '🚙' },
  { word: 'どうぶつ', celebration: '🐾' },
  { word: 'たべもの', celebration: '🍱' },
  { word: 'ふうせん', celebration: '🎈' },
  { word: 'くつした', celebration: '🧦' },
  { word: 'たいよう', celebration: '☀️' },
  { word: 'おにぎり', celebration: '🍙' },
  { word: 'たいやき', celebration: '🐟' },
  // 5文字（難易度4）＝身近な生き物・あいさつ・もの（拗促音なし）
  { word: 'だんごむし', celebration: '🐛' },
  { word: 'かたつむり', celebration: '🐌' },
  { word: 'かぶとむし', celebration: '🪲' },
  { word: 'こいのぼり', celebration: '🎏' },
  { word: 'さくらんぼ', celebration: '🍒' },
  { word: 'ぬいぐるみ', celebration: '🧸' },
  { word: 'すべりだい', celebration: '🛝' },
  { word: 'ありがとう', celebration: '😊' },
  { word: 'こんにちは', celebration: '👋' },
  { word: 'おかあさん', celebration: '👩' },
  { word: 'おとうさん', celebration: '👨' },
  { word: 'たからもの', celebration: '💎' },
  { word: 'れいぞうこ', celebration: '🧊' },
  { word: 'みずたまり', celebration: '💧' },
  { word: 'せんぷうき', celebration: '🌀' },
  // 6文字（難易度5）＝身近な生き物・のりもの・おみせ（拗促音なし）
  { word: 'とうもろこし', celebration: '🌽' },
  { word: 'しんかんせん', celebration: '🚄' },
  { word: 'てんとうむし', celebration: '🐞' },
  { word: 'くわがたむし', celebration: '🪲' },
  { word: 'どうぶつえん', celebration: '🦁' },
  { word: 'すいぞくかん', celebration: '🐬' },
  { word: 'おかしやさん', celebration: '🍬' },
  { word: 'さかなやさん', celebration: '🐟' },
  { word: 'おはなやさん', celebration: '💐' },
  { word: 'けいさつかん', celebration: '👮' },
  { word: 'おまわりさん', celebration: '🚓' },
  { word: 'たからさがし', celebration: '🗺️' },
]

/** 難易度に応じた文字数の単語だけを返す */
export function wordsForLevel(level: DifficultyLevel): WordSpec[] {
  const length = level + 1 // 難易度1=2文字, 2=3文字, 3=4文字
  return WORDS.filter(w => [...w.word].length === length)
}
