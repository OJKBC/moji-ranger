/**
 * 見た目差し替え用の素材前処理スクリプト（原画を差し替えたら再実行）
 *   node scripts/prepare-visual-assets.mjs
 *
 * ../画像/ の原画（ベタ塗り背景つき）から、背景透過・縮小・圧縮した
 * ゲーム用画像を public/assets/ に生成する。
 * 出力ファイル名は src/game/assetManifest.ts の manifest と一致させること。
 *
 * 素材ごとの処理方針:
 * - lefthand / righthand … マゼンタ背景。マゼンタ優勢度のソフトキー＋色にじみ除去
 *   （指の間の閉じた背景ポケットも消えるよう、フラッドフィルではなくグローバルキー）
 * - monster1 … 緑背景に緑の本体。グローバルキーだと本体が消えるため、
 *   縁からのフラッドフィル（背景は縁と地続き）＋緑にじみ除去
 * - bubble … 緑背景が泡の内側にも透けて写る。緑優勢度のソフトキーで
 *   内側ごと半透明にする（シャボン玉としては正しい見え方になる）
 * - background1 … 透過不要。縮小して JPEG 化のみ
 */
import sharp from 'sharp'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(root, '..', '..', '画像')
const DST = path.join(root, '..', 'public', 'assets')
fs.mkdirSync(DST, { recursive: true })

/** 「left hand.png」のようなスペース入りの別名も受け付ける */
function findSrc(...names) {
  for (const n of names) {
    const p = path.join(SRC, n)
    if (fs.existsSync(p)) return p
  }
  throw new Error(`原画が見つかりません: ${names.join(' / ')} （${SRC}）`)
}

const smooth = (v, lo, hi) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)))

/**
 * マゼンタ（r・b が高く g が低い）をソフトに透過し、縁の紫かぶりを抑える。
 * 赤い袖（b 低）や青い手袋（r 低）は magenta 度が小さいので影響を受けない。
 */
function keyMagenta(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const m = Math.min(r, b) - g
    if (m <= 30) continue
    const cut = smooth(m, 30, 110)
    data[i + 3] = Math.round(data[i + 3] * (1 - cut))
    // 残った半透明ピクセルのマゼンタにじみを g に寄せて despill
    const spill = Math.round(m * 0.6)
    data[i] = Math.max(0, r - spill)
    data[i + 2] = Math.max(0, b - spill)
  }
}

/** 緑優勢（g が r・b より高い）をソフトに透過。シャボン玉用 */
function keyGreen(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const gn = g - Math.max(r, b)
    if (gn <= 22) continue
    const cut = smooth(gn, 22, 85)
    data[i + 3] = Math.round(data[i + 3] * (1 - cut))
    data[i + 1] = Math.max(r, b) + 22 // 緑にじみ除去
  }
}

/** 縁から地続きのほぼ単色背景をフラッドフィルで透過（prepare-assets.mjs と同方式） */
function floodKey(data, width, height, tolerance) {
  const idx = (x, y) => (y * width + x) * 4
  const corners = [idx(0, 0), idx(width - 1, 0), idx(0, height - 1), idx(width - 1, height - 1)]
  const bg = [0, 1, 2].map(c => corners.reduce((s, i) => s + data[i + c], 0) / 4)
  const isBg = i =>
    Math.abs(data[i] - bg[0]) < tolerance &&
    Math.abs(data[i + 1] - bg[1]) < tolerance &&
    Math.abs(data[i + 2] - bg[2]) < tolerance
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

async function processImage(srcPath, dstName, targetWidth, keyFn, { trim = false } = {}) {
  const resized = sharp(srcPath).resize({ width: targetWidth })
  const { data, info } = await resized.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  keyFn(data, info.width, info.height)
  let img = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
  if (trim) img = img.trim({ threshold: 10 })
  await img.png({ compressionLevel: 9, palette: true, quality: 92 }).toFile(path.join(DST, dstName))
  const st = fs.statSync(path.join(DST, dstName))
  console.log(`${dstName}: ${info.width}x${info.height} (${Math.round(st.size / 1024)}KB)`)
}

// 背景（透過不要・JPEG で軽量化）
await sharp(findSrc('background1.png'))
  .resize({ width: 1600 })
  .jpeg({ quality: 84 })
  .toFile(path.join(DST, 'background1.jpg'))
console.log('background1.jpg done')

await processImage(findSrc('lefthand.png', 'left hand.png'), 'lefthand.png', 620, keyMagenta, { trim: true })
// 右手は指先座標をコード側で比率指定するため trim しない（座標がずれる）
await processImage(findSrc('righthand.png', 'right hand.png'), 'righthand.png', 560, keyMagenta)
await processImage(findSrc('monster1.png'), 'monster1.png', 640, (d, w, h) => floodKey(d, w, h, 42))
await processImage(findSrc('bubble.png'), 'bubble.png', 300, keyGreen, { trim: true })
console.log('done')
