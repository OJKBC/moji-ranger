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
await sleep(800)
await page.screenshot({ path: `${OUT}/1-title.png` })

const clicked = await page.evaluate(() => {
  const btn = document.querySelector('button.big-button')
  if (btn) { btn.click(); return btn.textContent }
  return null
})
console.log('clicked:', clicked)
await sleep(2500)
await page.screenshot({ path: `${OUT}/2-game.png` })

const canvas = await page.$('canvas')
if (canvas) {
  const box = await canvas.boundingBox()
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.45)
  await sleep(100)
  await page.screenshot({ path: `${OUT}/3-shoot.png` })
  await sleep(1500)
  await page.screenshot({ path: `${OUT}/4-after.png` })
} else {
  console.log('no canvas found')
}

await browser.close()
console.log('done')
