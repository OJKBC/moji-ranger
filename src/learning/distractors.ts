/**
 * 選択肢（ディストラクター）の生成。
 * ひらがなステージは選択肢をひらがなで、カタカナステージはカタカナで揃える。
 * 難易度2以上（または正答率が高いとき）は似た文字を混ぜて識別練習にする。
 */
import { loadProgress } from '../store/progress'
import type { TargetKind } from '../types'

/** 形が似ていて混同しやすい文字のマップ（ひらがな） */
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
  'る': ['ろ', 'そ'],
  'ろ': ['る', 'そ'],
}

/** 形が似ていて混同しやすい文字のマップ（カタカナ。シ/ツ・ソ/ン・ク/ワが定番） */
export const KATAKANA_CONFUSABLES: Record<string, string[]> = {
  'シ': ['ツ', 'ソ', 'ン'],
  'ツ': ['シ', 'ソ', 'ン'],
  'ソ': ['ン', 'ツ', 'リ'],
  'ン': ['ソ', 'シ', 'リ'],
  'ク': ['ワ', 'タ', 'ケ'],
  'ワ': ['ク', 'フ', 'ウ'],
  'タ': ['ク', 'ナ', 'メ'],
  'ナ': ['メ', 'タ'],
  'メ': ['ナ', 'ノ'],
  'ウ': ['フ', 'ワ', 'ラ'],
  'フ': ['ウ', 'ラ', 'ヌ'],
  'ア': ['マ', 'ヤ'],
  'マ': ['ア', 'ム'],
  'ヤ': ['ア', 'セ'],
  'コ': ['ユ', 'ロ'],
  'ユ': ['コ', 'ヨ'],
  'ロ': ['コ', 'ル'],
  'イ': ['ト', 'リ'],
}

/**
 * 「音」が似ていて、読み上げだけでは判別しづらい文字のグループ。
 * 出題が音声のみのため、ターゲットと同じグループの文字は選択肢に出さない
 * （例: 「う」を狙うとき「ん」「ぬ」が選択肢にあると、正しく聞き取れていても迷う）。
 * カタカナも同じ音のグループを持つ（script が同じ文字同士でしか比較されない）。
 */
const SOUND_GROUPS: string[][] = [
  ['う', 'ん', 'む', 'ぬ', 'ふ'],
  ['え', 'ね', 'れ', 'め', 'へ'],
  ['し', 'ち', 'ひ'],
  ['い', 'り'],
  ['ま', 'な'],
  ['お', 'を'],
  ['ウ', 'ン', 'ム', 'ヌ', 'フ'],
  ['エ', 'ネ', 'レ', 'メ', 'ヘ'],
  ['シ', 'チ', 'ヒ'],
  ['イ', 'リ'],
  ['マ', 'ナ'],
  ['オ', 'ヲ'],
]

/** target と音が似ていて聞き分けにくい文字か */
export function isSoundSimilar(target: string, candidate: string): boolean {
  return SOUND_GROUPS.some(group => group.includes(target) && group.includes(candidate))
}

/** 見た目がはっきり区別できる、選択肢の母集団（ひらがな） */
const BASE_POOL = [
  'あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ',
  'さ', 'し', 'す', 'せ', 'そ', 'た', 'ち', 'つ', 'と', 'に',
  'ぬ', 'ね', 'の', 'は', 'ほ', 'ま', 'め', 'も', 'ら', 'り',
  'る', 'れ', 'わ', 'ん',
]

/** 選択肢の母集団（カタカナ） */
const BASE_POOL_KATAKANA = [
  'ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ',
  'サ', 'シ', 'ス', 'セ', 'ソ', 'タ', 'チ', 'ツ', 'ト', 'ニ',
  'ヌ', 'ネ', 'ノ', 'ハ', 'ホ', 'マ', 'メ', 'モ', 'ラ', 'リ',
  'ル', 'レ', 'ワ', 'ン',
]

function poolsFor(kind: TargetKind): { confusables: Record<string, string[]>; base: string[] } {
  return kind === 'katakana'
    ? { confusables: KATAKANA_CONFUSABLES, base: BASE_POOL_KATAKANA }
    : { confusables: CONFUSABLES, base: BASE_POOL }
}

/**
 * その子の letterStats に基づく「苦手スコア」。
 * 誤答が多い・熟達度が低い文字ほど高くなる（識別練習に優先して混ぜる）。
 */
function weaknessScore(label: string, stats: Record<string, { wrong: number; masteryLevel: number }>): number {
  const s = stats[label]
  return (s?.wrong ?? 0) * 2 + (5 - (s?.masteryLevel ?? 0))
}

export interface DistractorOptions {
  /** 文字種（選択肢を同じ文字種で揃える） */
  kind: TargetKind
  /** 似た文字を混ぜるか（難易度2以上は常に true。難易度1は正答率>85%で true） */
  useConfusables: boolean
  /**
   * 似た文字の選び方を「その子が苦手なペア優先」にする（難易度2以上）。
   * 既存 letterStats を参照し、固定ペアの羅列にしない。
   */
  preferWeakPairs?: boolean
  /** 選択肢に出さない文字（例: 単語つくりでは単語の構成文字すべて） */
  exclude?: string[]
}

/**
 * ターゲット以外の選択肢を count 個選ぶ。
 * - ターゲットと「音が似ている」文字は除外する（出題は音声のみのため）
 * - useConfusables=true なら「形が似ている」文字を優先的に（最大2つ）混ぜる
 */
export function pickDistractors(target: string, count: number, opts: DistractorOptions): string[] {
  const { confusables, base } = poolsFor(opts.kind)
  const excluded = new Set([target, ...(opts.exclude ?? [])])
  const picked: string[] = []
  if (opts.useConfusables) {
    let candidates = (confusables[target] ?? []).filter(
      c => !excluded.has(c) && !isSoundSimilar(target, c),
    )
    if (opts.preferWeakPairs && candidates.length > 1) {
      const stats = loadProgress().letterStats
      candidates = [...candidates].sort(
        (a, b) => weaknessScore(b, stats) + Math.random() - (weaknessScore(a, stats) + Math.random()),
      )
    }
    for (const c of candidates) {
      if (picked.length >= Math.min(2, count)) break
      if (!picked.includes(c)) picked.push(c)
    }
  }
  const rest = base.filter(l => !excluded.has(l) && !picked.includes(l) && !isSoundSimilar(target, l))
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
