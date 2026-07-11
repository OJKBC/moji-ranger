import { useCallback, useEffect, useRef, useState } from 'react'
import { voice } from './audio/voice'
import { sfx } from './audio/sfx'
import { recordAnswer, recordSeen, recordStageClear } from './store/progress'
import { WORDS } from './data/words'
import { HIRAGANA_SEION } from './data/kana'
import { WEAK_MONSTER_IDS, STRONG_MONSTER_IDS, monsterImageUrl } from './data/monsterNames'
import { getSpeechRecognitionCtor, judgeReading, type SpeechRec } from './speech'
import type { DifficultyLevel, Stage, StageResult } from './types'

const MIC_CONSENT_KEY = 'moji-ranger-mic-consent'

interface Props {
  stage: Stage
  level: DifficultyLevel
  onClear: (result: StageResult) => void
  onQuit: () => void
}

/** 難易度→読む文字数（1〜2=1文字, 3=2文字, 4=3文字 … 7=6文字） */
function charCountFor(level: DifficultyLevel): number {
  return level <= 2 ? 1 : Math.min(6, level - 1)
}

/** この回に読む対象（かな1文字 or その長さの単語）を n 個つくる。直前と同じは避ける。 */
function makeTargets(level: DifficultyLevel, n: number): string[] {
  const count = charCountFor(level)
  const words = WORDS.filter(w => [...w.word].length === count).map(w => w.word)
  const pool = count === 1 ? [...HIRAGANA_SEION] : (words.length ? words : null)
  const out: string[] = []
  let last = ''
  for (let i = 0; i < n; i++) {
    let t: string
    if (pool) {
      do { t = pool[Math.floor(Math.random() * pool.length)] } while (t === last && pool.length > 1)
    } else {
      t = Array.from({ length: count }, () => HIRAGANA_SEION[Math.floor(Math.random() * HIRAGANA_SEION.length)]).join('')
    }
    out.push(t); last = t
  }
  return out
}

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

/**
 * ㊿「よむ」ステージ。ひらがなを表示し、子どもが声に出して読む。
 * 判定はブラウザの音声認識（ja-JP）。幼児向けに寛容判定し、
 * 認識できなかったときは誤答にせず「もういちど いってみよう！」でやり直す。
 * ライフ制・浄化・読み上げ・称賛は共通エンジンに合わせ、ビームの代わりに「こえビーム」。
 */
export function ReadingStage({ stage, level, onClear, onQuit }: Props) {
  const total = (stage.battle?.enemyCount ?? 4) + 1 // ザコ＋ボス
  const targetsRef = useRef<string[]>(makeTargets(level, total))
  const monstersRef = useRef<string[]>(
    Array.from({ length: total }, (_, i) => (i === total - 1 ? pick(STRONG_MONSTER_IDS) : pick(WEAK_MONSTER_IDS))),
  )
  const [needConsent] = useState(() => localStorage.getItem(MIC_CONSENT_KEY) !== '1')
  const [phase, setPhase] = useState<'consent' | 'play'>(needConsent ? 'consent' : 'play')
  const [step, setStep] = useState(0)
  const [hearts, setHearts] = useState(3)
  const [listening, setListening] = useState(false)
  const [message, setMessage] = useState('マイクの ボタンを おして、こえに だして よんでね')
  const [beam, setBeam] = useState(false)
  const [purified, setPurified] = useState(false)

  const assistedRef = useRef(false)
  const wrongRef = useRef<string[]>([])
  const comboRef = useRef(0)
  const maxComboRef = useRef(0)
  const startAtRef = useRef(Date.now())
  const recRef = useRef<SpeechRec | null>(null)
  const doneRef = useRef(false)

  const target = targetsRef.current[step]
  const monsterId = monstersRef.current[step]
  const isBoss = step === total - 1

  const stopRec = useCallback(() => {
    try { recRef.current?.abort() } catch { /* noop */ }
    recRef.current = null
    setListening(false)
  }, [])

  // 出題ごとに「出題された」ことを記録し、お手本フラグをリセット
  useEffect(() => {
    if (phase !== 'play') return
    assistedRef.current = false
    recordSeen(target, 'hiragana')
    setMessage('マイクを おして、こえに だして よんでね')
  }, [step, phase, target])

  const finishClear = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    const wrongCount = wrongRef.current.length
    const stars: 1 | 2 | 3 = wrongCount <= 1 ? 3 : wrongCount <= 4 ? 2 : 1
    recordStageClear(stage.id, stars, level)
    const worst = wrongRef.current[0]
    onClear({
      stageId: stage.id,
      difficulty: level,
      rounds: total,
      wrongCount,
      maxCombo: maxComboRef.current,
      stars,
      playTimeMs: Date.now() - startAtRef.current,
      reviewItem: worst ? { text: worst, read: `これは、${worst}、だよ`, en: false } : undefined,
    })
  }, [stage.id, level, total, onClear])

  const nextStep = useCallback(() => {
    setPurified(false)
    if (step + 1 >= total) { finishClear(); return }
    setStep(s => s + 1)
  }, [step, total, finishClear])

  // 正解: こえビーム→浄化→次へ
  const onCorrect = useCallback(() => {
    sfx.sparkle()
    setTimeout(() => sfx.purify(), 300)
    voice.speak(`${target}！`)
    comboRef.current += 1
    maxComboRef.current = Math.max(maxComboRef.current, comboRef.current)
    recordAnswer(target, 'hiragana', true, undefined, assistedRef.current)
    setBeam(true); setMessage('よめたね！ ⭐')
    setTimeout(() => setBeam(false), 500)
    setTimeout(() => setPurified(true), 350)
    setTimeout(nextStep, 1400)
  }, [target, nextStep])

  // 明確に違う読み: やさしく訂正して誤答記録・ライフを1つ減らす
  const onWrong = useCallback(() => {
    comboRef.current = 0
    recordAnswer(target, 'hiragana', false)
    wrongRef.current.push(target)
    sfx.lifeLose()
    setMessage('おしいね。これは…')
    setTimeout(() => voice.speak(`これは、${target}、だよ`), 500)
    setHearts(h => {
      const next = h - 1
      if (next <= 0) {
        setTimeout(() => { voice.speak('また、あそぼうね！'); onQuit() }, 2200)
      } else {
        setTimeout(nextStep, 2400)
      }
      return Math.max(0, next)
    })
  }, [target, nextStep, onQuit])

  // 認識できなかった: 誤答にしない・やり直し
  const onUnheard = useCallback(() => {
    setMessage('もういちど いってみよう！')
  }, [])

  const handleHeard = useCallback((alts: string[]) => {
    const verdict = judgeReading(alts, target)
    if (verdict === 'ok') onCorrect()
    else if (verdict === 'wrong') onWrong()
    else onUnheard()
  }, [target, onCorrect, onWrong, onUnheard])

  const startListen = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor || listening) return
    const rec = new Ctor()
    rec.lang = 'ja-JP'; rec.continuous = false; rec.interimResults = false; rec.maxAlternatives = 3
    let got = false
    rec.onresult = e => {
      got = true
      const first = e.results[0]
      const alts: string[] = []
      for (let i = 0; i < first.length; i++) alts.push(first[i].transcript)
      handleHeard(alts)
    }
    rec.onerror = () => { /* no-mic/permission等。onend でやり直し案内 */ }
    rec.onend = () => { setListening(false); recRef.current = null; if (!got) onUnheard() }
    recRef.current = rec
    setListening(true)
    setMessage('きいてるよ… こえに だして よんでね')
    try { rec.start() } catch { setListening(false) }
  }, [listening, handleHeard, onUnheard])

  // お手本: 読み方を聞かせる（＝以後の正解は assisted 扱いで習熟に数えない）
  const playExample = useCallback(() => {
    sfx.uiTap()
    assistedRef.current = true
    voice.speak(`${target}！`)
    setMessage('おてほんの あとで、じぶんで いってみよう！')
  }, [target])

  useEffect(() => () => stopRec(), [stopRec])

  const acceptConsent = useCallback(() => {
    localStorage.setItem(MIC_CONSENT_KEY, '1')
    setPhase('play')
  }, [])

  if (phase === 'consent') {
    return (
      <div className="reading-stage">
        <div className="reading-consent">
          <h2>🎤 「よむ」の あそびかた</h2>
          <p className="reading-consent-lead">もじを こえに だして よむと、モンスターを きよめられるよ！</p>
          <p className="reading-consent-note">
            おうちのかたへ: このステージは <b>マイク</b> を つかいます。声は <b>この端末の中だけで判定</b>し、
            録音の保存・送信は一切しません。次の画面でマイクの使用を「許可」してください。
          </p>
          <button className="big-button" onClick={acceptConsent}>▶ はじめる</button>
          <button className="sub-button" onClick={onQuit}>やめる</button>
        </div>
      </div>
    )
  }

  return (
    <div className="reading-stage">
      <button className="back-button" onClick={() => { stopRec(); onQuit() }} aria-label="もどる">⬅</button>
      <div className="reading-hearts">{[0, 1, 2].map(i => <span key={i} className={i < hearts ? 'rh on' : 'rh'}>❤️</span>)}</div>
      <div className="reading-progress">{Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < step ? 'rp done' : i === step ? 'rp cur' : 'rp'} />
      ))}</div>

      <div className={`reading-monster ${purified ? 'purified' : ''} ${isBoss ? 'boss' : ''}`}>
        <img src={monsterImageUrl(monsterId)} alt="" />
      </div>

      <div className={`reading-card ${beam ? 'beam' : ''}`}>
        <span className="reading-word">{target}</span>
      </div>

      <p className="reading-message">{message}</p>

      <div className="reading-controls">
        <button className="reading-example" onClick={playExample}>🔊 おてほん</button>
        <button
          className={`reading-mic ${listening ? 'on' : ''}`}
          onClick={startListen}
          disabled={listening}
          aria-label="こえで よむ"
        >
          {listening ? '🎙️…' : '🎤 よむ'}
        </button>
      </div>
    </div>
  )
}
