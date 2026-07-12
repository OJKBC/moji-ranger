// ㊿「よむ」ステージ（press-to-talk・単語のみ・タップフォールバック）の検証：
//  A) 対応端末: 出題は2文字以上の単語 / 押す→interim即正解 / タップは判定しない / final誤答のみ減点 / 認識失敗無罰
//  B) 非対応端末: 「よむ」は地図に出る（①⑩）/ 同意は出ない / タップで正解にできる
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
page.on('console', m => { if (m.type() === 'error') console.log('[console.err]', m.text().slice(0, 200)) })

await page.evaluateOnNewDocument(() => {
  // ログインボーナス（1日1回）はテストの localStorage.clear() で必ず claimable になり、
  // 対戦画面の上に被さって操作を止める。今日ぶんを受取済みにしてスキップさせる。
  try {
    const d = new Date()
    const pad = n => String(n).padStart(2, '0')
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const raw = localStorage.getItem('moji-ranger-progress')
    const p = raw ? JSON.parse(raw) : {}
    p.lastBonusDate = today
    localStorage.setItem('moji-ranger-progress', JSON.stringify(p))
  } catch {}
  window.__recs = []
  class FakeRec {
    constructor() { this.onresult = null; this.onerror = null; this.onend = null; this.maxAlternatives = 1 }
    start() { window.__recs = window.__recs.filter(r => r !== this); window.__recs.push(this) }
    stop() { if (this.onend) this.onend() }
    abort() {}
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

const st = () => page.evaluate(() => window.__debugState ?? null)
const press = () => page.evaluate(() => window.__readPress && window.__readPress())
const openJp = async () => {
  await page.evaluate(() => document.querySelector('button.big-button')?.click())
  await sleep(350)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, .category-card, [role=button]')].find(e => /にほんご/.test(e.textContent))
    b?.click()
  })
  await sleep(450)
}
const readShown = () => page.evaluate(() =>
  [...document.querySelectorAll('.stage-card, .path-node')].some(e => /よむ/.test(e.textContent)))

// ============ A) 対応端末 ============
await page.reload({ waitUntil: 'networkidle2' })
await sleep(400)
await openJp()
console.log('A) 対応端末で「よむ」表示:', await readShown(), '(期待 true)')
await page.evaluate(() => [...document.querySelectorAll('.stage-card, .path-node')].find(e => /よむ/.test(e.textContent))?.click())
await sleep(500)
const consent = await page.evaluate(() => !!document.querySelector('.reading-consent'))
console.log('   マイク同意画面:', consent, '(期待 true)')
await page.evaluate(() => [...document.querySelectorAll('.reading-consent .big-button')].find(b => /はじめる/.test(b.textContent))?.click())
for (let i = 0; i < 40; i++) { const s = await st(); if (s && s.stepActive && s.target) break; await sleep(150) }
await sleep(300)
await page.screenshot({ path: `${OUT}/read-A-game.png` })

// 出題は2文字以上の単語か（数回確認）
let minLen = 99, samples = []
for (let r = 0; r < 4; r++) {
  const before = await st(); if (!before?.stepActive) { await sleep(300); continue }
  const t = before.target; samples.push(t); minLen = Math.min(minLen, [...t].length)
  await press(); await sleep(30)
  await page.evaluate(x => window.__emitRead(x, false), t)
  for (let k = 0; k < 60; k++) { const n = await st(); if (n.stepActive && n.target !== t) break; await sleep(70) }
}
console.log('A) 出題語:', samples.join(' '), '/ 最短文字数:', minLen, '(期待 >=2)')

// タップは判定しない（中央バブル）
const box = await page.evaluate(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
let s = await st(); const c0 = s.sessionCorrect
await page.mouse.click(box.x + box.w * 0.5, box.y + box.h * 0.52)
await sleep(300)
let s2 = await st()
console.log('A) タップ→ correct:', s2.sessionCorrect, '(期待', c0, '=増えない)')

// final誤答 → ライフ-1
const bw = await st(); await press(); await page.evaluate(() => window.__emitRead('ゑゑゑ', true)); await sleep(1000)
const aw = await st()
console.log('A) final誤答→ ライフ:', aw.lives, '(期待', bw.lives - 1, ')')
// 認識失敗（空）→ 減らない
const bl = await st(); await press(); await page.evaluate(() => window.__emitRead('', true)); await sleep(300)
const al = await st()
console.log('A) 認識失敗(空)→ ライフ:', al.lives, '(期待', bl.lives, '=減らない)')

// ============ B) 非対応端末 ============
await page.reload({ waitUntil: 'networkidle2' })
await page.evaluate(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition })
await sleep(300)
await openJp()
console.log('B) 非対応端末で「よむ」表示:', await readShown(), '(期待 true=常に出す)')
await page.evaluate(() => [...document.querySelectorAll('.stage-card, .path-node')].find(e => /よむ/.test(e.textContent))?.click())
await sleep(500)
const consentB = await page.evaluate(() => !!document.querySelector('.reading-consent'))
console.log('B) マイク同意画面:', consentB, '(期待 false=非対応はスキップ)')
for (let i = 0; i < 40; i++) { const s3 = await st(); if (s3 && s3.stepActive && s3.target) break; await sleep(150) }
await sleep(300)
await page.screenshot({ path: `${OUT}/read-B-tap.png` })
const bt = await st()
await page.mouse.click(box.x + box.w * 0.5, box.y + box.h * 0.52) // タップで正解
await sleep(400)
const at = await st()
console.log('B) タップ→ correct:', at.sessionCorrect, '(期待', bt.sessionCorrect + 1, '=タップで正解)')

console.log('pageerrors:', errors.length)
await browser.close()
