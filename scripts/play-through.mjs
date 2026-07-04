// 8ラウンド自動プレイして正解演出〜リザルトまで確認する開発用スクリプト
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
await sleep(600)
await page.evaluate(() => document.querySelector('button.big-button')?.click())
await sleep(2000)

for (let round = 0; round < 8; round++) {
  const target = await page.evaluate(() => {
    const list = window.__debugTargets ?? []
    return list.find(t => t.correct) ?? null
  })
  if (!target) { console.log(`round ${round}: no target found`); break }
  const canvas = await page.$('canvas')
  const box = await canvas.boundingBox()
  const scaleX = box.width / 960
  const scaleY = box.height / 640
  await page.mouse.click(box.x + target.x * scaleX, box.y + target.y * scaleY)
  console.log(`round ${round}: hit 「${target.label}」 at (${Math.round(target.x)}, ${Math.round(target.y)})`)
  if (round === 0) {
    await sleep(300)
    await page.screenshot({ path: `${OUT}/5-hit.png` })
  }
  await sleep(1500)
}

await sleep(2500)
await page.screenshot({ path: `${OUT}/6-result.png` })

// localStorage の学習記録も検証する
const progress = await page.evaluate(() => localStorage.getItem('moji-ranger-progress'))
console.log('progress:', progress)

await browser.close()
console.log('done')
