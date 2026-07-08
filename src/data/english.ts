import type { DifficultyLevel } from '../types'

/**
 * 英語ステージ（abc / words / meaning）の出題データ。
 * 単語・アルファベット・意味はすべてここで定義し、1行足すだけで増やせる。
 * 読み上げは音声モジュール（voice.speakEn）経由で、将来は録音した英語音声にも差し替えられる。
 */

// ============================================================ ① abc（アルファベット認識）

/**
 * 難易度別の対象アルファベット。
 * 1=小文字 / 2=大文字 / 3=小文字＋大文字の混在。
 */
export function abcLetters(level: DifficultyLevel): string[] {
  const lower = 'abcdefghijklmnopqrstuvwxyz'.split('')
  const upper = lower.map(c => c.toUpperCase())
  if (level === 1) return lower
  if (level === 2) return upper
  return [...lower, ...upper]
}

/**
 * 形が紛らわしいアルファベット（選択肢に優先して混ぜる）。
 * b/d・p/q・大文字小文字の対応など、難易度2以降の識別練習に使う。
 */
export const ABC_CONFUSABLES: Record<string, string[]> = {
  a: ['e', 'o', 'c'], b: ['d', 'p', 'h'], c: ['e', 'o', 'a'], d: ['b', 'q', 'p'],
  e: ['a', 'c', 'o'], f: ['t', 'e', 'l'], g: ['q', 'y', 'j'], h: ['n', 'b', 'k'],
  i: ['l', 'j', 't'], j: ['i', 'g', 'y'], k: ['x', 'h', 'r'], l: ['i', 't', 'j'],
  m: ['n', 'w', 'h'], n: ['m', 'h', 'r'], o: ['c', 'a', 'e'], p: ['q', 'b', 'd'],
  q: ['p', 'g', 'd'], r: ['n', 'k', 'v'], s: ['z', 'c', 'e'], t: ['f', 'l', 'i'],
  u: ['v', 'n', 'w'], v: ['u', 'w', 'y'], w: ['m', 'v', 'u'], x: ['k', 'y', 'z'],
  y: ['v', 'g', 'j'], z: ['s', 'n', 'x'],
  A: ['E', 'H', 'R'], B: ['D', 'P', 'R'], C: ['G', 'O', 'Q'], D: ['B', 'O', 'P'],
  E: ['F', 'B', 'L'], F: ['E', 'P', 'T'], G: ['C', 'O', 'Q'], H: ['N', 'M', 'K'],
  I: ['J', 'L', 'T'], J: ['I', 'L', 'U'], K: ['R', 'X', 'H'], L: ['I', 'T', 'E'],
  M: ['N', 'W', 'H'], N: ['M', 'H', 'K'], O: ['Q', 'C', 'G'], P: ['R', 'B', 'F'],
  Q: ['O', 'G', 'C'], R: ['P', 'B', 'K'], S: ['Z', 'C', 'G'], T: ['I', 'F', 'L'],
  U: ['V', 'Y', 'J'], V: ['U', 'W', 'Y'], W: ['M', 'V', 'U'], X: ['K', 'Y', 'Z'],
  Y: ['V', 'X', 'T'], Z: ['S', 'N', 'X'],
}

// ============================================================ ② words（スペル選択）

export interface SpellSpec {
  /** 正しいスペル（バブルにも表示・読み上げる単語） */
  word: string
  /** 惜しい誤答スペル（人手で用意して品質を担保。多いほど選択肢を増やせる） */
  wrong: string[]
}

/**
 * 難易度別のスペル問題（1=3文字 / 2=4文字 / 3=5文字）。
 * 誤答は「音は近いが綴りが違う」惜しい間違いを人手で用意する（自動生成しない）。
 */
export const SPELL_WORDS: Record<DifficultyLevel, SpellSpec[]> = {
  1: [
    { word: 'dog', wrong: ['dig', 'dag', 'bog', 'dok'] },
    { word: 'cat', wrong: ['cet', 'kat', 'cot', 'cad'] },
    { word: 'run', wrong: ['ran', 'ron', 'rum', 'nun'] },
    { word: 'was', wrong: ['woz', 'waz', 'wus', 'wos'] },
    { word: 'sun', wrong: ['son', 'san', 'sen', 'sum'] },
    { word: 'red', wrong: ['rad', 'rid', 'wed', 'ret'] },
    { word: 'big', wrong: ['bag', 'beg', 'bik', 'pig'] },
    { word: 'cup', wrong: ['cap', 'kup', 'cub', 'cop'] },
  ],
  2: [
    { word: 'fish', wrong: ['fsh', 'fich', 'fesh', 'fush'] },
    { word: 'blue', wrong: ['bloo', 'blu', 'bule', 'blew'] },
    { word: 'jump', wrong: ['jamp', 'gump', 'jum', 'jomp'] },
    { word: 'milk', wrong: ['melk', 'mikl', 'milc', 'muk'] },
    { word: 'star', wrong: ['ster', 'sdar', 'tar', 'stur'] },
    { word: 'frog', wrong: ['frag', 'flog', 'frok', 'freg'] },
    { word: 'cake', wrong: ['keik', 'cak', 'kake', 'caek'] },
    { word: 'bird', wrong: ['berd', 'brid', 'burd', 'bied'] },
  ],
  3: [
    { word: 'apple', wrong: ['appl', 'appel', 'aple', 'appol'] },
    { word: 'green', wrong: ['grean', 'gren', 'grin', 'grein'] },
    { word: 'happy', wrong: ['hapy', 'happi', 'hoppy', 'hapyy'] },
    { word: 'water', wrong: ['wader', 'watre', 'wotter', 'watar'] },
    { word: 'tiger', wrong: ['tigar', 'tigger', 'tyger', 'tiber'] },
    { word: 'house', wrong: ['hous', 'howse', 'hause', 'houce'] },
    { word: 'candy', wrong: ['candi', 'kandy', 'cendy', 'cande'] },
    { word: 'train', wrong: ['tran', 'trane', 'trian', 'trein'] },
  ],
}

// ============================================================ ③ meaning（英語→意味）

export interface MeaningSpec {
  /** 英語（読み上げる単語） */
  word: string
  /** 意味（ひらがな。バブルに出す・正解時に読み上げる） */
  meaning: string
  /** ジャンル（誤答を同じジャンルで揃えるための分類） */
  genre: string
}

/**
 * 難易度別の英語→意味（名詞のみ）。
 * 誤答は同じ genre から選ぶ（ランダムな無関係語にしない＝歯ごたえと学習効果）。
 * 難易度が上がるほど語が増え、選択肢も増える。
 */
export const MEANING_WORDS: Record<DifficultyLevel, MeaningSpec[]> = {
  1: [
    { word: 'cat', meaning: 'ねこ', genre: 'animal' },
    { word: 'dog', meaning: 'いぬ', genre: 'animal' },
    { word: 'fish', meaning: 'さかな', genre: 'animal' },
    { word: 'apple', meaning: 'りんご', genre: 'fruit' },
    { word: 'banana', meaning: 'ばなな', genre: 'fruit' },
    { word: 'orange', meaning: 'みかん', genre: 'fruit' },
  ],
  2: [
    { word: 'cat', meaning: 'ねこ', genre: 'animal' },
    { word: 'dog', meaning: 'いぬ', genre: 'animal' },
    { word: 'bird', meaning: 'とり', genre: 'animal' },
    { word: 'bear', meaning: 'くま', genre: 'animal' },
    { word: 'apple', meaning: 'りんご', genre: 'fruit' },
    { word: 'grape', meaning: 'ぶどう', genre: 'fruit' },
    { word: 'lemon', meaning: 'れもん', genre: 'fruit' },
    { word: 'red', meaning: 'あか', genre: 'color' },
    { word: 'blue', meaning: 'あお', genre: 'color' },
    { word: 'green', meaning: 'みどり', genre: 'color' },
  ],
  3: [
    { word: 'cat', meaning: 'ねこ', genre: 'animal' },
    { word: 'dog', meaning: 'いぬ', genre: 'animal' },
    { word: 'bird', meaning: 'とり', genre: 'animal' },
    { word: 'bear', meaning: 'くま', genre: 'animal' },
    { word: 'lion', meaning: 'らいおん', genre: 'animal' },
    { word: 'apple', meaning: 'りんご', genre: 'fruit' },
    { word: 'grape', meaning: 'ぶどう', genre: 'fruit' },
    { word: 'lemon', meaning: 'れもん', genre: 'fruit' },
    { word: 'peach', meaning: 'もも', genre: 'fruit' },
    { word: 'star', meaning: 'ほし', genre: 'nature' },
    { word: 'moon', meaning: 'つき', genre: 'nature' },
    { word: 'sun', meaning: 'たいよう', genre: 'nature' },
    { word: 'tree', meaning: 'き', genre: 'nature' },
  ],
}

/** その難易度の meaning 問題から、同じ genre の別の意味を誤答候補として集める */
export function meaningDistractors(spec: MeaningSpec, level: DifficultyLevel, count: number): string[] {
  const sameGenre = MEANING_WORDS[level]
    .filter(m => m.genre === spec.genre && m.meaning !== spec.meaning)
    .map(m => m.meaning)
  const uniq = [...new Set(sameGenre)]
  // 同ジャンルが足りなければ、他ジャンルからも補う（それでも意味語なので学習を邪魔しない）
  if (uniq.length < count) {
    const others = [...new Set(MEANING_WORDS[level].map(m => m.meaning))]
      .filter(m => m !== spec.meaning && !uniq.includes(m))
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[others[i], others[j]] = [others[j], others[i]]
    }
    uniq.push(...others)
  }
  for (let i = uniq.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[uniq[i], uniq[j]] = [uniq[j], uniq[i]]
  }
  return uniq.slice(0, count)
}

/** meaning の全ひらがな意味（音声クリップ生成の同期用に列挙） */
export const ALL_MEANINGS: string[] = [
  ...new Set(Object.values(MEANING_WORDS).flat().map(m => m.meaning)),
]

/** 英語の読み上げに使う全トークン（アルファベット＋単語）。generate-voice.mjs と同期 */
export const ALL_EN_TOKENS: string[] = [
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  ...new Set(Object.values(SPELL_WORDS).flat().map(s => s.word)),
  ...new Set(Object.values(MEANING_WORDS).flat().map(m => m.word)),
]
