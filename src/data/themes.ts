/**
 * ステージの「テーマ（背景の世界）」。さんすう以外のステージで、プレイのたびに
 * 背景をランダムに選び、その世界に合ったモンスターが出やすくする。
 *
 * 例: 海（sea）の背景のときは、名前に「すいしょう/くらげ/さんご/みず…」を含む
 *     水っぽいモンスターがボスに出やすくなる（keywords で名前をゆるくマッチ）。
 *
 * 背景画像は public/assets/ 配下。モンスター名は src/data/monster-names.json。
 * テーマや紐付けを増やしたいときは、この配列に足すだけ。
 */
export interface Theme {
  id: string
  /** 背景ファイル名（public/assets/ 配下） */
  bg: string
  /** この世界に合うモンスター名の断片（ゆるく含み一致でボス/道中を寄せる） */
  keywords: string[]
}

export const THEMES: Theme[] = [
  { id: 'forest', bg: 'background_forest.jpg', keywords: ['もり', 'きこり', 'はな', 'かまきり', 'もみじ', 'さぼてん', 'みどり', 'きつね', 'たぬき', 'うさぎ', 'ひつじ', 'いの', 'くも', 'ぐも', 'へび', 'かえる', 'ちょう', 'むし', 'らっぱ'] },
  { id: 'sea', bg: 'background_sea.jpg', keywords: ['すい', 'かい', 'くらげ', 'かっぱ', 'がめ', 'たこ', 'ざめ', 'しゃーく', 'さんご', 'みず', 'こおり', 'ひょうが', 'ゆき', 'わに', 'がに', 'かめ', 'なみ', 'うみ'] },
  { id: 'sky', bg: 'background_sky.jpg', keywords: ['つばさ', 'てんし', 'てんぐ', 'とり', 'ほうおう', 'かみなり', 'くじゃく', 'そら', 'かぜ', 'つき', 'にじ', 'だてん'] },
  { id: 'space', bg: 'background_space.jpg', keywords: ['ほし', 'たいよう', 'ゆめ', 'うちゅう', 'ぎんが'] },
  { id: 'underground', bg: 'background_underground.jpg', keywords: ['ようがん', 'まぐま', 'つち', 'いし', 'ほね', 'がいこつ', 'おに', 'かえん', 'ほのお', 'くろがね', 'ごうき', 'いわ', 'ごりら'] },
  { id: 'city', bg: 'background1.jpg', keywords: [] }, // もじシティ（従来の夜景）。寄せなし
]

/** さんすう（たしざん/ひきざん）用の落ち着いた背景（テーマ抽選の対象外） */
export const MATH_BG = 'background2.jpg'

/** さんすう以外のプレイで使うテーマを1つ選ぶ（プレイ＝難易度ごとにランダムに変わる） */
export function pickTheme(rnd: () => number = Math.random): Theme {
  return THEMES[Math.floor(rnd() * THEMES.length)] ?? THEMES[THEMES.length - 1]
}
