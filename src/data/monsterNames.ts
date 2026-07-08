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
}

/** モンスターIDの一覧（ずかんの並び順: よわい→つよい） */
export const ALL_MONSTER_IDS: string[] = [
  ...MONSTER_FILES.weak.map(f => f.replace(/\.png$/, '')),
  ...MONSTER_FILES.strong.map(f => f.replace(/\.png$/, '')),
]

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
