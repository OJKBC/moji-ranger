/**
 * 「くに」ステージの国データ（単一のソース）。
 *
 * ここを参照/同期するもの:
 *   - scripts/prepare-flags.mjs   … flag-icons(MIT) の SVG を必要国だけ PNG 化して public/assets/flags/ に置く
 *   - scripts/generate-voice.mjs  … 国名・特徴・出題文の読み上げクリップを生成
 *   - src/game/Ride25DScene.ts    … 出題（国旗バブル）・正解後の紹介演出
 *   - src/CountryIntro.tsx        … 正解後の世界地図ハイライト（日本＋出題国）＋特徴の読み上げ
 *   - src/WorldZukan.tsx          … せかいずかん（あつめた国旗）
 *
 * ★ 国を増やす／特徴を直すときは、この配列を編集して次を再実行するだけ:
 *     node scripts/prepare-flags.mjs      （新しい国の国旗PNGを用意）
 *     node scripts/generate-voice.mjs     （新しい国名・特徴の音声を用意）
 *   code は ISO 3166-1 alpha-2（小文字）。flag-icons と @svg-maps/world の両方がこのコードで引ける。
 *
 * 特徴（characteristics）は 4〜6歳向けのやさしい説明を2〜3個。
 *   「どんな国か（場所）＋身近な名物」を中心に、こわくない・中立な表現にする
 *   （幼児に伝わりにくい固有名詞や政治的に微妙な話題は避ける）。
 */
export interface Country {
  /** ISO 3166-1 alpha-2（小文字）。国旗・地図の紐付けキー */
  code: string
  /** 日本語（カタカナ）の国名。バブル下の表示と読み上げに使う */
  name: string
  /** 4〜6歳向けのやさしい特徴（2〜3個）。1個目は「場所」を入れると分かりやすい */
  characteristics: string[]
}

/**
 * 収録国（習わせたい順＝distinct な国旗から）。
 * 前半ほど国旗がはっきり違う（低難易度）／後半ほど似た国旗が増える。
 * 難易度で開放数が増える（poolStart＋difficulty.ts の poolBonus）。
 */
export const COUNTRIES: Country[] = [
  { code: 'jp', name: 'にほん', characteristics: [
    'アジアに ある しまぐにだよ',
    'わたしたちが すんでいる くに',
    'おすしや おもちゃが せかいで にんき',
  ] },
  { code: 'us', name: 'アメリカ', characteristics: [
    'きたアメリカに ある おおきな くに',
    'ハンバーガーが うまれた くに',
    'たかい ビルが たくさん あるよ',
  ] },
  { code: 'fr', name: 'フランス', characteristics: [
    'ヨーロッパに ある くにだよ',
    'パンや ケーキが とても おいしい',
    'サッカーが つよいよ',
  ] },
  { code: 'br', name: 'ブラジル', characteristics: [
    'みなみアメリカの おおきな くに',
    'サッカーが せかいで いちばん つよい',
    'げんきな おまつりが ゆうめい',
  ] },
  { code: 'ca', name: 'カナダ', characteristics: [
    'きたアメリカの ひろい くに',
    'あかい かえでの はっぱが しるし',
    'ゆきと しぜんが いっぱい',
  ] },
  { code: 'kr', name: 'かんこく', characteristics: [
    'にほんの すぐ となりの くに',
    'キムチが ゆうめい',
    'うたや ダンスが にんき',
  ] },
  { code: 'cn', name: 'ちゅうごく', characteristics: [
    'アジアの おおきな くに',
    'パンダが すんでいるよ',
    'ひとが せかいで いちばん おおい',
  ] },
  { code: 'de', name: 'ドイツ', characteristics: [
    'ヨーロッパに ある くに',
    'くるまづくりが とても じょうず',
    'ソーセージが ゆうめい',
  ] },
  { code: 'it', name: 'イタリア', characteristics: [
    'ヨーロッパに ある くに',
    'ピザや パスタが うまれた くに',
    'むかしの たてものが たくさん',
  ] },
  { code: 'gb', name: 'イギリス', characteristics: [
    'ヨーロッパの しまぐに',
    'あかい にかいだての バスが はしる',
    'サッカーが うまれた くに',
  ] },
  { code: 'au', name: 'オーストラリア', characteristics: [
    'みなみの ほうに ある おおきな しま',
    'コアラや カンガルーが いるよ',
    'うみが とても きれい',
  ] },
  { code: 'eg', name: 'エジプト', characteristics: [
    'アフリカに ある くに',
    'おおきな ピラミッドが あるよ',
    'ひろい さばくが ある',
  ] },
  { code: 'nl', name: 'オランダ', characteristics: [
    'ヨーロッパに ある くに',
    'かざぐるまが ゆうめい',
    'チューリップの おはなが きれい',
  ] },
  { code: 'ru', name: 'ロシア', characteristics: [
    'せかいで いちばん ひろい くに',
    'ふゆは ゆきで とても さむい',
    'マトリョーシカという にんぎょうが ゆうめい',
  ] },
]

/** 出題プール（習わせたい順のコード列）。stages.ts の battle.letterPool に使う */
export const COUNTRY_ORDER: string[] = COUNTRIES.map(c => c.code)

/**
 * 国旗が似ていて紛らわしいグループ（高難易度でダミーに混ぜる）。
 * 三色旗（たて）＝フランス/イタリア、三色旗（よこ・赤白青系）＝オランダ/ロシア。
 * 増やすときはコードの組をここに足す。
 */
export const SIMILAR_FLAG_GROUPS: string[][] = [
  ['fr', 'it'],
  ['nl', 'ru'],
]

const BY_CODE: Record<string, Country> = Object.fromEntries(COUNTRIES.map(c => [c.code, c]))

/** コードから国データ（無ければ undefined） */
export function countryByCode(code: string): Country | undefined {
  return BY_CODE[code]
}

/** コードから国名（カタカナ）。未知コードはコードをそのまま返す */
export function countryName(code: string): string {
  return BY_CODE[code]?.name ?? code
}

/** 国旗画像URL（ずかん・オーバーレイ用。ゲーム内バブルは Phaser テクスチャで別読み） */
export function flagUrl(code: string): string {
  return `${import.meta.env.BASE_URL}assets/flags/${code}.png`
}

/** 出題文（「〇〇の はたは どれ？」）。読み上げクリップのキーとしても使う */
export function countryPrompt(code: string): string {
  return `${countryName(code)}の はたは どれ？`
}

/** その国と国旗が似ているコード（同じ SIMILAR_FLAG_GROUPS に属する他国） */
export function similarFlagCodes(code: string): string[] {
  const g = SIMILAR_FLAG_GROUPS.find(group => group.includes(code))
  return g ? g.filter(c => c !== code) : []
}
