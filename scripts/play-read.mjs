// ㊿「よむ」ステージ（共通エンジン版）の検証：
//  1) 非対応端末では地図に read-1 が出ない／対応端末では出る
//  2) マイク同意→共通エンジンのゲーム画面（canvas）で遊べる
//  3) interim（途中経過）で正解が即成立する＝finalを待たない（反応速度）
//  4) 不正解の確定は final のみ（interimのwrongでライフを減らさない）
//  5) 認識失敗（空）は誤答にしない
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? 'C:/Users/chiri/AppData/Local/Temp/claude/C--Users-chiri/644ad3a8-dbe9-4c69-bc2f-d9120996fa50/scratchpad'
const URL = process.argv[3] ?? 'http://localhost:5174/moji-ranger/'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--window-size=1024,760', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1024, height: 740 })
const errors = []
page.on('pageerror', e => { errors.push(e.message); console.log('[pageerror]', e.message) })

// 疑似 SpeechRecognition を注入。window.__emitRead(text, isFinal) で結果を発火できる。
await page.evaluateOnNewDocument(() => {
  window.__recs = []
  class FakeRec {
    constructor() { this.onresult = null; this.onerror = null; this.onend = null; this._on = false }
    start() { this._on = true; window.__recs = window.__recs.filter(r => r !== this); window.__recs.push(this) }
    stop() { this._on = false; if (this.onend) this.onend() }
    abort() { this._on = false }
  }
  window.SpeechRecognition = FakeRec
  if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true })
  window.__emitRead = (text, isFinal) => {
    const rec = window.__recs[window.__recs.length - 1]
    if (!rec || !rec.onresult) return false
    const alts = text === '' ? [] : [{ transcript: text }]
    const result = Object.assign(alts, { isFinal: !!isFinal })
    rec.onresult({ resultIndex: 0, results: [result] })
    return true
  }
})

await page.goto(URL, { waitUntil: 'networkidle2' })
await page.evaluate(() => localStorage.clear())

// --- フェーズ1: 非対応端末で read-1 が出ないこと（reload後・地図描画前に削除）---
await page.reload({ waitUntil: 'networkidle2' })
await page.evaluate(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition })
await sleep(400)
await page.evaluate(() => document.querySelector('button.big-button')?.click())
await sleep(350)
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button, .category-card, [role=button]')].find(e => /にほんご/.test(e.textContent))
  b?.click()
})
await sleep(450)
const hasReadUnsupported = await page.evaluate(() =>
  [...document.querySelectorAll('.stage-card, .path-node')].some(e => /よむ/.test(e.textContent)))
console.log('1) 非対応端末で「よむ」表示:', hasReadUnsupported, '(期待 false)')

// --- フェーズ2: 対応端末（reloadで疑似Rec再注入）→ よむを開く ---
await page.reload({ waitUntil: 'networkidle2' })
await sleep(400)
await page.evaluate(() => document.querySelector('button.big-button')?.click())
await sleep(350)
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button, .category-card, [role=button]')].find(e => /にほんご/.test(e.textContent))
  b?.click()
})
await sleep(450)
const hasReadSupported = await page.evaluate(() =>
  [...document.querySelectorAll('.stage-card, .path-node')].some(e => /よむ/.test(e.textContent)))
console.log('1) 対応端末で「よむ」表示:', hasReadSupported, '(期待 true)')

await page.evaluate(() => {
  const n = [...document.querySelectorAll('.stage-card, .path-node')].find(e => /よむ/.test(e.textContent))
  n?.click()
})
await sleep(500)
const consent = await page.evaluate(() => !!document.querySelector('.reading-consent'))
console.log('   マイク同意画面:', consent, '(期待 true)')
await page.screenshot({ path: `${OUT}/read-A-consent.png` })
await page.evaluate(() => [...document.querySelectorAll('.reading-consent .big-button')].find(b => /はじめる/.test(b.textContent))?.click())

// 共通エンジンの canvas が立ち上がって出題が始まるまで待つ
const st = () => page.evaluate(() => window.__debugState ?? null)
for (let i = 0; i < 40; i++) { const s = await st(); if (s && s.stepActive && s.target) break; await sleep(150) }
await sleep(300)
await page.screenshot({ path: `${OUT}/read-B-game.png` })
const canvasExists = await page.evaluate(() => !!document.querySelector('canvas'))
console.log('4) 共通エンジンのcanvas:', canvasExists, '/ HUDマイク・両手・モンスターは共通（画像確認 read-B-game.png）')

// --- (5) 認識失敗（空）は誤答にしない ---
let s0 = await st()
const livesBefore = s0.lives
await page.evaluate(() => window.__emitRead('', true))
await sleep(250)
let s1 = await st()
console.log('5) 認識失敗(空)後 ライフ:', s1.lives, '(期待', livesBefore, '=減らない) / correct:', s1.sessionCorrect)

// --- (2)(3) interim(途中経過)で正解が即成立する＝finalを待たない ---
let interimOk = 0, reactionMs = []
for (let round = 0; round < 3; round++) {
  const before = await st()
  if (!before || !before.stepActive) { await sleep(400); continue }
  const target = before.target
  const t0 = Date.now()
  // isFinal=false（＝途中経過）だけを送る。finalは送らない。
  await page.evaluate(t => window.__emitRead(t, false), target)
  // sessionCorrect が増える＝interimで正解成立
  let ok = false
  for (let k = 0; k < 20; k++) {
    const now = await st()
    if (now.sessionCorrect > before.sessionCorrect) { ok = true; reactionMs.push(Date.now() - t0); break }
    await sleep(20)
  }
  if (ok) interimOk++
  // 次の出題へ進むのを待つ（敵が倒れて次の敵が来るまで＝前進あり・長めに待つ）
  for (let k = 0; k < 80; k++) { const n = await st(); if (n.stepActive && n.target !== target) break; await sleep(80) }
}
console.log('3) interimのみで正解成立した回数:', interimOk, '/3 （finalを待たず即） 反応(ms):', reactionMs.join(','))

// --- (3) 不正解の確定は final のみ：interimのwrongでは減らない ---
const b2 = await st()
const livesPre = b2.lives
const tgt = b2.target
// interim で明確に違う読みを送る → 減らないはず
await page.evaluate(() => window.__emitRead('ゑゑ', false))
await sleep(300)
const midWrong = await st()
console.log('3) interimのwrong後 ライフ:', midWrong.lives, '(期待', livesPre, '=減らない)')
// final で明確に違う読みを送る → 1減るはず
const preEmit = await st()
const emitted = await page.evaluate(() => window.__emitRead('ゑゑ', true))
await sleep(100)
const probe = await page.evaluate(() => window.__readProbe ?? null)
  const wprobe = await page.evaluate(() => window.__wrongProbe ?? null)
console.log('   [debug] emit final wrong:', emitted, 'preEmit stepActive=', preEmit.stepActive, 'target=', preEmit.target, 'probe=', JSON.stringify(probe), 'wrongProbe=', JSON.stringify(wprobe))
await sleep(1000)
const afterWrong = await st()
console.log('   finalのwrong後 ライフ:', afterWrong.lives, '(期待', livesPre - 1, ') wrongTotal:', afterWrong.wrongTotal, 'tgt=', tgt)

console.log('pageerrors:', errors.length)
await browser.close()
