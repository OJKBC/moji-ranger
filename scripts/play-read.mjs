// ㊿「よむ」ステージの検証：
//  1) 音声認識が無い端末では地図に read-1 が出ない
//  2) 疑似 SpeechRecognition を注入すると出る／同意→出題→正解/誤答/認識失敗が動く
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? 'C:/Users/chiri/AppData/Local/Temp/claude/C--Users-chiri/644ad3a8-dbe9-4c69-bc2f-d9120996fa50/scratchpad'
const URL = process.argv[3] ?? 'http://localhost:5174/moji-ranger/'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--window-size=1024,720', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1024, height: 700 })
const errors = []
page.on('pageerror', e => { errors.push(e.message); console.log('[pageerror]', e.message) })

// --- フェーズ0: 疑似 SpeechRecognition を注入（毎ドキュメントに）。__nextRead で結果を制御 ---
await page.evaluateOnNewDocument(() => {
  window.__nextRead = ['あ'] // 次に「認識される」候補（[] なら unheard）
  class FakeRec {
    start() { setTimeout(() => {
      const alts = window.__nextRead ?? []
      if (alts.length && this.onresult) {
        const results = [Object.assign(alts.map(t => ({ transcript: t })), { length: alts.length })]
        this.onresult({ results })
      }
      if (this.onend) this.onend()
    }, 30) }
    stop() {} abort() {}
  }
  window.SpeechRecognition = FakeRec
  if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true })
})

await page.goto(URL, { waitUntil: 'networkidle2' })
await page.evaluate(() => localStorage.clear())

// --- フェーズ1: 音声認識を消した状態で read-1 が出ないこと（reload後・地図描画前に削除）---
await page.reload({ waitUntil: 'networkidle2' })
await page.evaluate(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition })
await sleep(500)
await page.evaluate(() => document.querySelector('button.big-button')?.click()) // タイトル→カテゴリ
await sleep(400)
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button, .category-card, [role=button]')].find(e => /にほんご/.test(e.textContent))
  b?.click()
})
await sleep(500)
const hasReadUnsupported = await page.evaluate(() =>
  [...document.querySelectorAll('.stage-card, .path-node')].some(e => /よむ/.test(e.textContent)))
console.log('unsupported端末で「よむ」表示:', hasReadUnsupported, '(期待: false)')

// --- フェーズ2: 音声認識ありで read-1 が出て、遊べること（reloadで疑似Recが再注入される） ---
await page.reload({ waitUntil: 'networkidle2' })
await sleep(500)
await page.evaluate(() => document.querySelector('button.big-button')?.click())
await sleep(400)
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button, .category-card, [role=button]')].find(e => /にほんご/.test(e.textContent))
  b?.click()
})
await sleep(500)
const hasReadSupported = await page.evaluate(() =>
  [...document.querySelectorAll('.stage-card, .path-node')].some(e => /よむ/.test(e.textContent)))
console.log('supported端末で「よむ」表示:', hasReadSupported, '(期待: true)')

// read-1 を開く
await page.evaluate(() => {
  const n = [...document.querySelectorAll('.stage-card, .path-node')].find(e => /よむ/.test(e.textContent))
  n?.click()
})
await sleep(600)
await page.screenshot({ path: `${OUT}/read-1-consent.png` })

// 同意画面 → はじめる
const consent = await page.evaluate(() => !!document.querySelector('.reading-consent'))
console.log('同意画面 表示:', consent)
await page.evaluate(() => [...document.querySelectorAll('.reading-consent .big-button')].find(b => /はじめる/.test(b.textContent))?.click())
await sleep(500)
await page.screenshot({ path: `${OUT}/read-2-play.png` })

const readTarget = () => page.evaluate(() => document.querySelector('.reading-word')?.textContent ?? null)
console.log('出題1:', await readTarget())

// (a) 認識失敗（unheard）→ 誤答にならずやり直しメッセージ
await page.evaluate(() => { window.__nextRead = [] })
await page.evaluate(() => document.querySelector('.reading-mic')?.click())
await sleep(300)
const unheardMsg = await page.evaluate(() => document.querySelector('.reading-message')?.textContent)
const heartsAfterUnheard = await page.evaluate(() => document.querySelectorAll('.reading-hearts .rh.on').length)
console.log('認識失敗後 message:', unheardMsg, '/ ハート:', heartsAfterUnheard, '(期待: 3=減らない)')

// (b) 正解を読み上げさせる → 次の出題へ進む
const t1 = await readTarget()
await page.evaluate(t => { window.__nextRead = [t] }, t1)
await page.evaluate(() => document.querySelector('.reading-mic')?.click())
await sleep(1700)
const t2 = await readTarget()
console.log('正解後の出題2:', t2, '(1問目と別 or 進行)')

// (c) 明確な誤答 → ハートが1減る
await page.evaluate(() => { window.__nextRead = ['ん'] === undefined ? [] : ['ゑゑゑ'] }) // ありえない読み
await page.evaluate(() => document.querySelector('.reading-mic')?.click())
await sleep(400)
const heartsAfterWrong = await page.evaluate(() => document.querySelectorAll('.reading-hearts .rh.on').length)
console.log('明確誤答後 ハート:', heartsAfterWrong, '(期待: 2)')

console.log('pageerrors:', errors.length)
await browser.close()
