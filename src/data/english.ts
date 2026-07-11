import type { DifficultyLevel } from '../types'

/**
 * 英語ステージ（abc / words / meaning）の出題データ。
 * 単語・アルファベット・意味はすべてここで定義し、1行足すだけで増やせる。
 * 読み上げは音声モジュール（voice.speakEn）経由で、将来は録音した英語音声にも差し替えられる。
 */

// ============================================================ ① abc（アルファベット認識）

/**
 * 難易度別の対象アルファベット。
 * 1=小文字 / 2=大文字 / 3〜5=小文字＋大文字の混在（上の難易度ほど紛らわしい形を多めに＝
 * 選択肢生成側の maxConfusables で調整）。混在でも「同じ文字の大小」は同一問題に出さない（㉙）。
 */
export function abcLetters(level: DifficultyLevel): string[] {
  const lower = 'abcdefghijklmnopqrstuvwxyz'.split('')
  const upper = lower.map(c => c.toUpperCase())
  if (level === 1) return lower
  if (level === 2) return upper
  return [...lower, ...upper]
}

/**
 * ㉚「A for Apple」方式の例単語。
 * 合成音声だと N/M・B/D・F/S などの単発音が聞き分けにくいため、読み上げは
 * 「レターネーム＋for＋例単語」にし、画面にも例単語（＋絵文字）を出して必ず区別できるようにする。
 * 4〜6歳が知っている身近な語。大文字も同じ例単語を使う（A も a も Apple）。あとから変更可。
 */
export interface AbcExample { word: string; emoji: string }
export const ABC_EXAMPLES: Record<string, AbcExample> = {
  a: { word: 'Apple', emoji: '🍎' }, b: { word: 'Ball', emoji: '⚽' },
  c: { word: 'Cat', emoji: '🐱' }, d: { word: 'Dog', emoji: '🐶' },
  e: { word: 'Egg', emoji: '🥚' }, f: { word: 'Fish', emoji: '🐟' },
  g: { word: 'Grapes', emoji: '🍇' }, h: { word: 'Hat', emoji: '👒' },
  i: { word: 'Ice', emoji: '🍦' }, j: { word: 'Juice', emoji: '🧃' },
  k: { word: 'Kite', emoji: '🪁' }, l: { word: 'Lion', emoji: '🦁' },
  m: { word: 'Mouse', emoji: '🐭' }, n: { word: 'Nest', emoji: '🪺' },
  o: { word: 'Orange', emoji: '🍊' }, p: { word: 'Pig', emoji: '🐷' },
  q: { word: 'Queen', emoji: '👑' }, r: { word: 'Rabbit', emoji: '🐰' },
  s: { word: 'Sun', emoji: '☀️' }, t: { word: 'Tiger', emoji: '🐯' },
  u: { word: 'Umbrella', emoji: '☂️' }, v: { word: 'Van', emoji: '🚐' },
  w: { word: 'Watermelon', emoji: '🍉' }, x: { word: 'Fox', emoji: '🦊' },
  y: { word: 'Yoyo', emoji: '🪀' }, z: { word: 'Zebra', emoji: '🦓' },
}

/** 例単語を返す（大文字でも小文字キーで引く） */
export function abcExample(letter: string): AbcExample {
  return ABC_EXAMPLES[letter.toLowerCase()] ?? { word: letter.toUpperCase(), emoji: '🔤' }
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
    { word: 'dog', wrong: ['dug', 'dawg', 'dgo', 'bog'] },
    { word: 'cat', wrong: ['cet', 'kat', 'cot', 'ct'] },
    { word: 'run', wrong: ['ran', 'ron', 'rum', 'nun'] },
    { word: 'was', wrong: ['woz', 'waz', 'wus', 'wos'] },
    { word: 'sun', wrong: ['san', 'sen', 'soon', 'sn'] },
    { word: 'red', wrong: ['rad', 'rid', 'redd', 'wed'] },
    { word: 'big', wrong: ['bge', 'beg', 'byg', 'bag'] },
    { word: 'cup', wrong: ['cap', 'kup', 'cip', 'cop'] },
    { word: 'pig', wrong: ['peg', 'pog', 'pyg', 'pgi'] },
    { word: 'bus', wrong: ['bas', 'buss', 'bos', 'bs'] },
    { word: 'hat', wrong: ['het', 'hut', 'hatt', 'ht'] },
    { word: 'box', wrong: ['baks', 'boks', 'bocks', 'boxx'] },
    { word: 'bed', wrong: ['bad', 'bidd', 'bde', 'ped'] },
    { word: 'cow', wrong: ['kow', 'caw', 'cou', 'coww'] },
    { word: 'egg', wrong: ['eg', 'egh', 'igg', 'eeg'] },
    { word: 'fox', wrong: ['foks', 'fax', 'foxx', 'vox'] },
    { word: 'pen', wrong: ['pan', 'pin', 'penn', 'pn'] },
    { word: 'net', wrong: ['nat', 'nit', 'nett', 'met'] },
    { word: 'bat', wrong: ['bet', 'bad', 'baht', 'vat'] },
    { word: 'map', wrong: ['mep', 'nap', 'mapp', 'maf'] },
    { word: 'bee', wrong: ['be', 'bea', 'bii', 'pee'] },
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
    { word: 'duck', wrong: ['dack', 'duk', 'dukk', 'dick'] },
    { word: 'bear', wrong: ['bare', 'ber', 'baer', 'beir'] },
    { word: 'tree', wrong: ['tri', 'tre', 'trea', 'twee'] },
    { word: 'ball', wrong: ['bal', 'bawl', 'boll', 'balll'] },
    { word: 'book', wrong: ['buk', 'boke', 'bok', 'booc'] },
    { word: 'moon', wrong: ['mun', 'moun', 'mone', 'moom'] },
    { word: 'ship', wrong: ['shp', 'shipp', 'sip', 'chip'] },
    { word: 'goat', wrong: ['gote', 'got', 'goet', 'goad'] },
    { word: 'lion', wrong: ['lain', 'leon', 'lyon', 'loin'] },
    { word: 'rain', wrong: ['ran', 'rane', 'rein', 'raen'] },
    { word: 'kite', wrong: ['kit', 'kaite', 'cite', 'kyte'] },
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
    { word: 'horse', wrong: ['hors', 'hoase', 'horce', 'haws'] },
    { word: 'mouse', wrong: ['mowse', 'mous', 'mouce', 'moose'] },
    { word: 'sheep', wrong: ['shep', 'sheap', 'sheeb', 'shheep'] },
    { word: 'zebra', wrong: ['zebre', 'zbra', 'zebar', 'sebra'] },
    { word: 'panda', wrong: ['panba', 'pnda', 'panta', 'banda'] },
    { word: 'lemon', wrong: ['lemin', 'lemmon', 'limon', 'lemun'] },
    { word: 'grape', wrong: ['grap', 'graip', 'grabe', 'grepe'] },
    { word: 'bread', wrong: ['bred', 'braid', 'bredd', 'braed'] },
    { word: 'robot', wrong: ['robat', 'robut', 'robbot', 'ropot'] },
    { word: 'plane', wrong: ['plaen', 'plein', 'plan', 'playne'] },
    { word: 'juice', wrong: ['juce', 'joos', 'juise', 'jooce'] },
  ],
  4: [
    { word: 'yellow', wrong: ['yelow', 'yello', 'jellow', 'yollow', 'yelloe'] },
    { word: 'orange', wrong: ['orenge', 'orang', 'oranje', 'ornge', 'orande'] },
    { word: 'monkey', wrong: ['munkey', 'monki', 'monky', 'mankey', 'monkky'] },
    { word: 'rabbit', wrong: ['rabit', 'rabbet', 'rebbit', 'rabbut', 'rabbot'] },
    { word: 'flower', wrong: ['flowar', 'flauer', 'flowe', 'flowor', 'floer'] },
    { word: 'pencil', wrong: ['pensil', 'pencl', 'pencal', 'pensel', 'pincil'] },
    { word: 'purple', wrong: ['purpel', 'purpl', 'perple', 'purpul', 'purbple'] },
    { word: 'banana', wrong: ['bananna', 'banan', 'banene', 'banaba', 'bnana'] },
    { word: 'garden', wrong: ['gardan', 'gaeden', 'gardn', 'gorden', 'gardin'] },
    { word: 'window', wrong: ['windo', 'windou', 'winbow', 'wandow', 'windw'] },
    { word: 'basket', wrong: ['basikt', 'baskit', 'baskt', 'bascket', 'bosket'] },
    { word: 'rocket', wrong: ['roket', 'rockt', 'rockit', 'rokcet', 'rocet'] },
    { word: 'cheese', wrong: ['chees', 'cheeze', 'chease', 'chesse', 'cheeese'] },
    { word: 'dragon', wrong: ['dragn', 'dragun', 'draggon', 'dragen', 'draogn'] },
    { word: 'guitar', wrong: ['gitar', 'guiter', 'guitor', 'gutar', 'guittar'] },
  ],
  5: [
    { word: 'rainbow', wrong: ['ranbow', 'rainbo', 'raimbow', 'rainbou', 'reinbow'] },
    { word: 'penguin', wrong: ['pengin', 'penquin', 'pengwin', 'penguen', 'pinguin'] },
    { word: 'dolphin', wrong: ['dolfin', 'dholphin', 'dolphn', 'dolpin', 'dolphen'] },
    { word: 'giraffe', wrong: ['girafe', 'jiraffe', 'giraff', 'giraffee', 'geraffe'] },
    { word: 'morning', wrong: ['moning', 'mornng', 'morninng', 'mourning', 'morneng'] },
    { word: 'kitchen', wrong: ['kichen', 'kitchn', 'kitchin', 'kittchen', 'ketchen'] },
    { word: 'blanket', wrong: ['blankt', 'blancket', 'blankit', 'blannket', 'blankeet'] },
    { word: 'cupcake', wrong: ['cupcak', 'cubcake', 'cupckae', 'cupcaek', 'cupcayk'] },
    { word: 'balloon', wrong: ['baloon', 'ballon', 'balloonn', 'baloon', 'balloun'] },
    { word: 'popcorn', wrong: ['popcon', 'popcrn', 'popkorn', 'popcorne', 'poppcorn'] },
    { word: 'octopus', wrong: ['octopos', 'octapus', 'octopuss', 'octpus', 'ocktopus'] },
    { word: 'pumpkin', wrong: ['pumkin', 'punpkin', 'pumpkn', 'pumpken', 'pumpkinn'] },
    { word: 'unicorn', wrong: ['unicon', 'unecorn', 'unicron', 'unnicorn', 'unicorne'] },
    { word: 'cricket', wrong: ['criket', 'crickt', 'crikcet', 'crickett', 'crikket'] },
    { word: 'ketchup', wrong: ['kechup', 'ketchp', 'ketchap', 'kettchup', 'ketchupp'] },
  ],
  6: [
    { word: 'elephant', wrong: ['elefant', 'eliphant', 'elephent', 'elphant', 'elephunt'] },
    { word: 'dinosaur', wrong: ['dinosor', 'dinasaur', 'dinosour', 'dynosaur', 'dinosaru'] },
    { word: 'umbrella', wrong: ['umberella', 'umbrela', 'umbrellla', 'unbrella', 'umbrellia'] },
    { word: 'airplane', wrong: ['airplan', 'airplaine', 'airplayn', 'areplane', 'airplene'] },
    { word: 'kangaroo', wrong: ['kangeroo', 'kangaru', 'kanaroo', 'kangoroo', 'kangarooo'] },
    { word: 'triangle', wrong: ['triangel', 'triangl', 'triangfle', 'treangle', 'triyangle'] },
    { word: 'football', wrong: ['footbal', 'futball', 'footballl', 'fottball', 'foootball'] },
    { word: 'starfish', wrong: ['starfsh', 'starfich', 'sterfish', 'starfishh', 'starfash'] },
    { word: 'hospital', wrong: ['hospitl', 'hospitel', 'hopsital', 'hospitial', 'hosbital'] },
    { word: 'scissors', wrong: ['sissors', 'scisors', 'scissers', 'scissorss', 'scizzors'] },
    { word: 'sandwich', wrong: ['sandwitch', 'sandwch', 'sanwich', 'samdwich', 'sandwhich'] },
    { word: 'squirrel', wrong: ['squirel', 'squirrl', 'squirrell', 'skwirrel', 'squrrel'] },
  ],
  7: [
    { word: 'butterfly', wrong: ['buterfly', 'butterflie', 'butterfy', 'buttterfly', 'buterflie'] },
    { word: 'crocodile', wrong: ['crocodil', 'crocadile', 'crocodyle', 'crokodile', 'crocodilee'] },
    { word: 'astronaut', wrong: ['astronot', 'astronut', 'astronautt', 'asteronaut', 'astranaut'] },
    { word: 'chocolate', wrong: ['choclate', 'chocolat', 'chocolete', 'choccolate', 'chocalate'] },
    { word: 'ambulance', wrong: ['ambulence', 'ambulanse', 'ambulanc', 'ambewlance', 'ambulancee'] },
    { word: 'pineapple', wrong: ['pineaple', 'pinapple', 'pineappel', 'pinneapple', 'pineaplle'] },
    { word: 'kangaroos', wrong: ['kangaroo', 'kangaros', 'kangeroos', 'kanaroos', 'kangarooss'] },
    { word: 'dandelion', wrong: ['dandilion', 'dandelien', 'dandeloin', 'dandalion', 'dandellion'] },
    { word: 'orangutan', wrong: ['orangutang', 'orangatan', 'orangutn', 'orangatang', 'oranguton'] },
    { word: 'raspberry', wrong: ['rasberry', 'raspbery', 'raspberrie', 'rasspberry', 'raspberyy'] },
    { word: 'centipede', wrong: ['sentipede', 'centipeed', 'centepede', 'centipde', 'centipedee'] },
    { word: 'crocodiles', wrong: ['crocodile', 'crocodils', 'crocadiles', 'crokodiles', 'crocodyles'] },
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
const MEAN_L1: MeaningSpec[] = [
  // 動物・くだもの・いろ（いちばん身近な語）
  { word: 'cat', meaning: 'ねこ', genre: 'animal' },
  { word: 'dog', meaning: 'いぬ', genre: 'animal' },
  { word: 'fish', meaning: 'さかな', genre: 'animal' },
  { word: 'bird', meaning: 'とり', genre: 'animal' },
  { word: 'apple', meaning: 'りんご', genre: 'fruit' },
  { word: 'banana', meaning: 'ばなな', genre: 'fruit' },
  { word: 'orange', meaning: 'みかん', genre: 'fruit' },
  { word: 'bear', meaning: 'くま', genre: 'animal' },
  { word: 'pig', meaning: 'ぶた', genre: 'animal' },
  { word: 'red', meaning: 'あか', genre: 'color' },
  { word: 'blue', meaning: 'あお', genre: 'color' },
  { word: 'star', meaning: 'ほし', genre: 'nature' },
  { word: 'moon', meaning: 'つき', genre: 'nature' },
  { word: 'egg', meaning: 'たまご', genre: 'food' },
]
const MEAN_L2: MeaningSpec[] = [
  { word: 'cat', meaning: 'ねこ', genre: 'animal' },
  { word: 'dog', meaning: 'いぬ', genre: 'animal' },
  { word: 'bird', meaning: 'とり', genre: 'animal' },
  { word: 'bear', meaning: 'くま', genre: 'animal' },
  { word: 'lion', meaning: 'らいおん', genre: 'animal' },
  { word: 'pig', meaning: 'ぶた', genre: 'animal' },
  { word: 'apple', meaning: 'りんご', genre: 'fruit' },
  { word: 'grape', meaning: 'ぶどう', genre: 'fruit' },
  { word: 'lemon', meaning: 'れもん', genre: 'fruit' },
  { word: 'orange', meaning: 'みかん', genre: 'fruit' },
  { word: 'red', meaning: 'あか', genre: 'color' },
  { word: 'blue', meaning: 'あお', genre: 'color' },
  { word: 'green', meaning: 'みどり', genre: 'color' },
  { word: 'yellow', meaning: 'きいろ', genre: 'color' },
  { word: 'star', meaning: 'ほし', genre: 'nature' },
  { word: 'moon', meaning: 'つき', genre: 'nature' },
  { word: 'sun', meaning: 'たいよう', genre: 'nature' },
]
const MEAN_L3: MeaningSpec[] = [
  { word: 'cat', meaning: 'ねこ', genre: 'animal' },
  { word: 'dog', meaning: 'いぬ', genre: 'animal' },
  { word: 'bird', meaning: 'とり', genre: 'animal' },
  { word: 'bear', meaning: 'くま', genre: 'animal' },
  { word: 'lion', meaning: 'らいおん', genre: 'animal' },
  { word: 'pig', meaning: 'ぶた', genre: 'animal' },
  { word: 'cow', meaning: 'うし', genre: 'animal' },
  { word: 'duck', meaning: 'あひる', genre: 'animal' },
  { word: 'frog', meaning: 'かえる', genre: 'animal' },
  { word: 'apple', meaning: 'りんご', genre: 'fruit' },
  { word: 'grape', meaning: 'ぶどう', genre: 'fruit' },
  { word: 'lemon', meaning: 'れもん', genre: 'fruit' },
  { word: 'peach', meaning: 'もも', genre: 'fruit' },
  { word: 'melon', meaning: 'めろん', genre: 'fruit' },
  { word: 'car', meaning: 'くるま', genre: 'vehicle' },
  { word: 'bus', meaning: 'ばす', genre: 'vehicle' },
  { word: 'boat', meaning: 'ふね', genre: 'vehicle' },
  { word: 'plane', meaning: 'ひこうき', genre: 'vehicle' },
  { word: 'star', meaning: 'ほし', genre: 'nature' },
  { word: 'moon', meaning: 'つき', genre: 'nature' },
  { word: 'sun', meaning: 'たいよう', genre: 'nature' },
  { word: 'tree', meaning: 'き', genre: 'nature' },
  { word: 'snow', meaning: 'ゆき', genre: 'nature' },
  { word: 'red', meaning: 'あか', genre: 'color' },
  { word: 'blue', meaning: 'あお', genre: 'color' },
  { word: 'green', meaning: 'みどり', genre: 'color' },
  { word: 'black', meaning: 'くろ', genre: 'color' },
  { word: 'white', meaning: 'しろ', genre: 'color' },
  { word: 'milk', meaning: 'みるく', genre: 'food' },
  { word: 'egg', meaning: 'たまご', genre: 'food' },
  { word: 'cake', meaning: 'けーき', genre: 'food' },
]
// 難易度4で増える語（難易度3に積み増し＝範囲が広がる）
const MEAN_L4_EXTRA: MeaningSpec[] = [
  { word: 'tiger', meaning: 'とら', genre: 'animal' },
  { word: 'rabbit', meaning: 'うさぎ', genre: 'animal' },
  { word: 'bike', meaning: 'じてんしゃ', genre: 'vehicle' },
  { word: 'cloud', meaning: 'くも', genre: 'nature' },
  { word: 'pink', meaning: 'ぴんく', genre: 'color' },
  { word: 'rice', meaning: 'ごはん', genre: 'food' },
]
// 難易度5でさらに増える語
const MEAN_L5_EXTRA: MeaningSpec[] = [
  { word: 'mouse', meaning: 'ねずみ', genre: 'animal' },
  { word: 'sheep', meaning: 'ひつじ', genre: 'animal' },
  { word: 'monkey', meaning: 'さる', genre: 'animal' },
  { word: 'penguin', meaning: 'ぺんぎん', genre: 'animal' },
  { word: 'cherry', meaning: 'さくらんぼ', genre: 'fruit' },
  { word: 'rainbow', meaning: 'にじ', genre: 'nature' },
  { word: 'rain', meaning: 'あめ', genre: 'nature' },
  { word: 'brown', meaning: 'ちゃいろ', genre: 'color' },
  { word: 'purple', meaning: 'むらさき', genre: 'color' },
  { word: 'soup', meaning: 'すーぷ', genre: 'food' },
]
// 難易度6で増える語
const MEAN_L6_EXTRA: MeaningSpec[] = [
  { word: 'elephant', meaning: 'ぞう', genre: 'animal' },
  { word: 'giraffe', meaning: 'きりん', genre: 'animal' },
  { word: 'fox', meaning: 'きつね', genre: 'animal' },
  { word: 'strawberry', meaning: 'いちご', genre: 'fruit' },
  { word: 'watermelon', meaning: 'すいか', genre: 'fruit' },
  { word: 'train', meaning: 'でんしゃ', genre: 'vehicle' },
  { word: 'rocket', meaning: 'ろけっと', genre: 'vehicle' },
  { word: 'star', meaning: 'ほし', genre: 'nature' },
  { word: 'flower', meaning: 'はな', genre: 'nature' },
  { word: 'orange', meaning: 'おれんじいろ', genre: 'color' },
]
// 難易度7でさらに増える語
const MEAN_L7_EXTRA: MeaningSpec[] = [
  { word: 'tiger', meaning: 'とら', genre: 'animal' },
  { word: 'dolphin', meaning: 'いるか', genre: 'animal' },
  { word: 'whale', meaning: 'くじら', genre: 'animal' },
  { word: 'butterfly', meaning: 'ちょうちょ', genre: 'animal' },
  { word: 'peach', meaning: 'もも', genre: 'fruit' },
  { word: 'grapes', meaning: 'ぶどう', genre: 'fruit' },
  { word: 'ship', meaning: 'ふね', genre: 'vehicle' },
  { word: 'wind', meaning: 'かぜ', genre: 'nature' },
  { word: 'cloud', meaning: 'くも', genre: 'nature' },
  { word: 'gray', meaning: 'はいいろ', genre: 'color' },
]

export const MEANING_WORDS: Record<DifficultyLevel, MeaningSpec[]> = {
  1: MEAN_L1,
  2: MEAN_L2,
  3: MEAN_L3,
  4: [...MEAN_L3, ...MEAN_L4_EXTRA],
  5: [...MEAN_L3, ...MEAN_L4_EXTRA, ...MEAN_L5_EXTRA],
  6: [...MEAN_L3, ...MEAN_L4_EXTRA, ...MEAN_L5_EXTRA, ...MEAN_L6_EXTRA],
  7: [...MEAN_L3, ...MEAN_L4_EXTRA, ...MEAN_L5_EXTRA, ...MEAN_L6_EXTRA, ...MEAN_L7_EXTRA],
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
