/**
 * ㊿「よむ」ステージ用の音声認識（Web Speech API / SpeechRecognition）ユーティリティ。
 *
 * プライバシー: 判定はすべて端末内（ブラウザの音声認識）で行い、
 * 録音の保存・サーバー送信は一切しない。マイクは認識中だけ使う。
 *
 * 端末対応: SpeechRecognition は Chrome/Edge/Android では使えるが、
 * iOS Safari には無い（未対応）。isSpeechSupported() で機能検出し、
 * 非対応端末では「よむ」ステージをマップに出さない。
 */

/** 認識結果の1候補 */
export interface SpeechRecAlternative { transcript: string; confidence?: number }
/** 1発話ぶんの結果（isFinal=最終確定か、途中経過か） */
export interface SpeechRecResult extends ArrayLike<SpeechRecAlternative> { isFinal: boolean }
/** onresult に渡るイベント。resultIndex 以降が新着（continuous 認識で逐次増える） */
export interface SpeechRecEvent { resultIndex: number; results: ArrayLike<SpeechRecResult> }

/** 最低限の SpeechRecognition 型（標準 lib.dom に無い非標準APIのため自前定義） */
export interface SpeechRec {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechRecEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  onaudiostart?: (() => void) | null
}

/** ブラウザの SpeechRecognition コンストラクタ（無ければ null） */
export function getSpeechRecognitionCtor(): (new () => SpeechRec) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec
    webkitSpeechRecognition?: new () => SpeechRec
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** 「よむ」ステージが遊べる端末か（音声認識＋マイクAPIがある） */
export function isSpeechSupported(): boolean {
  return !!getSpeechRecognitionCtor()
    && typeof navigator !== 'undefined'
    && !!navigator.mediaDevices
}

/** カタカナ→ひらがな（認識結果の表記ゆれを吸収して比較する） */
function toHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

/** 小さいかな→大きいかな（きゃ≒きや・がっこう≒がこう などの揺れを吸収） */
const SMALL_TO_LARGE: Record<string, string> = {
  ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お',
  ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', ゎ: 'わ', ゕ: 'か', ゖ: 'け', っ: '',
}

/**
 * 比較用に正規化: ひらがな化・長音「ー」除去・小さいかなの揺れ吸収・かな以外（空白/記号/漢字/英字）除去。
 * ① 子どもの発音に寛容にするための下処理。
 */
export function normalizeReading(s: string): string {
  return toHira(s)
    .replace(/[^ぁ-ゖー]/g, '') // かな以外（空白・記号・漢字・英字）を除去
    .replace(/ー/g, '') // 長音符を除去
    .replace(/[ぁぃぅぇぉゃゅょゎゕゖっ]/g, c => SMALL_TO_LARGE[c] ?? c) // 小さいかなを大きいかなへ
}

/** レーベンシュタイン距離（1文字程度の言い間違いを許容するため） */
function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return dp[a.length][b.length]
}

/**
 * 幼児向けに寛容に判定する。
 * - 認識できなかった（空） → 'unheard'（やり直し。誤答にしない）
 * - 正しい読み・近い読み・一部一致・1文字違い → 'ok'
 * - 明確に違う読み → 'wrong'
 */
export function judgeReading(alternatives: string[], target: string): 'ok' | 'wrong' | 'unheard' {
  const t = normalizeReading(target)
  const cands = alternatives.map(normalizeReading).filter(Boolean)
  if (cands.length === 0) return 'unheard'
  for (const r of cands) {
    if (r === t) return 'ok'
    if (t.length >= 1 && (r.includes(t) || t.includes(r))) return 'ok' // 一部一致は正解扱い（寛容）
    if (t.length >= 2 && levenshtein(r, t) <= 1) return 'ok' // 1文字のゆれは許容
  }
  return 'wrong'
}
