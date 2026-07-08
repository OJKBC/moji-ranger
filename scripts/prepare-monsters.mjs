/**
 * モンスター素材の前処理スクリプト（原画を差し替え/追加したら再実行）
 *   node scripts/prepare-monsters.mjs [--sheet]
 *
 * ../画像/モンスター/{よわい,つよい}/ の原画を背景透過・縮小して
 * public/assets/monsters/ に monster-weak-N.png / monster-strong-N.png として出力し、
 * src/game/monsterManifest.ts のグループ配列を自動生成する。
 * --sheet を付けると確認用の一覧シート（番号付き）も scratchpad に出力する。
 *
 * EXCLUDE に元ファイル名を入れると取り込み対象から外せる
 * （既存作品のキャラクター画像など、公開サイトに載せられないもの）。
 */
import sharp from 'sharp'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(root, '..', '..', '画像', 'モンスター')
const DST = path.join(root, '..', 'public', 'assets', 'monsters')
const MANIFEST = path.join(root, '..', 'src', 'game', 'monsterManifest.ts')
const SHEET_DIR = 'C:/Users/chiri/AppData/Local/Temp/claude/C--Users-chiri/644ad3a8-dbe9-4c69-bc2f-d9120996fa50/scratchpad'

/**
 * 取り込まない元ファイル名（部分一致）。理由をコメントで残すこと。
 * 既存アニメ作品のキャラクターと判別できる画像は、公開サイト（GitHub Pages）に
 * 組み込むと著作権上の問題になるため除外する。オリジナルの怪獣のみ採用。
 */
const EXCLUDE = [
  'portrait', // 既存ゲームのキャラクター画像そのもの
  'png-transparent', // 既存作品キャラ
  // --- つよい: 既存作品キャラと判別できるもの ---
  '00_00_23 (9).png',
  '00_10_50.png',
  '00_23_21 (6).png',
  '00_23_21 (8).png',
  '00_23_21 (9).png',
  '00_23_22 (10).png',
  '00_35_26 (1).png',
  '00_35_26 (2).png',
  '00_35_26 (3).png',
  '00_40_31 (8).png',
  '00_42_23 (1).png',
  '00_42_24 (3).png',
  '00_42_24 (4).png',
  '00_59_17 (8).png',
  // --- よわい: 既存作品のデザインに寄りすぎているもの ---
  '00_59_17 (1).png',
  '00_59_17 (2).png',
  '00_59_17 (4).png',
  '00_59_17 (5).png',
  // --- 2026-07-08 追加分の除外 ---
  '10_46_37 (3).png', // よわい: 既存作品キャラに酷似（ピンクの魔人）
  '10_46_37 (4).png', // つよい: 既存作品キャラに酷似（紫の猫神）
]

const groups = [
  { srcDir: 'よわい', prefix: 'monster-weak' },
  { srcDir: 'つよい', prefix: 'monster-strong' },
]

/**
 * 背景透過。四隅の平均色を背景とみなし、
 * - 彩度の高い背景（クロマ緑/マゼンタ）: 全画素を対象にキー
 *   （手足の間などの「閉じた背景ポケット」も消える）
 * - 白など彩度の低い背景: 縁からのフラッドフィルのみ
 *   （目のハイライト等、内側の白を消さないため）
 */
function floodKey(data, width, height, tolerance) {
  const idx = (x, y) => (y * width + x) * 4
  const corners = [idx(0, 0), idx(width - 1, 0), idx(0, height - 1), idx(width - 1, height - 1)]
  const bg = [0, 1, 2].map(c => corners.reduce((s, i) => s + data[i + c], 0) / 4)
  const isBg = i =>
    Math.abs(data[i] - bg[0]) < tolerance &&
    Math.abs(data[i + 1] - bg[1]) < tolerance &&
    Math.abs(data[i + 2] - bg[2]) < tolerance
  const chromaBg = Math.max(...bg) - Math.min(...bg) > 90
  if (chromaBg) {
    for (let p = 0; p < width * height; p++) {
      if (isBg(p * 4)) data[p * 4 + 3] = 0
    }
  } else {
    const visited = new Uint8Array(width * height)
    const stack = []
    for (let x = 0; x < width; x++) stack.push(x, 0, x, height - 1)
    for (let y = 0; y < height; y++) stack.push(0, y, width - 1, y)
    while (stack.length) {
      const y = stack.pop(), x = stack.pop()
      if (x < 0 || y < 0 || x >= width || y >= height) continue
      const p = y * width + x
      if (visited[p]) continue
      visited[p] = 1
      const i = p * 4
      if (!isBg(i)) continue
      data[i + 3] = 0
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1)
    }
  }
  // 縁のギザつき軽減＋背景色にじみ除去
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = idx(x, y)
      if (data[i + 3] === 0) continue
      const neighbors = [idx(x - 1, y), idx(x + 1, y), idx(x, y - 1), idx(x, y + 1)]
      if (neighbors.some(n => data[n + 3] === 0)) {
        data[i + 3] = Math.min(data[i + 3], 170)
        const r = data[i], g = data[i + 1], b = data[i + 2]
        const gn = g - Math.max(r, b)
        if (gn > 0) data[i + 1] = Math.max(r, b) + Math.round(gn * 0.3)
      }
    }
  }
}

fs.rmSync(DST, { recursive: true, force: true })
fs.mkdirSync(DST, { recursive: true })
const makeSheet = process.argv.includes('--sheet')

// 原画→出力番号の永続マッピング。**番号は一度割り当てたら変えない**
// （ずかんの「なかま」保存・モンスター名がIDに紐づくため。新規原画には空き番号を追加）
const MAP_PATH = path.join(root, 'monster-map.json')
const map = fs.existsSync(MAP_PATH) ? JSON.parse(fs.readFileSync(MAP_PATH, 'utf8')) : {}

const manifest = {}
for (const { srcDir, prefix } of groups) {
  const dir = path.join(SRC, srcDir)
  const files = fs.readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith('.png'))
    .filter(f => !EXCLUDE.some(e => f.includes(e)))
    .sort()
  // 既存の割当を尊重し、新規ファイルには最大番号+1 から振る
  let nextFree = Object.values(map)
    .filter(v => v.startsWith(`${prefix}-`))
    .reduce((mx, v) => Math.max(mx, Number(v.slice(prefix.length + 1))), 0) + 1
  const entries = []
  for (const f of files) {
    const mapKey = `${srcDir}/${f}`
    if (!map[mapKey]) map[mapKey] = `${prefix}-${nextFree++}`
    entries.push({ f, outName: `${map[mapKey]}.png`, n: Number(map[mapKey].slice(prefix.length + 1)) })
  }
  entries.sort((a, b) => a.n - b.n)

  const outNames = []
  const thumbs = []
  for (const { f, outName, n } of entries) {
    const resized = sharp(path.join(dir, f)).resize({ width: 640 })
    const { data, info } = await resized.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    floodKey(data, info.width, info.height, 42)
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toFile(path.join(DST, outName))
    outNames.push(outName)
    if (makeSheet) {
      const thumb = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
        .resize({ width: 150, height: 150, fit: 'contain', background: { r: 40, g: 30, b: 70, alpha: 1 } })
        .png().toBuffer()
      const label = Buffer.from(
        `<svg width="150" height="26"><rect width="150" height="26" fill="#000a"/><text x="6" y="19" font-size="16" fill="#fff" font-family="sans-serif">${n}: ${f.slice(16, 40)}</text></svg>`,
      )
      thumbs.push({ thumb, label, n })
    }
  }
  manifest[prefix] = outNames
  console.log(`${srcDir}: ${outNames.length}枚 → ${prefix}-*.png`)

  if (makeSheet && thumbs.length) {
    const cols = 6
    const rows = Math.ceil(thumbs.length / cols)
    const composites = thumbs.flatMap(({ thumb, label }, i) => [
      { input: thumb, left: (i % cols) * 155, top: Math.floor(i / cols) * 180 },
      { input: label, left: (i % cols) * 155, top: Math.floor(i / cols) * 180 + 150 },
    ])
    await sharp({ create: { width: cols * 155, height: rows * 180, channels: 4, background: { r: 20, g: 14, b: 40, alpha: 1 } } })
      .composite(composites)
      .jpeg({ quality: 88 })
      .toFile(path.join(SHEET_DIR, `sheet-${prefix}.jpg`))
    console.log(`sheet-${prefix}.jpg written`)
  }
}

// manifest を自動生成（手で編集せず、このスクリプトを再実行する）
const ts = `/**
 * モンスター画像のグループ別マニフェスト。
 * このファイルは scripts/prepare-monsters.mjs が自動生成する（手で編集しない）。
 * 画像を足すときは ../画像/モンスター/{よわい,つよい}/ に原画を置いて再実行するだけでよい。
 * ファイルは public/assets/monsters/ 配下（BASE_URL 経由で参照）。
 */
export const MONSTER_FILES = {
  weak: ${JSON.stringify(manifest['monster-weak'] ?? [], null, 2)},
  strong: ${JSON.stringify(manifest['monster-strong'] ?? [], null, 2)},
  /** ボス専用画像（空なら strong グループから選ぶ）。専用画像ができたらここに追加 */
  boss: [] as string[],
}
`
fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2))
fs.writeFileSync(MANIFEST, ts)
console.log('monsterManifest.ts generated')
