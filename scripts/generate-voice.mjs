/**
 * 読み上げ音声クリップの生成スクリプト（ネットワーク必要・開発時に実行）
 *   node scripts/generate-voice.mjs
 *
 * Microsoft Edge のニューラル TTS（ja-JP-Nanami）で、ゲームが使う全トークンの
 * mp3 を public/assets/voice/ に生成し、src/audio/voiceManifest.ts を自動生成する。
 *
 * 背景: iPhone は Web の speechSynthesis が WebAudio と競合して消音される等
 * 不安定なため、読み上げは「事前生成した音声ファイルを効果音と同じ経路で再生」
 * する方式に切り替えた。トークンを増やしたらこのスクリプトを再実行する。
 */
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const DST = path.join(root, '..', 'public', 'assets', 'voice')
const MANIFEST = path.join(root, '..', 'src', 'audio', 'voiceManifest.ts')
fs.mkdirSync(DST, { recursive: true })

// ---- トークン一覧（voice.speak のテキストを 、。！？とスペースで区切ったもの）----

// ひらがな・カタカナ（清音46＋濁音＋半濁音＋小さい文字）は src/data/kana.ts から取り込む。
// kana.ts に文字を足せば、ステージのプールも選択肢もここのクリップも自動で追う（全カバー維持）。
const readFileEarly = rel => fs.readFileSync(path.join(root, '..', rel), 'utf8')
const kanaSrc = readFileEarly('src/data/kana.ts')
const kanaArr = name => {
  const m = kanaSrc.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`))
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : []
}
const HIRA = [
  ...kanaArr('HIRAGANA_SEION'), ...kanaArr('HIRAGANA_DAKUTEN'),
  ...kanaArr('HIRAGANA_HANDAKUTEN'), ...kanaArr('HIRAGANA_SMALL'),
]
const KATA = [
  ...kanaArr('KATAKANA_SEION'), ...kanaArr('KATAKANA_DAKUTEN'),
  ...kanaArr('KATAKANA_HANDAKUTEN'), ...kanaArr('KATAKANA_SMALL'),
]
/** 数字の読み（さんすう用。に・ご も含める＝清音46には濁音のごが無いため明示）。
 *  11〜18 は「じゅう＋一の位」をスペース連結で読むので、単体クリップはこの10個で足りる。 */
const DIGITS = ['いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう', 'じゅう']

// ---- データファイルから自動抽出（追記したらデータ側を直すだけでクリップに反映される）----
const readFile = rel => fs.readFileSync(path.join(root, '..', rel), 'utf8')
const wordsSrc = readFile('src/data/words.ts')
const englishSrc = readFile('src/data/english.ts')
// ㊻ 読みマップ（src/data/reading.ts）の ja 上書きを取り込む。
//    生の文字（は/へ/を 等）を、誤読しない読み（ハ/ヘ/ヲ）でクリップ生成する。
//    キーは生の文字のまま（VOICE_CLIPS のキーは変えない）＝再生側のルックアップは不変。
const readingSrc = readFile('src/data/reading.ts')
const JA_READING = {}
for (const m of readingSrc.matchAll(/'?([^':{}\s]+)'?:\s*\{\s*text:\s*'([^']+)',\s*lang:\s*'ja'\s*\}/g)) {
  JA_READING[m[1]] = m[2]
}
/** words.ts の単語（ひらがな）＋ english.ts の meaning（ひらがな）を読み上げ対象にする */
const WORDS = [...new Set([
  ...[...wordsSrc.matchAll(/word:\s*'([^']+)'/g)].map(m => m[1]),
  ...[...englishSrc.matchAll(/meaning:\s*'([^']+)'/g)].map(m => m[1]),
])]
/**
 * モンスターの名前（唯一の元データ src/data/monster-names.json を読む）。
 * 名前を直したいときは monster-names.json を編集して、このスクリプトを再実行するだけでよい。
 */
const MONSTER_NAMES = [...new Set(Object.values(
  JSON.parse(readFileEarly('src/data/monster-names.json')),
))]

/** フレーズ。キー=トークン / 値=読み上げに使うテキスト（読みを明示したいとき用） */
const PHRASES = {
  // なかまボール（src/data/balls.ts と同期させること）
  'あかボールだ': 'あかボールだ！',
  'あおボールだ': 'あおボールだ！',
  'ブラックボールだ': 'ブラックボールだ！',
  'むらさきボールだ': 'むらさきボールだ！',
  'なかまになった': 'なかまになった！',
  'にげられちゃった': 'にげられちゃった！',
  'またあそぼうね': 'また、あそぼうね！',
  'もうなかまだよ': 'もう、なかまだよ！',
  'つぎは': 'つぎは！',
  'まずは': 'まずは！',
  'これは': 'これは',
  'だよ': 'だよ',
  'さきに': 'さきに',
  'たす': 'たす',
  'ひく': 'ひく',
  'いくつ': 'いくつ？',
  'じゅんばんで': 'じゅんばんで',
  'うとう': 'うとう！',
  'まえの': 'まえの',
  'ステージを': 'ステージを',
  'クリアしてね': 'クリアしてね！',
  // ㊺ 大枠カテゴリの読み上げ
  'にほんご': 'にほんご！',
  'えいご': 'えいご！',
  'さんすう': 'さんすう！',
  // ㊷ ログインボーナス
  'ログインボーナス': 'ログインボーナス！',
  'きょうのボーナス': 'きょうの、ボーナス！',
  // ㊸ あいぼう
  'あいぼうにするね': 'あいぼうに、するね！',
}

/**
 * 英語トークン（src/data/english.ts と同期させること）。
 * 別の en-US ニューラル音声で生成し、EN_VOICE_CLIPS（voiceManifestEn.ts）に登録する。
 */
const EN_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')
// english.ts の word:（SPELL の正解スペル＋ MEANING の英単語）をすべて読み上げ対象にする
const EN_WORDS = [...new Set(
  [...englishSrc.matchAll(/word:\s*'([a-zA-Z]+)'/g)].map(m => m[1].toLowerCase()),
)]

/** ファイル名はコードポイントのスラッグ（Unicode ファイル名のURLトラブル回避） */
const slug = token => [...token].map(c => c.codePointAt(0).toString(16)).join('-')

// テンポ最優先: 普通の速さで発音させる（遅くしすぎると「し・・か・・」と間延びする）
const jobs = []
// ㊻ 生成テキストは読みマップで上書き（は→ハ 等）。token（＝ファイル名/キー）は生の文字のまま
for (const t of [...HIRA, ...KATA]) jobs.push({ token: t, text: `${JA_READING[t] ?? t}！`, rate: '-10%' })
for (const t of DIGITS) jobs.push({ token: t, text: `${t}`, rate: '-10%' })
for (const t of WORDS) jobs.push({ token: t, text: `${t}！`, rate: '+0%' })
for (const t of MONSTER_NAMES) jobs.push({ token: t, text: `${t}！`, rate: '+0%' })
for (const [token, text] of Object.entries(PHRASES)) jobs.push({ token, text, rate: '-5%' })

const tts = new MsEdgeTTS()
await tts.setMetadata('ja-JP-NanamiNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)

const manifest = {}
for (const { token, text, rate } of jobs) {
  const file = `${slug(token)}.mp3`
  const out = path.join(DST, file)
  if (!fs.existsSync(out)) {
    const { audioStream } = await tts.toStream(text, { rate })
    const chunks = []
    await new Promise((resolve, reject) => {
      audioStream.on('data', c => chunks.push(c))
      audioStream.on('end', resolve)
      audioStream.on('error', reject)
    })
    fs.writeFileSync(out, Buffer.concat(chunks))
    process.stdout.write(`${token} `)
  }
  manifest[token] = file
}
console.log('')

const ts = `/**
 * 読み上げクリップのマニフェスト。scripts/generate-voice.mjs が自動生成する（手で編集しない）。
 * トークン → public/assets/voice/ 内のファイル名。
 */
export const VOICE_CLIPS: Record<string, string> = ${JSON.stringify(manifest, null, 2)}
`
fs.writeFileSync(MANIFEST, ts)
console.log(`${jobs.length} clips → voiceManifest.ts generated`)

// ---- 英語クリップ（en-US ニューラル音声・子ども向けの明るい声）----
const MANIFEST_EN = path.join(root, '..', 'src', 'audio', 'voiceManifestEn.ts')
const enJobs = [
  // アルファベットは「文字の名前」で読ませたいので大文字＋ピリオド（B. → bee）
  ...EN_LETTERS.map(c => ({ token: c, text: `${c.toUpperCase()}.`, rate: '-8%' })),
  ...EN_WORDS.map(w => ({ token: w, text: w, rate: '-5%' })),
]
const enManifest = {}
try {
  const enTts = new MsEdgeTTS()
  await enTts.setMetadata('en-US-AnaNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  for (const { token, text, rate } of enJobs) {
    const file = `en-${token}.mp3`
    const out = path.join(DST, file)
    if (!fs.existsSync(out)) {
      const { audioStream } = await enTts.toStream(text, { rate })
      const chunks = []
      await new Promise((resolve, reject) => {
        audioStream.on('data', c => chunks.push(c))
        audioStream.on('end', resolve)
        audioStream.on('error', reject)
      })
      fs.writeFileSync(out, Buffer.concat(chunks))
      process.stdout.write(`${token} `)
    }
    enManifest[token] = file
  }
  console.log('')
} catch (e) {
  console.warn('英語クリップ生成をスキップ（ネットワーク/音声不可）:', e?.message ?? e)
  // 生成済みの en-*.mp3 があればそれだけ登録（無ければ空＝en-US 音声合成にフォールバック）
  for (const { token } of enJobs) {
    if (fs.existsSync(path.join(DST, `en-${token}.mp3`))) enManifest[token] = `en-${token}.mp3`
  }
}
const tsEn = `/**
 * 英語読み上げクリップのマニフェスト。scripts/generate-voice.mjs が自動生成する（手で編集しない）。
 * キー=英語トークン（小文字） → public/assets/voice/ 内のファイル名。
 * 空のときは Web Speech API（en-US）にフォールバックする。
 */
export const EN_VOICE_CLIPS: Record<string, string> = ${JSON.stringify(enManifest, null, 2)}
`
fs.writeFileSync(MANIFEST_EN, tsEn)
console.log(`${Object.keys(enManifest).length} en clips → voiceManifestEn.ts generated`)

// ---- ㉚「A for Apple」方式のアルファベットクリップ（例単語つき・ゆっくりはっきり）----
const MANIFEST_ABC = path.join(root, '..', 'src', 'audio', 'voiceManifestAbc.ts')
// english.ts の ABC_EXAMPLES（letter: { word: 'Apple' ... }）を解析
const abcExamples = {}
for (const m of englishSrc.matchAll(/([a-z]):\s*\{\s*word:\s*'([^']+)'/g)) abcExamples[m[1]] = m[2]
const abcJobs = EN_LETTERS.map(c => ({
  token: c,
  // 「レターネーム＋for＋例単語」。en-US 合成の弱点（N/M・B/D 等）を例単語で必ず区別できるように
  text: `${c.toUpperCase()} for ${abcExamples[c] ?? c.toUpperCase()}.`,
  rate: '-18%',
}))
const abcManifest = {}
try {
  const abcTts = new MsEdgeTTS()
  await abcTts.setMetadata('en-US-AnaNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  for (const { token, text, rate } of abcJobs) {
    const file = `en-abc-${token}.mp3`
    const out = path.join(DST, file)
    if (!fs.existsSync(out)) {
      const { audioStream } = await abcTts.toStream(text, { rate })
      const chunks = []
      await new Promise((resolve, reject) => {
        audioStream.on('data', c => chunks.push(c))
        audioStream.on('end', resolve)
        audioStream.on('error', reject)
      })
      fs.writeFileSync(out, Buffer.concat(chunks))
      process.stdout.write(`${token} `)
    }
    abcManifest[token] = file
  }
  console.log('')
} catch (e) {
  console.warn('abcクリップ生成をスキップ:', e?.message ?? e)
  for (const { token } of abcJobs) {
    if (fs.existsSync(path.join(DST, `en-abc-${token}.mp3`))) abcManifest[token] = `en-abc-${token}.mp3`
  }
}
const tsAbc = `/**
 * 「A for Apple」方式のアルファベット読み上げクリップ（㉚）。
 * scripts/generate-voice.mjs が自動生成する（手で編集しない）。
 * キー=小文字のアルファベット → public/assets/voice/ 内のファイル名（例: en-abc-a.mp3）。
 * 空のときは Web Speech API（en-US）で「letter for example」を読み上げるフォールバックになる。
 */
export const EN_ABC_CLIPS: Record<string, string> = ${JSON.stringify(abcManifest, null, 2)}
`
fs.writeFileSync(MANIFEST_ABC, tsAbc)
console.log(`${Object.keys(abcManifest).length} abc clips → voiceManifestAbc.ts generated`)
