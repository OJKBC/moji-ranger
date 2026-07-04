/**
 * 見た目素材のマニフェスト。
 * 役割名 → public/assets/ 内のファイル名の対応をここに集約する。
 * 本番イラストへ差し替えるときは、原画を ../画像/ に置いて
 * `node scripts/prepare-visual-assets.mjs` を実行し、必要ならここを書き換えるだけでよい。
 */
export const ASSET_FILES = {
  /** 背景（もじシティ夜景・不透過） */
  background: 'background1.jpg',
  /** 選択肢の空のオーブ（文字はコードで上に描く） */
  bubble: 'bubble.png',
  /** 一人称の左手（待機・ひらいた手） */
  leftHand: 'lefthand.png',
  /** 一人称の右手（発射ポーズ・ブレスレット付き） */
  rightHand: 'righthand.png',
  /** 敵モンスター */
  monster: 'monster1.png',
  /** ボス（専用画像ができたらここを差し替える。今はザコと共通） */
  boss: 'monster1.png',
} as const

export type AssetRole = keyof typeof ASSET_FILES

/** GitHub Pages のサブパス配信でも壊れないよう BASE_URL を尊重した URL を返す */
export function assetUrl(role: AssetRole): string {
  return `${import.meta.env.BASE_URL}assets/${ASSET_FILES[role]}`
}
