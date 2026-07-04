/**
 * 素材前処理スクリプト（開発時に1回実行）
 *   node scripts/prepare-assets.mjs
 *
 * ../画像/ の原画から、ゲーム用に縮小・背景透過・圧縮した画像を
 * src/assets/ に生成する。原画を差し替えたら再実行するだけでよい。
 */
import sharp from 'sharp'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(root, '..', '..', '画像')
const DST = path.join(root, '..', 'src', 'assets')

/** エッジからのフラッドフィルで背景（ほぼ単色の地）を透過にする */
function removeBackground(data, width, height, tolerance = 26) {
  const idx = (x, y) => (y * width + x) * 4
  // 四隅の平均色を背景色とみなす
  const corners = [idx(0, 0), idx(width - 1, 0), idx(0, height - 1), idx(width - 1, height - 1)]
  const bg = [0, 1, 2].map(c => corners.reduce((s, i) => s + data[i + c], 0) / 4)
  const isBg = i =>
    Math.abs(data[i] - bg[0]) < tolerance &&
    Math.abs(data[i + 1] - bg[1]) < tolerance &&
    Math.abs(data[i + 2] - bg[2]) < tolerance
  const visited = new Uint8Array(width * height)
  const stack = []
  for (let x = 0; x < width; x++) { stack.push(x, 0, x, height - 1) }
  for (let y = 0; y < height; y++) { stack.push(0, y, width - 1, y) }
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
  // 縁のギザつき軽減：透明ピクセルに隣接する不透明ピクセルを少し柔らかく
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = idx(x, y)
      if (data[i + 3] === 0) continue
      const neighbors = [idx(x - 1, y), idx(x + 1, y), idx(x, y - 1), idx(x, y + 1)]
      if (neighbors.some(n => data[n + 3] === 0)) data[i + 3] = 180
    }
  }
}

async function processTransparent(srcName, dstName, targetWidth) {
  const resized = sharp(path.join(SRC, srcName)).resize({ width: targetWidth })
  const { data, info } = await resized.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  removeBackground(data, info.width, info.height)
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(path.join(DST, dstName))
  console.log(`${dstName}: ${info.width}x${info.height}`)
}

// 背景（透過不要なので JPEG で軽量化）
await sharp(path.join(SRC, '背景.png'))
  .resize({ width: 1366 })
  .jpeg({ quality: 82 })
  .toFile(path.join(DST, 'bg.jpg'))
console.log('bg.jpg done')

await processTransparent('ヒーロー.png', 'heroes.png', 1100)
await processTransparent('敵.png', 'enemies.png', 700)
console.log('done')
