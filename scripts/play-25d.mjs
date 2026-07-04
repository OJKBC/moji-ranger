// 2.5D 連戦→ボスステージ（ステージ1）の自動プレイ検証
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
await sleep(2600)
await page.screenshot({ path: `${OUT}/b1-approach.png` })

const canvas = await page.$('canvas')
const box = await canvas.boundingBox()
const state = () => page.evaluate(() => window.__debugState ?? null)
const targets = () => page.evaluate(() => window.__debugTargets ?? [])

const lettersSeen = []
let wrongDone = false
let shotCount = 0
let bossShotBanner = false

for (let step = 0; step < 220; step++) {
  const done = await page.$('.result-heading')
  if (done) break
  const s = await state()
  const list = await targets()
  const correct = list.find(t => t.correct)
  if (s?.phase === 'encounter' && correct) {
    if (!lettersSeen.includes(s.target)) lettersSeen.push(s.target)
    // 2体目でわざと1回誤答（やさしいフィードバックと統計の確認）
    if (s.enemyIndex === 1 && !wrongDone) {
      const wrong = list.find(t => !t.correct)
      if (wrong) {
        wrongDone = true
        await page.mouse.click(box.x + (wrong.x * box.width) / 960, box.y + (wrong.y * box.height) / 640)
        console.log(`enemy ${s.enemyIndex}: intentionally wrong 「${wrong.label}」 (target=${s.target})`)
        await sleep(500)
        await page.screenshot({ path: `${OUT}/b3-wrong.png` })
        await sleep(1000)
        continue
      }
    }
    if (s.boss && !bossShotBanner) {
      bossShotBanner = true
      await page.screenshot({ path: `${OUT}/b5-boss.png` })
    }
    await page.mouse.click(box.x + (correct.x * box.width) / 960, box.y + (correct.y * box.height) / 640)
    shotCount++
    console.log(`hit 「${s.target}」 (enemy=${s.enemyIndex}${s.boss ? ' BOSS' : ''}, step=${s.purifyStep})`)
    if (shotCount === 1) {
      await sleep(400)
      await page.screenshot({ path: `${OUT}/b2-firsthit.png` })
    }
    await sleep(900)
    continue
  }
  if (s?.pending === 'boss' && s?.phase !== 'encounter') {
    await page.screenshot({ path: `${OUT}/b4-omen.png` })
  }
  await sleep(500)
}

await sleep(500)
await page.screenshot({ path: `${OUT}/b6-result.png` })
console.log('letters practiced this run:', lettersSeen.join(' '))

const progress = await page.evaluate(() => localStorage.getItem('moji-ranger-progress'))
console.log('progress:', progress)

await browser.close()
console.log('done')
