/**
 * 国旗の用意スクリプト（開発時に実行・ネット不要）:
 *   node scripts/prepare-flags.mjs
 *
 * flag-icons（MIT ライセンス・npm パッケージ）の SVG 国旗を、
 * src/data/countries.ts に載っている国だけ、sharp で PNG 化して
 * public/assets/flags/<code>.png に書き出す（4:3 比・角丸なし・余白なし）。
 *
 * 外部通信は一切しない（同梱パッケージの SVG をローカルで変換するだけ）。
 * 国を増やしたら countries.ts に足して、このスクリプトを再実行する。
 */
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(root, '..', 'node_modules', 'flag-icons', 'flags', '4x3')
const DST = path.join(root, '..', 'public', 'assets', 'flags')
fs.mkdirSync(DST, { recursive: true })

// countries.ts から code を抽出（正規表現・依存を増やさない）
const countriesSrc = fs.readFileSync(path.join(root, '..', 'src', 'data', 'countries.ts'), 'utf8')
const codes = [...countriesSrc.matchAll(/code:\s*'([a-z]{2})'/g)].map(m => m[1])
const uniqueCodes = [...new Set(codes)]

const WIDTH = 240
const HEIGHT = 180 // 4:3

let made = 0
const missing = []
for (const code of uniqueCodes) {
  const svg = path.join(SRC, `${code}.svg`)
  if (!fs.existsSync(svg)) { missing.push(code); continue }
  const out = path.join(DST, `${code}.png`)
  await sharp(svg)
    .resize(WIDTH, HEIGHT, { fit: 'fill' })
    .png()
    .toFile(out)
  process.stdout.write(`${code} `)
  made++
}
console.log('')
console.log(`${made} flags → public/assets/flags/ (from flag-icons, MIT)`)
if (missing.length) console.warn('flag-icons に見つからないコード:', missing.join(', '))
