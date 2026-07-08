// 出題データの全カバー/件数チェック（報告用の実数を出す）。ネットワーク不要。
import fs from 'node:fs'
const rd = f => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
let fail = 0
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) fail++ }

// ---- kana.ts の各セットを取り出す
const kana = rd('src/data/kana.ts')
const arr = name => {
  const m = kana.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`))
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : []
}
const HS = arr('HIRAGANA_SEION'), HD = arr('HIRAGANA_DAKUTEN'), HH = arr('HIRAGANA_HANDAKUTEN'), HSm = arr('HIRAGANA_SMALL')
const KS = arr('KATAKANA_SEION'), KD = arr('KATAKANA_DAKUTEN'), KH = arr('KATAKANA_HANDAKUTEN'), KSm = arr('KATAKANA_SMALL')
const HP = [...HS, ...HD, ...HH, ...HSm], KP = [...KS, ...KD, ...KH, ...KSm]
console.log(`\n== ④ ひらがな/カタカナ ==`)
ok(HS.length === 46, `ひらがな清音 = ${HS.length}/46`)
ok(HD.length === 20 && HH.length === 5, `ひらがな 濁音${HD.length}/20・半濁音${HH.length}/5`)
ok(HSm.length >= 4, `ひらがな 小さい文字 = ${HSm.length}（ゃゅょっ等）`)
ok(KS.length === 46, `カタカナ清音 = ${KS.length}/46`)
ok(KD.length === 20 && KH.length === 5, `カタカナ 濁音${KD.length}/20・半濁音${KH.length}/5`)
ok(KSm.length >= 5, `カタカナ 小さい文字/長音 = ${KSm.length}（ャュョッ・ー等）`)
ok(new Set(HP).size === HP.length, `ひらがなプール重複なし（計${HP.length}）`)
ok(new Set(KP).size === KP.length, `カタカナプール重複なし（計${KP.length}）`)

// ---- 難易度による開放（poolStart=12 + poolBonus）で全カバーできるか
const diff = rd('src/data/difficulty.ts')
const pb = {}
for (const m of diff.matchAll(/(\d):\s*\{[^}]*poolBonus:\s*(\d+)/g)) pb[+m[1]] = +m[2]
const POOL_START = 12
const unlock = L => Math.min(HP.length, POOL_START + pb[L])
console.log(`\n   開放数(poolStart12+poolBonus): L1=${unlock(1)} L2=${unlock(2)} L3=${unlock(3)} L4=${unlock(4)} L5=${unlock(5)}`)
ok(12 + pb[3] >= 46, `L3で清音46を全開放（=${12 + pb[3]}）`)
ok(12 + pb[4] >= 46 + HD.length + HH.length, `L4で濁音・半濁音まで開放（=${12 + pb[4]} ≥ ${46 + HD.length + HH.length}）`)
ok(12 + pb[5] >= HP.length, `L5で全部（ひらがな${HP.length}）開放（=${12 + pb[5]}）`)
ok(12 + pb[5] >= KP.length, `L5で全部（カタカナ${KP.length}）開放（=${12 + pb[5]}）`)

// ---- stages.ts が kana プールを使っているか
const stages = rd('src/data/stages.ts')
ok(/letterPool:\s*HIRAGANA_POOL/.test(stages), 'stages: ひらがな = HIRAGANA_POOL')
ok(/letterPool:\s*KATAKANA_POOL/.test(stages), 'stages: カタカナ = KATAKANA_POOL')

// ---- 読みマップ（小さい文字・長音）
const reading = rd('src/data/reading.ts')
const smallRead = [...HSm, ...KSm].filter(c => new RegExp(`'${c}':`).test(reading))
ok(smallRead.length === HSm.length + KSm.length, `小さい文字/長音の読み定義 = ${smallRead.length}/${HSm.length + KSm.length}`)

// ---- distractors: 濁音・小さい文字がターゲット時に元の字を混ぜる（confusables キー）
const distr = rd('src/learning/distractors.ts')
ok(/BASE_POOL\s*=\s*\[[^\]]*'ん'/.test(distr), 'distractor母集団は清音のまま（低難易度で未習の濁音を出さない）')
ok(/for \(const ch of \[\.\.\.HIRAGANA_DAKUTEN/.test(distr), '濁音等→元の字の confusable を自動付与')

// ---- generate-voice が kana.ts を取り込むか
const gv = rd('scripts/generate-voice.mjs')
ok(/kanaArr\('HIRAGANA_SEION'\)/.test(gv) && /kanaArr\('HIRAGANA_SMALL'\)/.test(gv), 'generate-voice が kana.ts を全セット取り込み')

// ---- えいご abc
const en = rd('src/data/english.ts')
const abcEx = new Set([...en.matchAll(/\b([a-z]):\s*\{\s*word:/g)].map(m => m[1]))
console.log(`\n== ① えいご abc ==`)
ok(/\[\.\.\.lower,\s*\.\.\.upper\]/.test(en), 'abcLetters: 難易度3〜5で小文字26＋大文字26=52通り')
ok(abcEx.size === 26, `A for Apple 例単語 = ${abcEx.size}/26`)

// ---- えいご words（spell）
const spellBlock = en.slice(en.indexOf('SPELL_WORDS: Record'), en.indexOf('MEANING'))
const byLvl = {}
for (const m of spellBlock.matchAll(/(\d):\s*\[([\s\S]*?)\n  \]/g)) {
  byLvl[m[1]] = [...m[2].matchAll(/word:\s*'([a-z]+)'/g)].length
}
const spellTotal = Object.values(byLvl).reduce((a, b) => a + b, 0)
console.log(`\n== ② えいご words(spell) ==`)
ok(spellTotal >= 40, `合計 ${spellTotal}語（≥40）　内訳 ${JSON.stringify(byLvl)}（L1=3字/L2=4字/L3=5字/L4=6字/L5=7字）`)

// ---- えいご meaning
const meanWords = [...en.matchAll(/word:\s*'([a-z]+)',\s*meaning:\s*'([^']+)',\s*genre:\s*'([^']+)'/g)]
const uniqMean = new Set(meanWords.map(m => m[1]))
const byGenre = {}
for (const m of meanWords) byGenre[m[3]] = (byGenre[m[3]] || 0) + 1
console.log(`\n== ③ えいご meaning ==`)
ok(uniqMean.size >= 30, `ユニーク ${uniqMean.size}語（≥30）　ジャンル(のべ) ${JSON.stringify(byGenre)}`)

// ---- もじもじ（words.ts）
const w = rd('src/data/words.ts')
const words = [...w.matchAll(/word:\s*'([ぁ-ゖァ-ヺー]+)'/g)].map(m => m[1])
const wByLen = {}
for (const x of words) { const L = [...x].length; wByLen[L] = (wByLen[L] || 0) + 1 }
console.log(`\n== ⑤ もじもじアトラクション ==`)
ok(words.length >= 40, `合計 ${words.length}語（≥40）　文字数別 ${JSON.stringify(wByLen)}（2〜6文字）`)

console.log(`\n${fail === 0 ? '🎉 ALL PASS' : `❌ ${fail} 件 NG`}`)
process.exit(fail ? 1 : 0)
