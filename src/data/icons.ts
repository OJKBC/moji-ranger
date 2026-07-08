import { WORDS } from './words'
import { MEANING_WORDS } from './english'

/**
 * ことばアイコン（絵）のマニフェスト（㊱㊲㊶）。
 * 「概念（英単語 / ひらがなのことば・意味）」→ 絵文字 の対応表。
 *
 * 使いどころ:
 *  - ㊲ 出題中の補助アイコン（abc の例単語・words のスペル対象語）＝答えの「文字」は出さず絵だけ。
 *  - ㊶ 正解後の演出（ひらがな/英語/意味など、対応する絵があれば表示）。
 *
 * 方針: 4〜6歳が絵で分かる身近な名詞・色だけ。抽象語（run/was/happy 等）は入れない
 *       ＝アイコンが無いものは「出さない」。1行足すだけで増やせる（差し替え・追加が容易）。
 */

/** 英単語（小文字）→ 絵文字。abc例単語・spell・meaning の名詞と色をカバー */
export const EN_WORD_ICON: Record<string, string> = {
  // ABC 例単語
  apple: '🍎', ball: '⚽', cat: '🐱', dog: '🐶', egg: '🥚', fish: '🐟',
  grapes: '🍇', hat: '👒', ice: '🍦', juice: '🧃', kite: '🪁', lion: '🦁',
  mouse: '🐭', nest: '🪺', orange: '🍊', pig: '🐷', queen: '👑', rabbit: '🐰',
  sun: '☀️', tiger: '🐯', umbrella: '☂️', van: '🚐', watermelon: '🍉',
  fox: '🦊', yoyo: '🪀', zebra: '🦓',
  // spell / meaning の名詞
  cup: '🥤', bus: '🚌', box: '📦', bed: '🛏️', cow: '🐮', pen: '🖊️', net: '🥅',
  milk: '🥛', star: '⭐', frog: '🐸', cake: '🍰', bird: '🐦', duck: '🦆',
  bear: '🐻', tree: '🌳', book: '📖', moon: '🌙', ship: '🚢', goat: '🐐',
  water: '💧', house: '🏠', candy: '🍬', train: '🚆', horse: '🐴', sheep: '🐑',
  panda: '🐼', lemon: '🍋', grape: '🍇', bread: '🍞', monkey: '🐒', flower: '🌸',
  pencil: '✏️', banana: '🍌', garden: '🏡', window: '🪟', basket: '🧺',
  rocket: '🚀', rainbow: '🌈', penguin: '🐧', dolphin: '🐬', giraffe: '🦒',
  cupcake: '🧁', balloon: '🎈', popcorn: '🍿', octopus: '🐙', pumpkin: '🎃',
  peach: '🍑', melon: '🍈', car: '🚗', boat: '⛵', plane: '✈️', snow: '❄️',
  bike: '🚲', cloud: '☁️', rice: '🍚', cherry: '🍒', rain: '🌧️', soup: '🍲',
  bat: '🦇', map: '🗺️', bee: '🐝', robot: '🤖', cheese: '🧀', dragon: '🐉',
  guitar: '🎸', unicorn: '🦄', cricket: '🦗', ketchup: '🍅',
  // 色（色つきの丸）
  red: '🔴', blue: '🔵', green: '🟢', yellow: '🟡', black: '⚫', white: '⚪',
  pink: '🩷', brown: '🟤', purple: '🟣',
}

/**
 * ひらがなの「ことば・意味」→ 絵文字。
 * もじもじ単語（words.ts の celebration）と、english meaning の意味（英単語アイコンから引継ぎ）を統合。
 */
const jaMap: Record<string, string> = {}
for (const w of WORDS) jaMap[w.word] = w.celebration
for (const list of Object.values(MEANING_WORDS)) {
  for (const m of list) {
    const ic = EN_WORD_ICON[m.word.toLowerCase()]
    if (ic && !jaMap[m.meaning]) jaMap[m.meaning] = ic
  }
}
export const JA_WORD_ICON: Record<string, string> = jaMap

/** 英単語のアイコン（無ければ null） */
export function iconForEnglishWord(word: string): string | null {
  return EN_WORD_ICON[word.toLowerCase()] ?? null
}

/** ひらがなのことば・意味のアイコン（無ければ null） */
export function iconForJaWord(word: string): string | null {
  return JA_WORD_ICON[word] ?? null
}
