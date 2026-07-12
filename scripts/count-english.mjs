import { readFileSync } from 'node:fs'
const src = readFileSync(new URL('../src/data/english.ts', import.meta.url), 'utf8')

// --- MEANING ---
function arr(name) {
  const re = new RegExp(`(?:const|let) ${name}\\b[\\s\\S]*?=\\s*\\[([\\s\\S]*?)\\n\\]`)
  const m = src.match(re)
  return m ? (m[1].match(/meaning:/g) || []).length : 0
}
const L1 = arr('MEAN_L1'), L2 = arr('MEAN_L2'), L3 = arr('MEAN_L3')
const E4 = arr('MEAN_L4_EXTRA'), E5 = arr('MEAN_L5_EXTRA'), E6 = arr('MEAN_L6_EXTRA'), E7 = arr('MEAN_L7_EXTRA')
const meaning = [L1, L2, L3, L3 + E4, L3 + E4 + E5, L3 + E4 + E5 + E6, L3 + E4 + E5 + E6 + E7]
console.log('MEANING per level 1..7:', meaning.join(' / '))

// --- SPELL --- isolate the SPELL_WORDS object, split by top-level level keys "  N: ["
const sw = src.slice(src.indexOf('SPELL_WORDS'), src.indexOf('MEAN_L1'))
const spell = []
const chunks = sw.split(/\n {2}\d:\s*\[/)
for (let i = 1; i < chunks.length; i++) spell.push((chunks[i].match(/word:/g) || []).length)
console.log('SPELL per level 1..7:', spell.join(' / '))

console.log('all meaning >=20:', meaning.every(n => n >= 20))
console.log('all spell   >=20:', spell.length === 7 && spell.every(n => n >= 20))
