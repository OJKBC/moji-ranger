// ㊿「よむ」ステージ（共通エンジン・press-to-talk版）の検証：
//  1) 非対応端末では地図に read-1 が出ない／対応端末では出る
//  2) マイク同意→共通エンジンのゲーム画面（canvas）で遊べる
//  3) 「はなす」を押す→interim（途中経過）で正解が即成立＝finalを待たない（反応速度）
//  4) 不正解の確定は final のみ（interimのwrongでライフを減らさない）
//  5) 認識失敗（空）は誤答にしない
//  6) タップだけでは正解にならない（声のみ・(a)修正）
//  7) ボタンを押していないときは判定しない（雑音を誤答にしない・(b)(c)の根治）
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
console.log('4) 共通エンジンのcanvas:', canvasExists, '/ HUD(はなすボタン・きいてるよ)・両手・モンスターは共通（read-B-game.png）')

const press = () => page.evaluate(() => window.__readPress && window.__readPress())

// --- (7) ボタンを押していないとき（＝聞いていない）に雑音を送っても判定しない ---
let sN = await st()
const livesNoBtn = sN.lives, correctNoBtn = sN.sessionCorrect
await page.evaluate(t => window.__emitRead(t, true), sN.target) // ボタン未押下で正解読みを送っても…
await page.evaluate(() => window.__emitRead('ゑゑ', true)) // …雑音を送っても
await sleep(250)
let sN2 = await st()
console.log('7) ボタン未押下で送信 → correct:', sN2.sessionCorrect, '(期待', correctNoBtn, ') ライフ:', sN2.lives, '(期待', livesNoBtn, ')＝聞いていないので無反応')

// --- (6) タップ（ポインタ）だけでは正解にならない ---
const box = await page.evaluate(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
const s6 = await st()
// バブルは中央付近(GAME 480,335 相当)。canvas中央あたりをタップ
await page.mouse.click(box.x + box.w * 0.5, box.y + box.h * 0.52)
await sleep(300)
const s6b = await st()
console.log('6) 中央バブルをタップ → correct:', s6b.sessionCorrect, '(期待', s6.sessionCorrect, '=増えない) ライフ:', s6b.lives)

// --- (5) 認識失敗（空）は誤答にしない（ボタンを押して空を送る） ---
let s0 = await st()
const livesBefore = s0.lives
await press()
await page.evaluate(() => window.__emitRead('', true))
await sleep(250)
let s1 = await st()
console.log('5) 認識失敗(空)後 ライフ:', s1.lives, '(期待', livesBefore, '=減らない) / correct:', s1.sessionCorrect)

// --- (2)(3) 「はなす」を押す→interimで正解が即成立＝finalを待たない ---
let interimOk = 0, reactionMs = []
for (let round = 0; round < 3; round++) {
  const before = await st()
  if (!before || !before.stepActive) { await sleep(400); continue }
  const target = before.target
  await press() // はなすボタンを押す
  await sleep(30)
  const t0 = Date.now()
  await page.evaluate(t => window.__emitRead(t, false), target) // isFinal=false（途中経過）だけ
  let ok = false
  for (let k = 0; k < 20; k++) {
    const now = await st()
    if (now.sessionCorrect > before.sessionCorrect) { ok = true; reactionMs.push(Date.now() - t0); break }
    await sleep(20)
  }
  if (ok) interimOk++
  for (let k = 0; k < 80; k++) { const n = await st(); if (n.stepActive && n.target !== target) break; await sleep(80) }
}
console.log('3) 押す→interimのみで正解した回数:', interimOk, '/3 （finalを待たず即） 反応(ms):', reactionMs.join(','))

// --- (4) 不正解の確定は final のみ：interimのwrongでは減らない ---
const b2 = await st()
const livesPre = b2.lives
await press()
await page.evaluate(() => window.__emitRead('ゑゑ', false)) // interim wrong → 減らない
await sleep(300)
const midWrong = await st()
console.log('4) interimのwrong後 ライフ:', midWrong.lives, '(期待', livesPre, '=減らない)')
await press()
await page.evaluate(() => window.__emitRead('ゑゑ', true)) // final wrong → 1減る
await sleep(1000)
const afterWrong = await st()
console.log('4) finalのwrong後 ライフ:', afterWrong.lives, '(期待', livesPre - 1, ') wrongTotal:', afterWrong.wrongTotal)

console.log('pageerrors:', errors.length)
await browser.close()
