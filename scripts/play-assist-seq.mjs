// 修正検証: もじもじ（sequence）で「助け舟（選択肢-1）」が発動しても
// 単語の全文字（これから撃つ正解＝「あり」の「り」）が消えないことを確認する。
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? process.env.TEMP
const URL = process.argv[3] ?? 'http://localhost:5173/moji-ranger/'
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

// ログインボーナスのオーバーレイでテストが止まらないよう、今日は受取済みにしておく
const today = new Date()
const dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`
await page.evaluateOnNewDocument((d) => {
  localStorage.setItem('moji-ranger-progress', JSON.stringify({ schemaVersion: 7, lastBonusDate: d }))
}, dateKey)

await page.goto(URL, { waitUntil: 'networkidle2' })
await sleep(500)

// タイトル → にほんご → もじもじアトラクション
await page.evaluate(() => document.querySelector('button.big-button')?.click())
await sleep(600)
await page.evaluate(() => document.querySelectorAll('.category-card')[0]?.click()) // にほんご
await sleep(600)
await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('.path-node')]
  const t = nodes.find(n => n.querySelector('.path-node-name')?.textContent?.includes('もじもじ'))
  t?.click()
})
await sleep(2800)

const canvas = await page.$('canvas')
const box = await canvas.boundingBox()
const state = () => page.evaluate(() => window.__debugState ?? null)
const targets = () => page.evaluate(() => window.__debugTargets ?? [])
const GAME_W = 960, GAME_H = 640
const clickAt = async (x, y) => {
  await page.mouse.click(box.x + (x * box.width) / GAME_W, box.y + (y * box.height) / GAME_H)
}

// encounter で sequence の単語が並ぶまで待つ
let ready = null
for (let i = 0; i < 60; i++) {
  const s = await state()
  if (s?.phase === 'encounter' && s.stepActive && Array.isArray(s.seq) && s.seq.length >= 2 && s.purifyStep === 0) {
    ready = s; break
  }
  await sleep(300)
}
if (!ready) { console.log('RESULT: FAIL (単語ステージの開始を検出できず)'); await browser.close(); process.exit(1) }

const word = ready.word
const seq = ready.seq
console.log(`単語=「${word}」 全文字=[${seq.join(',')}] target(今撃つ)=「${ready.target}」 lives=${ready.lives}`)

// わざと2回、ダミー（単語の文字でない選択肢）を撃ってライフを1に落とす → 助け舟が発動
const shootDistractor = async (tag) => {
  const list = await targets()
  const distractor = list.find(t => !seq.includes(t.label))
  if (!distractor) { console.log(`(${tag}) ダミーが見つからない`); return false }
  console.log(`(${tag}) わざと誤答: 「${distractor.label}」を撃つ`)
  const ok = await page.evaluate(l => window.__shootLabel?.(l) ?? false, distractor.label)
  if (!ok) console.log(`(${tag}) __shootLabel 失敗`)
  await sleep(1400)
  return ok
}
await shootDistractor('1回目')
await sleep(600)
await shootDistractor('2回目') // ここで lives=1 → assistStruggling 発動
await sleep(1200)

const after = await state()
const aliveLabels = (await targets()).map(t => t.label)
console.log(`助け舟のあと: lives=${after?.lives} 生存バブル=[${aliveLabels.join(',')}]`)

const missing = seq.filter(ch => !aliveLabels.includes(ch))
const assistFired = after?.lives === 1
console.log(`単語の全文字が残っているか: ${missing.length === 0 ? 'YES' : 'NO (消えた: ' + missing.join(',') + ')'}`)

await page.screenshot({ path: `${OUT}/assist-seq-after.png` })

const pass = assistFired && missing.length === 0 && errors.length === 0
console.log(`\nRESULT: ${pass ? 'PASS ✅ 正解の文字は消えていない' : 'FAIL ❌'}`)
if (!assistFired) console.log('  - 注意: lives が1になっておらず助け舟が発動していない可能性')
await browser.close()
process.exit(pass ? 0 : 1)
