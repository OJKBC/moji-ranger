/**
 * 既存の処理済みモンスター画像（public/assets/monsters/）から、番号＋現在名つきの
 * 一覧シートを作る（名前の確認・修正用）。原画の再処理はしない＝速い。
 *   node scripts/monster-sheet.mjs strong 78 135
 *   node scripts/monster-sheet.mjs weak 1 51
 */
import sharp from 'sharp'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const DST = path.join(root, '..', 'public', 'assets', 'monsters')
const NAMES = JSON.parse(fs.readFileSync(path.join(root, '..', 'src', 'data', 'monster-names.json'), 'utf8'))
const OUT_DIR = 'C:/Users/chiri/AppData/Local/Temp/claude/C--Users-chiri/644ad3a8-dbe9-4c69-bc2f-d9120996fa50/scratchpad'

const group = process.argv[2] ?? 'strong'
const from = Number(process.argv[3] ?? 1)
const to = Number(process.argv[4] ?? 60)
const prefix = `monster-${group}`

const CELL = 240
const LABEL_H = 40
const COLS = 5
const items = []
for (let n = from; n <= to; n++) {
  const id = `${prefix}-${n}`
  const file = path.join(DST, `${id}.png`)
  if (!fs.existsSync(file)) continue
  items.push({ n, id, name: NAMES[id] ?? '(仮名)' })
}
const rows = Math.ceil(items.length / COLS)
const W = COLS * CELL
const H = rows * (CELL + LABEL_H)

const composites = []
for (let i = 0; i < items.length; i++) {
  const { n, id, name } = items[i]
  const col = i % COLS
  const row = Math.floor(i / COLS)
  const left = col * CELL
  const top = row * (CELL + LABEL_H)
  const thumb = await sharp(path.join(DST, `${id}.png`))
    .resize({ width: CELL - 16, height: CELL - 16, fit: 'contain', background: { r: 245, g: 245, b: 250, alpha: 1 } })
    .png().toBuffer()
  composites.push({ input: thumb, left: left + 8, top: top + 8 })
  const label = Buffer.from(
    `<svg width="${CELL}" height="${LABEL_H}"><rect width="${CELL}" height="${LABEL_H}" fill="#1a1030"/>` +
    `<text x="${CELL / 2}" y="17" font-size="17" fill="#ffd94d" font-family="sans-serif" text-anchor="middle" font-weight="bold">${n}</text>` +
    `<text x="${CELL / 2}" y="35" font-size="16" fill="#ffffff" font-family="sans-serif" text-anchor="middle">${name}</text></svg>`,
  )
  composites.push({ input: label, left, top: top + CELL })
}

const outName = `msheet-${group}-${from}-${to}.png`
await sharp({ create: { width: W, height: H, channels: 4, background: { r: 230, g: 230, b: 238, alpha: 1 } } })
  .composite(composites)
  .png()
  .toFile(path.join(OUT_DIR, outName))
console.log(`${items.length} monsters → ${path.join(OUT_DIR, outName)}`)
