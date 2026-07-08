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
