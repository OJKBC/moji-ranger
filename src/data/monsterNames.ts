import { MONSTER_FILES } from '../game/monsterManifest'
import namesJson from './monster-names.json'

/**
 * モンスターの「なまえ」（ずかん表示・なかま成功時の読み上げ・あいぼう表示に使う）。
 * 名前の唯一の元データは src/data/monster-names.json（ID→なまえ）。
 * **名前を直したいときは monster-names.json を編集するだけ**でアプリ全体に反映される。
 * 直したら scripts/generate-voice.mjs を再実行すると読み上げ音声も更新される。
 * 未定義のIDには「もやもやNごう」の仮名が自動で付く（monsterName 参照）。
 */
export const MONSTER_NAMES: Record<string, string> = namesJson


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
