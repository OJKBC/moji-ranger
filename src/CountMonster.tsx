import { useCallback, useEffect, useRef, useState } from 'react'
import { EventBus } from './EventBus'
import { countLevel, readNumber, TEN_FRAME_SIZE } from './data/counting'
import type { CountMode } from './data/counting'
import { STRONG_MONSTER_IDS, monsterImageUrl } from './data/monsterNames'
import { recordAnswer, recordStageClear } from './store/progress'
import { sfx } from './audio/sfx'
import { voice } from './audio/voice'
import type { DifficultyLevel, Stage, StageResult } from './types'

interface Props {
  stage: Stage
  difficulty: DifficultyLevel
}

type Phase = 'collecting' | 'answering' | 'correct' | 'wrong' | 'done'

/** 1問ぶんの状態（モード別）。すべて「数える・見る・埋める」で解ける（暗算不要）。 */
interface Question {
  mode: CountMode
  /** 表示・読み上げの指示文 */
  prompt: string
  /** 読み上げ用トークン列（voice.speak を順に） */
  speak: string[]
  /** テンフレームに最初からいる数（count:0 / add:a / sub:a / make10:prefill） */
  base: number
  /** count/add: プールから足せる数 / sub: にがす数 / make10: 0（かたまり選択） */
  poolCount: number
  /** ひき算のとき true（テンフレームのモンスターをタップして「にがす」） */
  releaseMode: boolean
  /** 正解の数（count:target / add:a+b / sub:a-b / make10:10-prefill） */
  answer: number
  /** 答えの選択肢（addsub の「ぜんぶで？」/ make10 の「かたまり」）。空=できたボタン方式 */
  choices: number[]
  /** 選択肢が「かたまり（K匹の集まり）」か（make10）。false=数字カード（addsub） */
  chunkChoices: boolean
}

const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))
const shuffle = <T,>(a: T[]): T[] => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[r[i], r[j]] = [r[j], r[i]] } return r }

/** 答えの近傍から重複しない選択肢を作る（0未満/10超えは避ける・必ず正解を含む3つ） */
function numberChoices(answer: number, lo = 0, hi = 10): number[] {
  const set = new Set<number>([answer])
  const cands = shuffle([answer - 1, answer + 1, answer - 2, answer + 2])
  for (const c of cands) { if (set.size >= 3) break; if (c >= lo && c <= hi) set.add(c) }
  let n = lo
  while (set.size < 3) { if (n !== answer && n >= lo && n <= hi) set.add(n); n++ }
  return shuffle([...set]).slice(0, 3)
}

function makeQuestion(mode: CountMode, spec: ReturnType<typeof countLevel>): Question {
  if (mode === 'count') {
    const target = rand(spec.min, spec.max)
    return {
      mode, base: 0, poolCount: target + rand(1, 2), releaseMode: false,
      answer: target, choices: [], chunkChoices: false,
      prompt: `${target}こ あつめよう！`,
      speak: [readNumber(target), 'あつめよう'],
    }
  }
  if (mode === 'addsub') {
    const doSub = spec.includeSub && Math.random() < 0.5
    if (doSub) {
      const a = rand(Math.max(2, spec.min + 1), Math.min(10, spec.max + 3))
      const b = rand(1, a - 1)
      return {
        mode, base: a, poolCount: b, releaseMode: true,
        answer: a - b, choices: numberChoices(a - b, 0, 10), chunkChoices: false,
        prompt: `${a}こ いるね。${b}こ にがそう！`,
        speak: [readNumber(b), 'にがそう'],
      }
    }
    const a = rand(spec.min, spec.max)
    const b = rand(1, Math.max(1, Math.min(spec.max, 10 - a)))
    return {
      mode, base: a, poolCount: b, releaseMode: false,
      answer: a + b, choices: numberChoices(a + b, 1, 10), chunkChoices: false,
      prompt: `${a}こ いるね。もう ${b}こ あつめよう！`,
      speak: [readNumber(b), 'あつめよう'],
    }
  }
  // make10
  const prefill = rand(spec.min, spec.max)
  const need = TEN_FRAME_SIZE - prefill
  return {
    mode, base: prefill, poolCount: 0, releaseMode: false,
    answer: need, choices: numberChoices(need, 1, 9), chunkChoices: true,
    prompt: `あと なんこで 10 かな？`,
    speak: ['あとなんこでじゅう'],
  }
}

/**
 * かぞえて モンスター（暗算不要のさんすう入口）。
 * どのモードも「数える・増減を見る・10の枠を埋める」で解ける。共通の React 画面で動き、
 * ライフ制・スター・stage-clear/stage-failed・numberStats 記録・効果音/読み上げは既存を流用。
 */
export function CountMonster({ stage, difficulty }: Props) {
  const spec = countLevel(difficulty)
  const startAt = useRef(Date.now())
  // このプレイで使うモンスター（見た目の主役。つよい＝カラフルで魅力的）
  const [monsterId] = useState(() => STRONG_MONSTER_IDS[Math.floor(Math.random() * STRONG_MONSTER_IDS.length)] ?? 'monster-strong-1')

  const [round, setRound] = useState(0)
  const [lives, setLives] = useState(3)
  const [wrongCount, setWrongCount] = useState(0)
  const [q, setQ] = useState<Question>(() => makeQuestion(spec.mode, spec))
  const [phase, setPhase] = useState<Phase>('collecting')
  /** テンフレームに今いる数（base から増減する） */
  const [inFrame, setInFrame] = useState<number>(() => q.base)
  /** count/add で残っているプール（足せるモンスター）／sub で残りの「にがす回数」 */
  const [poolLeft, setPoolLeft] = useState<number>(() => q.poolCount)

  const url = monsterImageUrl(monsterId)

  const speakPrompt = useCallback((question: Question) => {
    // 指示文を順に読み上げ（数字クリップ＋フレーズクリップ。無ければ TTS フォールバック）
    let t = 0
    for (const tok of question.speak) {
      const delay = t
      window.setTimeout(() => voice.speak(tok), delay)
      t += 750
    }
  }, [])

  // 各問題の開始時: 状態リセット＋読み上げ
  const beginQuestion = useCallback((question: Question) => {
    setInFrame(question.base)
    setPoolLeft(question.poolCount)
    setPhase('collecting')
    startAt.current = Date.now()
    sfx.uiTap()
    window.setTimeout(() => speakPrompt(question), 250)
  }, [speakPrompt])

  useEffect(() => { beginQuestion(q); /* 初回のみ */ }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 自動テスト用（本番ビルドには影響しない）
  useEffect(() => {
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__countState = { difficulty, mode: spec.mode, round, phase }
    }
  })

  const totalRounds = spec.rounds

  const finish = useCallback((finalWrong: number) => {
    const stars: 1 | 2 | 3 = finalWrong <= 1 ? 3 : finalWrong <= 3 ? 2 : 1
    recordStageClear(stage.id, stars, difficulty)
    const result: StageResult = {
      stageId: stage.id, difficulty, rounds: totalRounds, wrongCount: finalWrong,
      maxCombo: 0, stars, playTimeMs: Math.round(Date.now() - startAt.current),
    }
    sfx.fanfare()
    voice.speak('よくできました')
    window.setTimeout(() => EventBus.emit('stage-clear', result), 1400)
    setPhase('done')
  }, [stage.id, difficulty, totalRounds])

  const nextRound = useCallback(() => {
    if (round + 1 >= totalRounds) { finish(wrongCount); return }
    const nq = makeQuestion(spec.mode, spec)
    setRound(r => r + 1)
    setQ(nq)
    beginQuestion(nq)
  }, [round, totalRounds, wrongCount, spec, beginQuestion, finish])

  const onCorrect = useCallback(() => {
    sfx.sparkle()
    voice.speak('せいかい')
    setPhase('correct')
    window.setTimeout(nextRound, 1500)
  }, [nextRound])

  const onWrong = useCallback(() => {
    sfx.wrong()
    voice.speak('もういちどかぞえてね')
    const nw = wrongCount + 1
    setWrongCount(nw)
    const nl = lives - 1
    setLives(nl)
    if (nl <= 0) {
      setPhase('done')
      window.setTimeout(() => EventBus.emit('stage-failed', { stageId: stage.id, difficulty }), 800)
    } else {
      setPhase('wrong')
      window.setTimeout(() => setPhase(q.choices.length ? 'answering' : 'collecting'), 1100)
    }
  }, [wrongCount, lives, q, stage.id, difficulty])

  // ---- 操作 ----

  // count/add: プールのモンスターを1匹つかまえる（テンフレームへ）。数唱を読み上げ。
  const grabOne = () => {
    if (phase !== 'collecting' || poolLeft <= 0 || q.releaseMode) return
    const next = inFrame + 1
    setInFrame(next)
    setPoolLeft(p => p - 1)
    sfx.pop()
    voice.speak(readNumber(q.mode === 'count' ? next : next)) // 通しで数える
  }

  // sub: テンフレームのモンスターを1匹にがす
  const releaseOne = () => {
    if (phase !== 'collecting' || !q.releaseMode || poolLeft <= 0) return
    setInFrame(v => v - 1)
    setPoolLeft(p => p - 1)
    sfx.fizzle()
  }

  // count/add で、入れすぎたら1匹もどす（やさしく取り消し）
  const undoOne = () => {
    if (phase !== 'collecting' || q.releaseMode || inFrame <= q.base) return
    setInFrame(v => v - 1)
    setPoolLeft(p => p + 1)
    sfx.uiTap()
  }

  // count: 「できた！」で数がちょうどか判定（罰しない＝ライフは減らさず、ちがえばやり直し）
  const checkCount = () => {
    if (phase !== 'collecting') return
    if (inFrame === q.answer) {
      recordAnswer(String(q.answer), 'number', true, Date.now() - startAt.current)
      onCorrect()
    } else {
      sfx.wrong()
      voice.speak('もういちどかぞえてね')
      setPhase('wrong')
      window.setTimeout(() => setPhase('collecting'), 1100)
    }
  }

  // addsub: 集め終え/にがし終えたら「ぜんぶで？/のこりは？」の数字カードを選ぶ
  const pickNumber = (n: number) => {
    if (phase !== 'answering') return
    const correct = n === q.answer
    recordAnswer(String(q.answer), 'number', correct, Date.now() - startAt.current)
    if (correct) onCorrect(); else onWrong()
  }

  // make10: かたまり（K匹）を選んでテンフレームに入れる → ちょうど10で成功
  const pickChunk = (k: number) => {
    if (phase !== 'collecting') return
    setInFrame(q.base + k)
    sfx.pop()
    const correct = q.base + k === TEN_FRAME_SIZE
    recordAnswer(String(q.answer), 'number', correct, Date.now() - startAt.current)
    window.setTimeout(() => {
      if (correct) { sfx.purify(); onCorrect() }
      else { onWrong(); setInFrame(q.base) } // 入れ直し
    }, 700)
  }

  // プール消化後、addsub は自動で「こたえをえらぶ」フェーズへ
  useEffect(() => {
    if (phase === 'collecting' && q.choices.length && !q.chunkChoices && poolLeft === 0
      && inFrame !== q.base) {
      const t = window.setTimeout(() => {
        setPhase('answering')
        voice.speak(q.releaseMode ? 'のこりはなんこ' : 'ぜんぶでなんこ')
      }, 600)
      return () => window.clearTimeout(t)
    }
  }, [phase, poolLeft, inFrame, q])

  // ---- 描画 ----

  const cells = Array.from({ length: TEN_FRAME_SIZE }, (_, i) => i < inFrame)
  const emptyToTen = TEN_FRAME_SIZE - inFrame

  return (
    <div className="count-screen">
      {/* ヘッダー: 指示＋🔊＋ハート */}
      <div className="count-header">
        <div className="count-prompt">
          <span>{q.prompt}</span>
          <button className="count-replay" onClick={() => { sfx.uiTap(); speakPrompt(q) }} aria-label="もういちど きく">🔊</button>
        </div>
        <div className="count-hearts">
          {[0, 1, 2].map(i => <span key={i}>{i < lives ? '💖' : '🤍'}</span>)}
        </div>
      </div>

      {/* テンフレーム（2×5＝10の枠）＋今の数 */}
      <div className="count-stage">
        <div className="tenframe">
          {cells.map((filled, i) => (
            <div key={i} className={`tf-cell ${filled ? 'filled' : ''} ${!filled && q.mode === 'make10' ? 'need' : ''}`}>
              {filled && (
                <img
                  src={url} alt="" className="tf-monster"
                  onClick={q.releaseMode ? releaseOne : (i >= q.base ? undoOne : undefined)}
                />
              )}
            </div>
          ))}
        </div>
        <div className="count-now">
          <span className="count-now-num">{inFrame}</span>
          {q.mode === 'make10' && phase === 'collecting' && (
            <span className="count-need">あと{emptyToTen}</span>
          )}
        </div>
      </div>

      {/* 操作エリア（モード別） */}
      <div className="count-actions">
        {phase === 'collecting' && q.mode !== 'make10' && !q.releaseMode && (
          <>
            <div className="count-pool">
              {Array.from({ length: poolLeft }, (_, i) => (
                <button key={i} className="pool-monster" onClick={grabOne} aria-label="つかまえる">
                  <img src={url} alt="" />
                </button>
              ))}
            </div>
            {q.mode === 'count' && (
              <button className="big-button count-done" onClick={checkCount}>✋ できた！</button>
            )}
          </>
        )}

        {phase === 'collecting' && q.releaseMode && (
          <p className="count-hint">モンスターを タップして {poolLeft}こ にがそう</p>
        )}

        {phase === 'collecting' && q.mode === 'make10' && (
          <div className="count-chunks">
            {shuffle(q.choices).map(k => (
              <button key={k} className="chunk-btn" onClick={() => pickChunk(k)}>
                <span className="chunk-monsters">
                  {Array.from({ length: k }, (_, i) => <img key={i} src={url} alt="" />)}
                </span>
                <span className="chunk-num">{k}</span>
              </button>
            ))}
          </div>
        )}

        {phase === 'answering' && (
          <div className="count-choices">
            {q.choices.map(n => (
              <button key={n} className="choice-num" onClick={() => pickNumber(n)}>{n}</button>
            ))}
          </div>
        )}

        {phase === 'correct' && <div className="count-feedback ok">🎉 せいかい！</div>}
        {phase === 'wrong' && <div className="count-feedback ng">もういちど かぞえてね</div>}
      </div>

      {/* すすみ具合 */}
      <div className="count-progress">
        {Array.from({ length: totalRounds }, (_, i) => (
          <span key={i} className={i < round ? 'done' : i === round ? 'now' : ''}>●</span>
        ))}
      </div>
    </div>
  )
}
