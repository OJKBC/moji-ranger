/**
 * 選択肢（ディストラクター）の生成。
 * ひらがなステージでは選択肢をひらがなで揃える（数字・カタカナを混在させない）。
 * 難易度が上がったら（正答率が高いとき）似た文字を混ぜて識別練習にする。
 */

/** 形が似ていて混同しやすい文字のマップ */
export const CONFUSABLES: Record<string, string[]> = {
  'あ': ['お', 'め'],
  'お': ['あ', 'む'],
  'め': ['ぬ', 'あ'],
  'ぬ': ['め', 'ね'],
  'ね': ['れ', 'わ'],
  'れ': ['ね', 'わ'],
  'わ': ['れ', 'ね'],
  'さ': ['ち', 'き'],
  'ち': ['さ', 'ら'],
  'き': ['さ', 'ま'],
  'い': ['り', 'こ'],
  'り': ['い', 'け'],
  'う': ['つ', 'ら'],
  'つ': ['う', 'し'],
  'し': ['つ', 'も'],
  'こ': ['い', 'に'],
  'ん': ['そ', 'ろ'],
  'は': ['ほ', 'ま'],
  'ほ': ['は', 'ま'],
  'え': ['ん', 'そ'],
}

/** 見た目がはっきり区別できる、選択肢の母集団 */
const BASE_POOL = [
  'あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ',
  'さ', 'し', 'す', 'せ', 'そ', 'た', 'ち', 'つ', 'と', 'に',
  'ぬ', 'ね', 'の', 'は', 'ほ', 'ま', 'め', 'も', 'ら', 'り',
  'る', 'れ', 'わ', 'ん',
]

/**
 * ターゲット以外の選択肢を count 個選ぶ。
 * useConfusables=true なら似た文字を優先的に（最大2つ）混ぜる。
 */
export function pickDistractors(target: string, count: number, useConfusables: boolean): string[] {
  const picked: string[] = []
  if (useConfusables) {
    for (const c of CONFUSABLES[target] ?? []) {
      if (picked.length >= Math.min(2, count)) break
      if (c !== target && !picked.includes(c)) picked.push(c)
    }
  }
  const rest = BASE_POOL.filter(l => l !== target && !picked.includes(l))
  // Fisher–Yates シャッフル
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  while (picked.length < count && rest.length > 0) {
    picked.push(rest.pop()!)
  }
  return picked
}
