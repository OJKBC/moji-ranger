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

/**
 * 「音」が似ていて、読み上げだけでは判別しづらい文字のグループ。
 * 出題が音声のみのため、ターゲットと同じグループの文字は選択肢に出さない
 * （例: 「う」を狙うとき「ん」「ぬ」が選択肢にあると、正しく聞き取れていても迷う）。
 */
const SOUND_GROUPS: string[][] = [
  ['う', 'ん', 'む', 'ぬ', 'ふ'],
  ['え', 'ね', 'れ', 'め', 'へ'],
  ['し', 'ち', 'ひ'],
  ['い', 'り'],
  ['ま', 'な'],
  ['お', 'を'],
]

/** target と音が似ていて聞き分けにくい文字か */
export function isSoundSimilar(target: string, candidate: string): boolean {
  return SOUND_GROUPS.some(group => group.includes(target) && group.includes(candidate))
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
 * - ターゲットと「音が似ている」文字は除外する（出題は音声のみのため）
 * - useConfusables=true なら「形が似ている」文字を優先的に（最大2つ）混ぜる
 */
export function pickDistractors(target: string, count: number, useConfusables: boolean): string[] {
  const picked: string[] = []
  if (useConfusables) {
    for (const c of CONFUSABLES[target] ?? []) {
      if (picked.length >= Math.min(2, count)) break
      if (c !== target && !picked.includes(c) && !isSoundSimilar(target, c)) picked.push(c)
    }
  }
  const rest = BASE_POOL.filter(l => l !== target && !picked.includes(l) && !isSoundSimilar(target, l))
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
