// 全ステージを自動プレイして、正解演出・リザルト・マップ・進捗保存を検証する開発用スクリプト
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

// タイトル → マップ
await page.evaluate(() => document.querySelector('button.big-button')?.click())
await sleep(700)
await page.screenshot({ path: `${OUT}/p2-map-before.png` })

/** いま始まっているステージをクリアまでプレイする（正解を自動で撃つ） */
async function playLoop(name) {
  await sleep(2200)
  let shots = 0
  for (let step = 0; step < 60; step++) {
    const done = await page.$('.result-heading')
    if (done) break
    // なかまボール: 投げ待ちになったら画面をタップして投げる
    const cap = await page.evaluate(() => window.__captureState ?? 'idle')
    if (cap === 'await-throw') {
      const canvas = await page.$('canvas')
      const box = await canvas.boundingBox()
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await sleep(1150)
      continue
    }
    const target = await page.evaluate(() => {
      const list = window.__debugTargets ?? []
      return list.find(t => t.correct) ?? null
    })
    if (target) {
      const canvas = await page.$('canvas')
      const box = await canvas.boundingBox()
      await page.mouse.click(box.x + (target.x * box.width) / 960, box.y + (target.y * box.height) / 640)
      shots++
    }
    await sleep(1150)
  }
  await sleep(2600)
  await page.screenshot({ path: `${OUT}/p2-${name}-result.png` })
  console.log(`${name}: cleared with ${shots} correct shots`)
}

/** リザルト画面のボタンを文言で押す */
async function clickResult(text) {
  await page.evaluate(t => {
    const btns = [...document.querySelectorAll('button')]
    btns.find(b => b.textContent.includes(t))?.click()
  }, text)
  await sleep(800)
}

// カード並び: [0]ひらがな [1]カタカナ(ひらがなLv3で解放) [2]もじもじ [3]さんすう（すうじは非表示）
// マップタップは常にLv1開始。Lv2/3へはリザルトの「⏫レベルn」ボタンで進む
await page.evaluate(() => document.querySelectorAll('.stage-card')[0]?.click())
await playLoop('stage1-lv1')
await clickResult('レベル2')
await playLoop('stage1-lv2')
await clickResult('レベル3')
await playLoop('stage1-lv3')
await clickResult('ステージマップ')
await page.screenshot({ path: `${OUT}/p2-map-mid.png` })

await page.evaluate(() => document.querySelectorAll('.stage-card')[1]?.click())
await playLoop('katakana-lv1')
await clickResult('ステージマップ')

await page.evaluate(() => document.querySelectorAll('.stage-card')[2]?.click())
await playLoop('stage2-words')
await clickResult('ステージマップ')

// さんすうバトルはゲーム画面キャプチャを1枚撮ってからそのまま最後までプレイ
await page.evaluate(i => document.querySelectorAll('.stage-card')[i]?.click(), 3)
await sleep(2600)
await page.screenshot({ path: `${OUT}/p2-stage4-game.png` })
await playLoop('stage4-math')
await clickResult('ステージマップ')
await page.screenshot({ path: `${OUT}/p2-map-after.png` })

// リロードして進捗が復元されるか（DoD）
await page.reload({ waitUntil: 'networkidle2' })
await sleep(600)
await page.evaluate(() => document.querySelector('button.big-button')?.click())
await sleep(700)
await page.screenshot({ path: `${OUT}/p2-map-reloaded.png` })

const progress = await page.evaluate(() => localStorage.getItem('moji-ranger-progress'))
console.log('progress:', progress)

await browser.close()
console.log('done')
