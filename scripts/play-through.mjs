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

async function playStage(cardIndex, name) {
  await page.evaluate(i => document.querySelectorAll('.stage-card')[i]?.click(), cardIndex)
  await sleep(2200)
  let shots = 0
  for (let step = 0; step < 40; step++) {
    const done = await page.$('.result-heading')
    if (done) break
    const target = await page.evaluate(() => {
      const list = window.__debugTargets ?? []
      return list.find(t => t.correct) ?? null
    })
    if (target) {
      const canvas = await page.$('canvas')
      const box = await canvas.boundingBox()
      await page.mouse.click(box.x + (target.x * box.width) / 960, box.y + (target.y * box.height) / 640)
      shots++
      if (name === 'stage2' && shots === 2) {
        await sleep(500)
        await page.screenshot({ path: `${OUT}/p2-${name}-word.png` })
      }
      if (name === 'stage4' && shots === 1) {
        await sleep(400)
        await page.screenshot({ path: `${OUT}/p2-${name}-answer.png` })
      }
    }
    await sleep(1150)
  }
  await sleep(2600)
  await page.screenshot({ path: `${OUT}/p2-${name}-result.png` })
  console.log(`${name}: cleared with ${shots} correct shots`)
  // マップへ戻る
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    btns.find(b => b.textContent.includes('ステージマップ'))?.click()
  })
  await sleep(700)
}

// カード並び: [0]ひらがな [1]カタカナ(ひらがなLv3で解放) [2]ねこ [3]すうじ [4]さんすう
// ひらがなをLv1→2→3とクリアしてカタカナを解放し、全ステージを1回ずつ遊ぶ
await playStage(0, 'stage1-lv1')
await page.screenshot({ path: `${OUT}/p2-map-mid.png` })
await playStage(0, 'stage1-lv2')
await playStage(0, 'stage1-lv3')
await playStage(1, 'katakana-lv1')
await playStage(2, 'stage2')

// ステージ2クリア後のマップ途中経過（ゲーム画面キャプチャ用にステージ4を1枚）
await playStage(3, 'stage3')
await page.evaluate(i => document.querySelectorAll('.stage-card')[i]?.click(), 4)
await sleep(2200)
await page.screenshot({ path: `${OUT}/p2-stage4-game.png` })
// ステージ4はそのまま最後までプレイ
for (let step = 0; step < 40; step++) {
  const done = await page.$('.result-heading')
  if (done) break
  const target = await page.evaluate(() => (window.__debugTargets ?? []).find(t => t.correct) ?? null)
  if (target) {
    const canvas = await page.$('canvas')
    const box = await canvas.boundingBox()
    await page.mouse.click(box.x + (target.x * box.width) / 960, box.y + (target.y * box.height) / 640)
  }
  await sleep(1150)
}
await sleep(2600)
await page.screenshot({ path: `${OUT}/p2-stage4-result.png` })
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  btns.find(b => b.textContent.includes('ステージマップ'))?.click()
})
await sleep(700)
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
