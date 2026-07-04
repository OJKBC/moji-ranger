// 2.5D オンレール対峙ステージ（ステージ1）の自動プレイ検証
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? 'C:/Users/chiri/AppData/Local/Temp/claude/C--Users-chiri/86c721f7-617a-43df-b8e7-f2425f7adb14/scratchpad'
const URL = process.argv[3] ?? 'http://localhost:5174/moji-ranger/'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--window-size=1024,720', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1024, height: 700 })
page.on('pageerror', e => console.log('[pageerror]', e.message))

await page.goto(URL, { waitUntil: 'networkidle2' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle2' })
await sleep(600)

await page.evaluate(() => document.querySelector('button.big-button')?.click())
await sleep(700)
await page.evaluate(() => document.querySelectorAll('.stage-card')[0]?.click())
await sleep(2300)
await page.screenshot({ path: `${OUT}/r1-ride.png` })

// 対峙開始まで待つ
for (let i = 0; i < 30; i++) {
  const state = await page.evaluate(() => window.__debugState ?? null)
  if (state?.phase === 'encounter') break
  await sleep(400)
}
console.log('encounter reached:', await page.evaluate(() => JSON.stringify(window.__debugState)))
await sleep(2600) // 敵登場＋バブル出現待ち
await page.screenshot({ path: `${OUT}/r2-encounter.png` })

// 3回浄化する
const canvas = await page.$('canvas')
const box = await canvas.boundingBox()
for (let step = 0; step < 3; step++) {
  // バブルが出るまで待つ
  let target = null
  for (let i = 0; i < 20; i++) {
    target = await page.evaluate(() => (window.__debugTargets ?? []).find(t => t.correct) ?? null)
    if (target) break
    await sleep(300)
  }
  if (!target) { console.log(`step ${step}: no target!`); break }
  // 1回だけ誤答も試す（やさしいフィードバックと統計の確認）
  if (step === 1) {
    const wrong = await page.evaluate(() => (window.__debugTargets ?? []).find(t => !t.correct) ?? null)
    if (wrong) {
      await page.mouse.click(box.x + (wrong.x * box.width) / 960, box.y + (wrong.y * box.height) / 640)
      console.log(`step ${step}: intentionally hit wrong 「${wrong.label}」`)
      await sleep(600)
      await page.screenshot({ path: `${OUT}/r3-wrong.png` })
      await sleep(900)
    }
  }
  target = await page.evaluate(() => (window.__debugTargets ?? []).find(t => t.correct) ?? null)
  await page.mouse.click(box.x + (target.x * box.width) / 960, box.y + (target.y * box.height) / 640)
  console.log(`step ${step}: hit 「${target.label}」`)
  if (step === 0) {
    await sleep(450)
    await page.screenshot({ path: `${OUT}/r4-purify1.png` })
  }
  if (step === 2) {
    await sleep(1300)
    await page.screenshot({ path: `${OUT}/r5-purified.png` })
  }
  await sleep(1400)
}

// 前進再開 → ゴール → リザルトまで待つ
for (let i = 0; i < 40; i++) {
  const done = await page.$('.result-heading')
  if (done) break
  const state = await page.evaluate(() => JSON.stringify(window.__debugState ?? null))
  if (i % 5 === 0) console.log('waiting...', state)
  await sleep(500)
}
await sleep(400)
await page.screenshot({ path: `${OUT}/r6-result.png` })

const progress = await page.evaluate(() => localStorage.getItem('moji-ranger-progress'))
console.log('progress:', progress)

await browser.close()
console.log('done')
