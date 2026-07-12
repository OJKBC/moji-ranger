/**
 * ② 新しい「よわい」モンスター「ぷにまる」を作る（原画がないため、既存のトーンに合わせた
 * 5歳が怖がらない可愛い系をベクター（SVG）で描いて PNG 化し、原画フォルダに置く）。
 * 実行後に prepare-monsters.mjs を回すと monster-weak-* に取り込まれ、ひらがな名で登録される。
 */
import sharp from 'sharp'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(root, '..', '..', '画像', 'モンスター', 'よわい', 'ぷにまる.png')

// 白背景（prepare-monsters の縁フラッドフィルで消える）＋濃いめの輪郭で可愛い丸いおばけ。
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
  <defs>
    <radialGradient id="body" cx="45%" cy="38%" r="70%">
      <stop offset="0%" stop-color="#8ff0e0"/>
      <stop offset="60%" stop-color="#57d6c4"/>
      <stop offset="100%" stop-color="#3fb9a8"/>
    </radialGradient>
    <radialGradient id="belly" cx="50%" cy="55%" r="55%">
      <stop offset="0%" stop-color="#f4fffb"/>
      <stop offset="100%" stop-color="#d6fbf2"/>
    </radialGradient>
  </defs>
  <rect width="640" height="640" fill="#ffffff"/>
  <!-- 影 -->
  <ellipse cx="320" cy="560" rx="150" ry="30" fill="#000000" opacity="0.10"/>
  <!-- あたまのちいさな芽 -->
  <path d="M320 120 q-8 -46 22 -66 q6 34 -22 66 z" fill="#8bd96b" stroke="#3f7a52" stroke-width="6" stroke-linejoin="round"/>
  <!-- からだ（まるいおばけ） -->
  <path d="M320 118
           C 470 118 520 250 520 360
           C 520 470 448 540 320 540
           C 192 540 120 470 120 360
           C 120 250 170 118 320 118 Z"
        fill="url(#body)" stroke="#2b8f80" stroke-width="10" stroke-linejoin="round"/>
  <!-- おなか -->
  <ellipse cx="320" cy="392" rx="120" ry="108" fill="url(#belly)"/>
  <!-- ほっぺ -->
  <circle cx="210" cy="360" r="34" fill="#ff9fc0" opacity="0.75"/>
  <circle cx="430" cy="360" r="34" fill="#ff9fc0" opacity="0.75"/>
  <!-- め -->
  <ellipse cx="256" cy="300" rx="34" ry="40" fill="#2c2b45"/>
  <ellipse cx="384" cy="300" rx="34" ry="40" fill="#2c2b45"/>
  <circle cx="268" cy="286" r="12" fill="#ffffff"/>
  <circle cx="396" cy="286" r="12" fill="#ffffff"/>
  <circle cx="248" cy="312" r="6" fill="#ffffff" opacity="0.9"/>
  <circle cx="376" cy="312" r="6" fill="#ffffff" opacity="0.9"/>
  <!-- くち（にっこり） -->
  <path d="M300 356 q20 26 40 0" fill="none" stroke="#2c2b45" stroke-width="9" stroke-linecap="round"/>
  <!-- ちいさなて -->
  <circle cx="140" cy="392" r="30" fill="#57d6c4" stroke="#2b8f80" stroke-width="9"/>
  <circle cx="500" cy="392" r="30" fill="#57d6c4" stroke="#2b8f80" stroke-width="9"/>
  <!-- ちいさなあし -->
  <ellipse cx="270" cy="536" rx="38" ry="24" fill="#57d6c4" stroke="#2b8f80" stroke-width="9"/>
  <ellipse cx="370" cy="536" rx="38" ry="24" fill="#57d6c4" stroke="#2b8f80" stroke-width="9"/>
</svg>`

await sharp(Buffer.from(svg)).png().toFile(OUT)
console.log('wrote', OUT)
