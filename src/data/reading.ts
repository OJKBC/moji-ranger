/**
 * 読み上げの「読みマップ」（㊻）。
 *
 * 目的: 単独の文字を TTS に渡すと、助詞・記号・英字として誤読されることがある。
 *   例) ひらがな「へ」→「〜へ」の e、「は」→ wa、「を」→ o、英字「a」→ ローマ字「あ」。
 * これを個別対応ではなく、文字→「正しい読み（と言語）」の対応表で根本的に直す。
 *
 * 使いどころ（同じ表を両方で使う＝ズレない）:
 *   1) scripts/generate-voice.mjs … クリップ生成時、生の文字ではなくここの text で合成する。
 *   2) src/audio/voice.ts … クリップが無く TTS フォールバックするとき、text と lang を使う。
 *
 * 方針:
 *   - 助詞になりうる単独ひらがな（は/へ/を）は、カタカナ表記に置き換えて確実にその音にする
 *     （カタカナは助詞にならないので ハ=ha・ヘ=he・ヲ=wo と読まれる。子どもには同じ音で届く）。
 *   - 英字はレターネーム（A=エー…）で読む。lang='en' を明示して ja として読ませない。
 *   - 誤読が見つかったら、ここに1行足すだけで全経路が直る。将来の録音差し替えもこのキー経由。
 */
export interface Reading {
  /** TTS に渡す読み（生の文字の代わりに合成・発話する） */
  text: string
  /** 読み上げ言語（合成音声/utterance の lang 切替に使う） */
  lang: 'ja' | 'en'
}

/**
 * 上書きが必要な文字だけを列挙する（ここに無い文字は生のまま・既存どおり読む）。
 * key = 出題される生の文字。
 */
export const READING_OVERRIDES: Record<string, Reading> = {
  // 助詞になりうる単独ひらがな → カタカナで確実にその音にする（最優先）
  'は': { text: 'ハ', lang: 'ja' },
  'へ': { text: 'ヘ', lang: 'ja' },
  'を': { text: 'ヲ', lang: 'ja' },
  // 小さい文字（拗音のもと・促音・小さい母音）は単独では音にならないので、
  // 日本の子ども向けの言い方「ちいさい 〇」で読む（や→ゃ の識別練習になる）。
  'ゃ': { text: 'ちいさい や', lang: 'ja' },
  'ゅ': { text: 'ちいさい ゆ', lang: 'ja' },
  'ょ': { text: 'ちいさい よ', lang: 'ja' },
  'っ': { text: 'ちいさい つ', lang: 'ja' },
  'ぁ': { text: 'ちいさい あ', lang: 'ja' },
  'ぃ': { text: 'ちいさい い', lang: 'ja' },
  'ぅ': { text: 'ちいさい う', lang: 'ja' },
  'ぇ': { text: 'ちいさい え', lang: 'ja' },
  'ぉ': { text: 'ちいさい お', lang: 'ja' },
  'ャ': { text: 'ちいさい や', lang: 'ja' },
  'ュ': { text: 'ちいさい ゆ', lang: 'ja' },
  'ョ': { text: 'ちいさい よ', lang: 'ja' },
  'ッ': { text: 'ちいさい つ', lang: 'ja' },
  'ァ': { text: 'ちいさい あ', lang: 'ja' },
  'ィ': { text: 'ちいさい い', lang: 'ja' },
  'ゥ': { text: 'ちいさい う', lang: 'ja' },
  'ェ': { text: 'ちいさい え', lang: 'ja' },
  'ォ': { text: 'ちいさい お', lang: 'ja' },
  'ー': { text: 'のばす おと', lang: 'ja' },
  // 英字はレターネーム（名前読み）で固定。en を明示し、ja のローマ字読みを防ぐ
  a: { text: 'A', lang: 'en' }, b: { text: 'B', lang: 'en' }, c: { text: 'C', lang: 'en' },
  d: { text: 'D', lang: 'en' }, e: { text: 'E', lang: 'en' }, f: { text: 'F', lang: 'en' },
  g: { text: 'G', lang: 'en' }, h: { text: 'H', lang: 'en' }, i: { text: 'I', lang: 'en' },
  j: { text: 'J', lang: 'en' }, k: { text: 'K', lang: 'en' }, l: { text: 'L', lang: 'en' },
  m: { text: 'M', lang: 'en' }, n: { text: 'N', lang: 'en' }, o: { text: 'O', lang: 'en' },
  p: { text: 'P', lang: 'en' }, q: { text: 'Q', lang: 'en' }, r: { text: 'R', lang: 'en' },
  s: { text: 'S', lang: 'en' }, t: { text: 'T', lang: 'en' }, u: { text: 'U', lang: 'en' },
  v: { text: 'V', lang: 'en' }, w: { text: 'W', lang: 'en' }, x: { text: 'X', lang: 'en' },
  y: { text: 'Y', lang: 'en' }, z: { text: 'Z', lang: 'en' },
}

/** 生の文字の読み上げ上書き（大文字英字は小文字キーで引く）。無ければ null */
export function readingFor(ch: string): Reading | null {
  return READING_OVERRIDES[ch] ?? READING_OVERRIDES[ch.toLowerCase()] ?? null
}
