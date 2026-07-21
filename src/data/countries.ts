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
  { code: 'in', name: 'インド', characteristics: [
    'アジアに ある おおきな くに',
    'カレーが うまれた くに',
    'ゾウが すんでいるよ',
  ] },
  { code: 'es', name: 'スペイン', characteristics: [
    'ヨーロッパに ある くに',
    'サッカーが つよいよ',
    'あかと きいろの はた',
  ] },
  { code: 'mx', name: 'メキシコ', characteristics: [
    'きたアメリカの みなみに ある くに',
    'タコスという たべものが ゆうめい',
    'サボテンが たくさん',
  ] },
  { code: 'th', name: 'タイ', characteristics: [
    'アジアに ある くに',
    'ゾウが たくさん いるよ',
    'あたたかくて フルーツが おいしい',
  ] },
  { code: 'ch', name: 'スイス', characteristics: [
    'ヨーロッパの まんなかの くに',
    'アルプスという たかい やまが ある',
    'チョコレートが ゆうめい',
  ] },
  { code: 'tr', name: 'トルコ', characteristics: [
    'アジアと ヨーロッパの あいだの くに',
    'あかい はたに つきと ほし',
    'あまい おかしが ゆうめい',
  ] },
  { code: 'gr', name: 'ギリシャ', characteristics: [
    'ヨーロッパに ある くに',
    'あおと しろの はた',
    'むかしの おはなし(しんわ)が ゆうめい',
  ] },
  { code: 'se', name: 'スウェーデン', characteristics: [
    'ヨーロッパの きたの くに',
    'あおい はたに きいろい じゅうじ',
    'もりと みずうみが おおい',
  ] },
  { code: 'no', name: 'ノルウェー', characteristics: [
    'ヨーロッパの きたの くに',
    'よぞらに オーロラが みえるよ',
    'うみの ちかくに たかい がけが ある',
  ] },
  { code: 'fi', name: 'フィンランド', characteristics: [
    'ヨーロッパの きたの くに',
    'サンタさんの ふるさとと いわれる',
    'ゆきが たくさん ふる',
  ] },
  { code: 'pt', name: 'ポルトガル', characteristics: [
    'ヨーロッパの にしの くに',
    'うみの ちかくの くに',
    'あまい エッグタルトが ゆうめい',
  ] },
  { code: 'ie', name: 'アイルランド', characteristics: [
    'ヨーロッパの しまぐに',
    'みどりが いっぱいの くに',
    'みどり・しろ・オレンジの はた',
  ] },
  { code: 'at', name: 'オーストリア', characteristics: [
    'ヨーロッパの まんなかの くに',
    'おんがくが さかんな くに',
    'あか・しろ・あかの はた',
  ] },
  { code: 'pl', name: 'ポーランド', characteristics: [
    'ヨーロッパに ある くに',
    'しろと あかの はた',
    'むかしの おしろが おおい',
  ] },
  { code: 'is', name: 'アイスランド', characteristics: [
    'きたの うみに ある しまぐに',
    'おんせんが たくさん',
    'かざんと こおりの くに',
  ] },
  { code: 'id', name: 'インドネシア', characteristics: [
    'アジアの みなみに ある しまの くに',
    'あたたかくて うみが きれい',
    'あかと しろの はた',
  ] },
  { code: 'vn', name: 'ベトナム', characteristics: [
    'アジアに ある くに',
    'フォーという めんが ゆうめい',
    'あかい はたに きいろい ほし',
  ] },
  { code: 'ph', name: 'フィリピン', characteristics: [
    'アジアの しまの くに',
    'あたたかくて うみが きれい',
    'たくさんの しまが ある',
  ] },
  { code: 'my', name: 'マレーシア', characteristics: [
    'アジアに ある くに',
    'あたたかい くに',
    'たかい ツインタワーが ゆうめい',
  ] },
  { code: 'sg', name: 'シンガポール', characteristics: [
    'アジアの ちいさな しまの くに',
    'きれいな まちの くに',
    'マーライオンが ゆうめい',
  ] },
  { code: 'ar', name: 'アルゼンチン', characteristics: [
    'みなみアメリカの くに',
    'サッカーが とても つよい',
    'タンゴという ダンスが ゆうめい',
  ] },
  { code: 'pe', name: 'ペルー', characteristics: [
    'みなみアメリカの くに',
    'たかい やまに むかしの いせきが ある',
    'アルパカが すんでいる',
  ] },
  { code: 'za', name: 'みなみアフリカ', characteristics: [
    'アフリカの いちばん みなみの くに',
    'ライオンや ゾウが すんでいる',
    'カラフルな はた',
  ] },
  { code: 'ke', name: 'ケニア', characteristics: [
    'アフリカに ある くに',
    'サバンナに どうぶつが いっぱい',
    'はしるのが はやい せんしゅが おおい',
  ] },
  { code: 'ma', name: 'モロッコ', characteristics: [
    'アフリカの きたの くに',
    'ひろい さばくが ある',
    'あかい はたに みどりの ほし',
  ] },
  { code: 'nz', name: 'ニュージーランド', characteristics: [
    'みなみの うみに ある しまぐに',
    'ひつじが たくさん いるよ',
    'キウイという とりが すんでいる',
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
  ['fr', 'it', 'ie'], // たて3色（青白赤・緑白赤・緑白橙）
  ['nl', 'ru'],       // よこ 赤白青系
  ['se', 'no', 'fi', 'is'], // 北欧の十字
  ['id', 'pl'],       // 赤白 / 白赤（上下が逆）
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
