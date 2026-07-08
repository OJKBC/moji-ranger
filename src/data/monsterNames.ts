import { MONSTER_FILES } from '../game/monsterManifest'

/**
 * モンスターの「なまえ」（ずかん表示・なかま成功時の読み上げに使う）。
 * キーはモンスターID（ファイル名から拡張子を除いたもの）。
 * ここを編集すれば名前を変えられる。名前を変えたら
 * scripts/generate-voice.mjs の MONSTER_NAMES も合わせて再実行すること。
 * 未定義のIDには「もやもやNごう」の仮名が自動で付く。
 */
export const MONSTER_NAMES: Record<string, string> = {
  'monster-weak-1': 'りゅうたん',
  'monster-weak-2': 'かぶとん',
  'monster-weak-3': 'ぱたぱた',
  'monster-weak-4': 'いわごろ',
  'monster-weak-5': 'とげまる',
  'monster-weak-6': 'ぷにぷに',
  'monster-weak-7': 'いたずらん',
  'monster-weak-8': 'もふにゃん',
  'monster-weak-9': 'きのこん',
  'monster-weak-10': 'ぷるりん',
  'monster-weak-11': 'がおたん',
  'monster-strong-1': 'えんまおう',
  'monster-strong-2': 'あおきば',
  'monster-strong-3': 'やみりゅう',
  'monster-strong-4': 'もりのぬし',
  'monster-strong-5': 'わにごん',
  'monster-strong-6': 'むらさきまる',
  'monster-strong-7': 'きんりゅう',
  'monster-strong-8': 'がぶりん',
  'monster-strong-9': 'おにごろう',
  'monster-strong-10': 'ようがんまる',
  'monster-strong-11': 'まどうし',
  'monster-strong-12': 'こがねりゅう',
  'monster-strong-13': 'あかづのまる',
  'monster-strong-14': 'りゅうきし',
  'monster-strong-15': 'やみのおう',
  // --- 2026-07-08 追加分（よわい） ---
  'monster-weak-12': 'ごぶすけ',
  'monster-weak-13': 'つのかめ',
  'monster-weak-15': 'ほねむし',
  'monster-weak-16': 'みどりごぶ',
  'monster-weak-17': 'ぷるおばけ',
  'monster-weak-18': 'ふくろん',
  'monster-weak-19': 'どろがえる',
  'monster-weak-20': 'まんどら',
  'monster-weak-21': 'ほねきし',
  'monster-weak-22': 'こあくま',
  'monster-weak-23': 'きのこっこ',
  'monster-weak-24': 'とかげまる',
  'monster-weak-25': 'めだまん',
  'monster-weak-26': 'ごぶじい',
  'monster-weak-27': 'あわぷる',
  'monster-weak-28': 'あかこうもり',
  'monster-weak-29': 'こけまる',
  'monster-weak-30': 'うみとかげ',
  // --- 2026-07-08 追加分（つよい） ---
  'monster-strong-17': 'ごうきまる',
  'monster-strong-18': 'よろいわに',
  'monster-strong-19': 'めかりゅう',
  'monster-strong-20': 'すいしょうりゅう',
  'monster-strong-21': 'やみまどう',
  'monster-strong-22': 'ひすいりゅう',
  'monster-strong-23': 'やみひめ',
  'monster-strong-24': 'くろきし',
  'monster-strong-25': 'めだまおう',
  'monster-strong-26': 'いのがみ',
  'monster-strong-27': 'べにつばさ',
  'monster-strong-28': 'がりゅう',
  'monster-strong-29': 'こおりりゅう',
  'monster-strong-30': 'まほうおう',
  'monster-strong-31': 'まぐまじゅう',
  'monster-strong-32': 'べにまじょ',
  'monster-strong-33': 'かまきりおう',
  'monster-strong-34': 'あんこくきし',
  'monster-strong-35': 'でんでんじょう',
  'monster-strong-36': 'いすまじん',
  'monster-strong-37': 'かかしおう',
  'monster-strong-38': 'たこまじん',
  'monster-strong-39': 'ひつじがみ',
  'monster-strong-40': 'くもじょおう',
  'monster-strong-41': 'きこりん',
  'monster-strong-42': 'おうごんとう',
  'monster-strong-43': 'はなかまきり',
  'monster-strong-44': 'きんじし',
  // --- 2026-07-08 追加分その2（つよい・幻想生物シリーズ） ---
  'monster-strong-45': 'ゆきまじん',
  'monster-strong-46': 'きつねまい',
  'monster-strong-47': 'こおりのせい',
  'monster-strong-48': 'おばけきし',
  'monster-strong-49': 'らっぱばな',
  'monster-strong-50': 'かいりゅう',
  'monster-strong-51': 'もこさま',
  'monster-strong-52': 'いしこうもり',
  'monster-strong-53': 'かさくらげ',
  'monster-strong-54': 'くじゃくおう',
  'monster-strong-55': 'たぬきせんにん',
  'monster-strong-56': 'きんさそり',
  'monster-strong-57': 'ほしりゅう',
  'monster-strong-58': 'うさぎきし',
  'monster-strong-59': 'ほしおおかみ',
  'monster-strong-60': 'からくりきりん',
  'monster-strong-61': 'かえるがか',
  'monster-strong-62': 'ゆめうま',
  'monster-strong-63': 'がひめ',
  'monster-strong-64': 'もみじしか',
  // --- 2026-07-08 追加分その3（つよい・65〜105） ---
  'monster-strong-65': 'やりりゅう',
  'monster-strong-66': 'かげのじゅう',
  'monster-strong-67': 'かげまじん',
  'monster-strong-68': 'すいしょうまる',
  'monster-strong-69': 'つきのおう',
  'monster-strong-70': 'だいじゃおう',
  'monster-strong-71': 'はねじし',
  'monster-strong-72': 'にじほうおう',
  'monster-strong-73': 'あかりゅうき',
  'monster-strong-74': 'がまにんじゃ',
  'monster-strong-75': 'とりのぶし',
  'monster-strong-76': 'うぱまどう',
  'monster-strong-77': 'おんぷどり',
  'monster-strong-78': 'みずうま',
  'monster-strong-79': 'ちょうのせい',
  'monster-strong-80': 'まかいどうし',
  'monster-strong-81': 'はさみどり',
  'monster-strong-82': 'からくりどけい',
  'monster-strong-83': 'ちゃがまじん',
  'monster-strong-84': 'からかさおばけ',
  'monster-strong-85': 'ちょうちんおう',
  'monster-strong-86': 'たこよろい',
  'monster-strong-87': 'かめらおう',
  'monster-strong-88': 'こうてつへい',
  'monster-strong-89': 'むらさきおう',
  'monster-strong-90': 'かえんき',
  'monster-strong-91': 'はくまどう',
  'monster-strong-92': 'せきりゅうき',
  'monster-strong-93': 'がんせきおう',
  'monster-strong-94': 'こうてんし',
  'monster-strong-95': 'もりのまい',
  'monster-strong-96': 'しおまじん',
  'monster-strong-97': 'こけまじゅう',
  'monster-strong-98': 'もりおに',
  'monster-strong-99': 'べにむしゃ',
  'monster-strong-100': 'ひのめがみ',
  'monster-strong-101': 'つるおどり',
  'monster-strong-102': 'みなもりゅう',
  'monster-strong-103': 'みどりごろう',
  'monster-strong-104': 'あかおにおう',
  'monster-strong-105': 'かえんひめ',
  // --- 2026-07-08 追加分（よわい・31〜51。道中の敵のみ＝図鑑・なかま対象外。名前は予備） ---
  'monster-weak-31': 'ろうそくん',
  'monster-weak-32': 'つぎはぎわん',
  'monster-weak-33': 'ぽっとん',
  'monster-weak-34': 'りんりんまる',
  'monster-weak-35': 'ふわりん',
  'monster-weak-36': 'どうけごぶ',
  'monster-weak-37': 'まくらん',
  'monster-weak-38': 'ちょうちんこ',
  'monster-weak-39': 'こうもりん',
  'monster-weak-40': 'たまごん',
  'monster-weak-41': 'ぼくさーがえる',
  'monster-weak-42': 'ぶーつん',
  'monster-weak-43': 'かねあたま',
  'monster-weak-44': 'とげじゅう',
  'monster-weak-45': 'ぼろまんと',
  'monster-weak-46': 'もじゃまる',
  'monster-weak-47': 'いんくん',
  'monster-weak-48': 'すすまる',
  'monster-weak-49': 'ぐるぐるみいら',
  'monster-weak-50': 'たるくち',
  'monster-weak-51': 'おめんじゅう',
}

const stripExt = (f: string) => f.replace(/\.png$/, '')

/**
 * つよいモンスターのID一覧。
 * つよい＝ボスになる＝なかまボールの対象＝ずかんに載る「capturable」なグループ。
 * （よわいは道中の敵のみで、捕獲も図鑑掲載もしない）
 */
export const STRONG_MONSTER_IDS: string[] = MONSTER_FILES.strong.map(stripExt)

/** よわいモンスターのID一覧（道中の敵のみ。捕獲・図鑑対象外） */
export const WEAK_MONSTER_IDS: string[] = MONSTER_FILES.weak.map(stripExt)

/**
 * なかまボール・図鑑の対象になるモンスター（＝つよい）。
 * データ（グループ）で切り替わるので、仕様変更はこの1行で済む。
 */
export const CAPTURABLE_MONSTER_IDS: string[] = STRONG_MONSTER_IDS

/** そのモンスターが捕獲・図鑑の対象か（つよい＝true / よわい＝false） */
export function isCapturable(id: string): boolean {
  return STRONG_MONSTER_IDS.includes(id)
}

/** モンスターIDの一覧（よわい→つよい。名前フォールバックの通し番号にのみ使用） */
export const ALL_MONSTER_IDS: string[] = [...WEAK_MONSTER_IDS, ...STRONG_MONSTER_IDS]

/** 名前を返す（未定義なら「もやもやNごう」の仮名） */
export function monsterName(id: string): string {
  if (MONSTER_NAMES[id]) return MONSTER_NAMES[id]
  const index = ALL_MONSTER_IDS.indexOf(id)
  return `もやもや${index >= 0 ? index + 1 : 0}ごう`
}

/** モンスターIDから画像URL（ずかん用） */
export function monsterImageUrl(id: string): string {
  return `${import.meta.env.BASE_URL}assets/monsters/${id}.png`
}
