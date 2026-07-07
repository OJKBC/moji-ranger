/**
 * モンスター画像のグループ別マニフェスト。
 * このファイルは scripts/prepare-monsters.mjs が自動生成する（手で編集しない）。
 * 画像を足すときは ../画像/モンスター/{よわい,つよい}/ に原画を置いて再実行するだけでよい。
 * ファイルは public/assets/monsters/ 配下（BASE_URL 経由で参照）。
 */
export const MONSTER_FILES = {
  weak: [
  "monster-weak-1.png",
  "monster-weak-2.png",
  "monster-weak-3.png",
  "monster-weak-4.png",
  "monster-weak-5.png",
  "monster-weak-6.png",
  "monster-weak-7.png",
  "monster-weak-8.png",
  "monster-weak-9.png",
  "monster-weak-10.png",
  "monster-weak-11.png"
],
  strong: [
  "monster-strong-1.png",
  "monster-strong-2.png",
  "monster-strong-3.png",
  "monster-strong-4.png",
  "monster-strong-5.png",
  "monster-strong-6.png",
  "monster-strong-7.png",
  "monster-strong-8.png",
  "monster-strong-9.png",
  "monster-strong-10.png",
  "monster-strong-11.png",
  "monster-strong-12.png",
  "monster-strong-13.png",
  "monster-strong-14.png",
  "monster-strong-15.png"
],
  /** ボス専用画像（空なら strong グループから選ぶ）。専用画像ができたらここに追加 */
  boss: [] as string[],
}
