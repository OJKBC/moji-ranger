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

const HIRA = [
  'あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ',
  'さ', 'し', 'す', 'せ', 'そ', 'た', 'ち', 'つ', 'と', 'に',
  'ぬ', 'ね', 'の', 'は', 'ほ', 'ま', 'め', 'も', 'ら', 'り',
  'る', 'れ', 'わ', 'ん',
  // 単語（words.ts）に含まれる追加の文字
  'ぞ', 'ご', 'み', 'な', 'ぎ', 'だ', 'ひ',
]
const KATA = [
  'ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ',
  'サ', 'シ', 'ス', 'セ', 'ソ', 'タ', 'チ', 'ツ', 'ト', 'ニ',
  'ヌ', 'ネ', 'ノ', 'ハ', 'ホ', 'マ', 'メ', 'モ', 'ラ', 'リ',
  'ル', 'レ', 'ワ', 'ン',
]
/** 数字の読み（に・ご は文字クリップと同音なので共用） */
const DIGITS = ['いち', 'さん', 'よん', 'ろく', 'なな', 'はち', 'きゅう', 'じゅう']
/** 単語（words.ts と同期させること） */
const WORDS = [
  'ねこ', 'いぬ', 'ぞう', 'しか', 'うま',
  'りんご', 'みかん', 'すいか', 'さかな', 'うさぎ',
  'くだもの', 'ひまわり', 'にわとり', 'かまきり',
]
/** モンスターの名前（src/data/monsterNames.ts と同期させること） */
const MONSTER_NAMES = [
  'りゅうたん', 'かぶとん', 'ぱたぱた', 'いわごろ', 'とげまる', 'ぷにぷに',
  'いたずらん', 'もふにゃん', 'きのこん', 'ぷるりん', 'がおたん',
  'えんまおう', 'あおきば', 'やみりゅう', 'もりのぬし', 'わにごん', 'むらさきまる',
  'きんりゅう', 'がぶりん', 'おにごろう', 'ようがんまる', 'まどうし', 'こがねりゅう',
  'あかづのまる', 'りゅうきし', 'やみのおう',
]

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
}

/** ファイル名はコードポイントのスラッグ（Unicode ファイル名のURLトラブル回避） */
const slug = token => [...token].map(c => c.codePointAt(0).toString(16)).join('-')

// テンポ最優先: 普通の速さで発音させる（遅くしすぎると「し・・か・・」と間延びする）
const jobs = []
for (const t of [...HIRA, ...KATA]) jobs.push({ token: t, text: `${t}！`, rate: '-10%' })
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
