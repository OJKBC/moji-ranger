import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { EventBus } from './EventBus'
import { countSpec } from './data/counting'
import type { CountMode, CountSpec } from './data/counting'
import { STRONG_MONSTER_IDS, WEAK_MONSTER_IDS, monsterImageUrl } from './data/monsterNames'
import { recordAnswer, recordStageClear } from './store/progress'
import { sfx } from './audio/sfx'
import { voice } from './audio/voice'
import type { DifficultyLevel, Stage, StageResult } from './types'

interface Props {
  stage: Stage
  difficulty: DifficultyLevel
}

type Phase = 'collecting' | 'zooming' | 'answering' | 'correct' | 'wrong' | 'done'

/** 1匹ぶんのモンスター（種類はバラバラ・少し傾けて散らす） */
interface Mon { key: number; id: string; rot: number }

let monKey = 0
const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))
const READ: Record<number, string> = {
  1: 'いち', 2: 'に', 3: 'さん', 4: 'よん', 5: 'ご', 6: 'ろく', 7: 'なな', 8: 'はち', 9: 'きゅう', 10: 'じゅう',
  11: 'じゅう いち', 12: 'じゅう に', 13: 'じゅう さん', 14: 'じゅう よん', 15: 'じゅう ご',
  16: 'じゅう ろく', 17: 'じゅう なな', 18: 'じゅう はち', 19: 'じゅう きゅう', 20: 'に じゅう',
}
const rn = (n: number) => READ[n] ?? String(n)
function shuffle<T>(a: T[]): T[] { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[r[i], r[j]] = [r[j], r[i]] } return r }

const SPECIES_POOL = [...STRONG_MONSTER_IDS, ...WEAK_MONSTER_IDS]
function makeMons(n: number): Mon[] {
  const pool = shuffle(SPECIES_POOL)
  return Array.from({ length: n }, (_, i) => ({ key: monKey++, id: pool[i % pool.length] ?? 'monster-strong-1', rot: rand(-12, 12) }))
}

function numberChoices(answer: number, lo = 0, hi = 20): number[] {
  const set = new Set<number>([answer])
  for (const c of shuffle([answer - 1, answer + 1, answer - 2, answer + 2])) {
    if (set.size >= 3) break
    if (c >= lo && c <= hi) set.add(c)
  }
  let n = lo
  while (set.size < 3) { if (n !== answer && n >= lo && n <= hi) set.add(n); n++ }
  return shuffle([...set]).slice(0, 3)
}

interface Question {
  mode: CountMode
  prompt: string
  speak: string
  answer: number
  /** count: あつめる目標 / addsub: 最初にいる数 / make10: 相手が出す数(a) */
  base: number
  /** addsub: ふえる/へる 数 */
  delta: number
  op: '+' | '-' | ''
  /** make10: 作る目標 T（a + answer = T） */
  target: number
  choices: number[]
}

function makeQuestion(spec: CountSpec, avoid: number): Question {
  if (spec.mode === 'count') {
    let target = rand(spec.countMin, spec.countMax)
    for (let i = 0; i < 8 && target === avoid && spec.countMax > spec.countMin; i++) target = rand(spec.countMin, spec.countMax)
    return { mode: 'count', answer: target, base: 0, delta: target, op: '', target, choices: [], prompt: `${target}こ あつめよう！`, speak: `${rn(target)}、こあつめよう` }
  }
  if (spec.mode === 'addsub') {
    const doSub = spec.includeSub && Math.random() < 0.5
    if (doSub) {
      const a = rand(3, Math.min(9, spec.addMax))
      const b = rand(1, a - 1)
      return { mode: 'addsub', answer: a - b, base: a, delta: b, op: '-', target: 0, choices: numberChoices(a - b, 0, 20), prompt: `ここに ${b}こ へったら なんこ？`, speak: `ここに、${rn(b)}、こへったらなんこ` }
    }
    let a = rand(1, spec.addMax - 1)
    let b = rand(1, Math.max(1, spec.addMax - a))
    if (a + b === avoid) { a = rand(1, spec.addMax - 1); b = rand(1, Math.max(1, spec.addMax - a)) }
    return { mode: 'addsub', answer: a + b, base: a, delta: b, op: '+', target: 0, choices: numberChoices(a + b, 1, 20), prompt: `ここに ${b}こ ふえたら なんこ？`, speak: `ここに、${rn(b)}、こふえたらなんこ` }
  }
  // make10（すうじをつくろう・バトル）: 相手が a を出す → 「a ＋ ● ＝ T」→ ● を選ぶ
  let T = rand(spec.targetMin, spec.targetMax)
  for (let i = 0; i < 8 && T === avoid && spec.targetMax > spec.targetMin; i++) T = rand(spec.targetMin, spec.targetMax)
  const answer = rand(1, Math.min(9, T - 1))
  const a = T - answer
  return { mode: 'make10', answer, base: a, delta: answer, op: '+', target: T, choices: numberChoices(answer, 1, 9), prompt: `なにを たしたら ${T}？`, speak: `なにをたしたら、${rn(T)}` }
}

/**
 * かぞえて系（暗算不要）。ステージ固定のモード（stage.countMode）。
 *   count  = スライドで集める
 *   addsub = ふえる/へる を自分でスライドして起こし、見えている数を数えて数字カードで答える
 *   make10 = 「すうじをつくろう」バトル。相手が出す a に対し「a ＋ ● ＝ T」の式が
 *            遠くからズームしてきて、3つの数字から ● を選ぶ
 */
export function CountMonster({ stage, difficulty }: Props) {
  const mode: CountMode = stage.countMode ?? 'count'
  const spec = countSpec(mode, difficulty)
  const startAt = useRef(Date.now())
  const lastAnswer = useRef(-1)

  const [round, setRound] = useState(0)
  const [lives, setLives] = useState(3)
  const [wrongCount, setWrongCount] = useState(0)
  const [q, setQ] = useState<Question>(() => makeQuestion(spec, -1))
  const [phase, setPhase] = useState<Phase>('collecting')
  const [herd, setHerd] = useState<Mon[]>([])
  const [pool, setPool] = useState<Mon[]>([])
  /** make10 バトルの相手（1匹） */
  const [opponent, setOpponent] = useState<Mon | null>(null)
  /** make10: 選んだ答え（式の空欄に入れて見せる） */
  const [picked, setPicked] = useState<number | null>(null)

  const speakPrompt = useCallback((question: Question) => { voice.speak(question.speak) }, [])

  const timers = useRef<number[]>([])
  const clearTimers = useCallback(() => { timers.current.forEach(id => window.clearTimeout(id)); timers.current = [] }, [])
  const later = useCallback((fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)) }, [])

  const beginQuestion = useCallback((question: Question) => {
    clearTimers()
    startAt.current = Date.now()
    setPicked(null)
    sfx.uiTap()
    if (question.mode === 'count') {
      setOpponent(null)
      setHerd([])
      setPool(makeMons(question.delta + rand(1, 3)))
      setPhase('collecting')
      later(() => speakPrompt(question), 300)
    } else if (question.mode === 'addsub') {
      // 最初にいる base はそのまま（勝手に増減しない）。子どもがスライドして ふえ/へり を起こす。
      setOpponent(null)
      setHerd(makeMons(question.base))
      setPool(question.op === '+' ? makeMons(question.delta) : [])
      setPhase('collecting')
      later(() => speakPrompt(question), 300)
    } else { // make10（すうじをつくろう・バトル）
      setHerd([]); setPool([])
      setOpponent(makeMons(1)[0])
      setPhase('zooming')
      later(() => speakPrompt(question), 500)
      later(() => setPhase('answering'), 1700) // 式が近づいてきてから選択肢
    }
  }, [speakPrompt, clearTimers, later])

  useEffect(() => { beginQuestion(q); return clearTimers }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__countState = { difficulty, mode, round, phase, herd: herd.length, answer: q.answer, target: q.target, base: q.base }
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
    lastAnswer.current = q.mode === 'make10' ? q.target : q.answer
    if (round + 1 >= totalRounds) { finish(wrongCount); return }
    const nq = makeQuestion(spec, lastAnswer.current)
    setRound(r => r + 1)
    setQ(nq)
    beginQuestion(nq)
  }, [round, totalRounds, wrongCount, spec, beginQuestion, finish, q])

  const onCorrect = useCallback(() => {
    sfx.sparkle()
    voice.speak('せいかい')
    setPhase('correct')
    later(nextRound, 1600)
  }, [nextRound, later])

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
      later(() => { setPicked(null); setPhase(q.mode === 'count' ? 'collecting' : 'answering') }, 1100)
    }
  }, [wrongCount, lives, q, stage.id, difficulty, later])

  // ---- count / addsub: スライド ----
  const grab = (m: Mon) => {
    if (phase !== 'collecting' || (q.mode !== 'count' && !(q.mode === 'addsub' && q.op === '+'))) return
    setPool(p => p.filter(x => x.key !== m.key))
    setHerd(c => [...c, m])
    sfx.pop()
  }
  const dropOut = (m: Mon) => {
    // count: 入れすぎを戻す / addsub-sub: にがす（指定数まで）
    if (phase !== 'collecting') return
    if (q.mode === 'count') { setHerd(c => c.filter(x => x.key !== m.key)); setPool(p => [...p, m]); sfx.uiTap() }
    else if (q.mode === 'addsub' && q.op === '-') {
      if (herd.length <= q.base - q.delta) return
      setHerd(c => c.filter(x => x.key !== m.key)); sfx.fizzle()
    }
  }
  const checkCount = () => {
    if (phase !== 'collecting' || q.mode !== 'count') return
    const ok = herd.length === q.answer
    recordAnswer(String(q.answer), 'number', ok, Date.now() - startAt.current)
    if (ok) onCorrect()
    else { sfx.wrong(); voice.speak('もういちどかぞえてね'); setPhase('wrong'); later(() => setPhase('collecting'), 1100) }
  }

  // ---- addsub: 数字カードで答える ----
  const pickNumber = (n: number) => {
    if (phase !== 'answering' || q.mode !== 'addsub') return
    const ok = n === q.answer
    recordAnswer(String(q.answer), 'number', ok, Date.now() - startAt.current)
    if (ok) onCorrect(); else onWrong()
  }

  // ---- make10（バトル）: 式の空欄に入れる数を選ぶ ----
  const pickBuild = (n: number) => {
    if (phase !== 'answering' || q.mode !== 'make10') return
    setPicked(n)
    const ok = n === q.answer
    recordAnswer(String(q.answer), 'number', ok, Date.now() - startAt.current)
    if (ok) { sfx.purify(); onCorrect() } else later(() => onWrong(), 500)
  }

  const resetRound = () => { if (phase === 'collecting') beginQuestion(q) }

  // addsub: スライドし終えたら数字カードへ
  useEffect(() => {
    if (phase !== 'collecting' || q.mode !== 'addsub') return
    const done = q.op === '+' ? pool.length === 0 : herd.length === q.base - q.delta
    if (done) {
      const id = window.setTimeout(() => { setPhase('answering'); voice.speak('なんこ') }, 500)
      return () => window.clearTimeout(id)
    }
  }, [phase, pool, herd, q])

  // ---- スライド（ドラッグ） ----
  const dropRef = useRef<HTMLDivElement>(null)
  const grabRef = useRef(grab); grabRef.current = grab
  const dropOutRef = useRef(dropOut); dropOutRef.current = dropOut
  type Drag = { mon: Mon; from: 'pool' | 'herd'; x: number; y: number }
  const dragRef = useRef<Drag | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)

  const startDrag = (e: ReactPointerEvent, m: Mon, from: 'pool' | 'herd') => {
    if (phase !== 'collecting') return
    if (q.mode === 'make10') return
    e.preventDefault()
    const d: Drag = { mon: m, from, x: e.clientX, y: e.clientY }
    dragRef.current = d; setDrag(d)
  }

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragRef.current) return
      const d = { ...dragRef.current, x: e.clientX, y: e.clientY }
      dragRef.current = d; setDrag(d)
    }
    const up = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      dragRef.current = null; setDrag(null)
      const dz = dropRef.current?.getBoundingClientRect()
      const inside = !!dz && e.clientX >= dz.left && e.clientX <= dz.right && e.clientY >= dz.top && e.clientY <= dz.bottom
      if (d.from === 'pool' && inside) grabRef.current(d.mon)
      else if (d.from === 'herd' && !inside) dropOutRef.current(d.mon)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
  }, [])

  const monImg = (m: Mon, cls: string, from?: 'pool' | 'herd') => (
    <img
      key={m.key} src={monsterImageUrl(m.id)} alt="" className={cls} draggable={false}
      style={{ transform: `rotate(${m.rot}deg)`, opacity: drag?.mon.key === m.key ? 0.3 : 1 }}
      onPointerDown={from ? e => startDrag(e, m, from) : undefined}
    />
  )

  const isSub = q.mode === 'addsub' && q.op === '-'

  return (
    <div className="count-screen">
      <div className="count-topbar">
        <div className="count-hearts">
          {[0, 1, 2].map(i => <span key={i}>{i < lives ? '💖' : '🤍'}</span>)}
        </div>
      </div>
      <div className="count-prompt">
        <span>{q.prompt}</span>
        <button className="count-replay" onClick={() => { sfx.uiTap(); speakPrompt(q) }} aria-label="もういちど きく">🔊</button>
      </div>

      {q.mode === 'make10' ? (
        // すうじをつくろう（バトル）: 相手＋式「a ＋ ？ ＝ T」が遠くからズームしてくる
        <div className="count-battle">
          {opponent && <img className="battle-foe" src={monsterImageUrl(opponent.id)} alt="" draggable={false} />}
          <div className={`count-equation ${phase === 'zooming' ? 'zoom' : 'here'}`}>
            <span className="eq-num">{q.base}</span>
            <span className="eq-op">＋</span>
            <span className={`eq-blank ${picked != null ? (picked === q.answer ? 'ok' : 'ng') : ''}`}>{picked ?? '？'}</span>
            <span className="eq-op">＝</span>
            <span className="eq-num eq-goal">{q.target}</span>
          </div>
        </div>
      ) : (
        <div className="count-body" ref={dropRef}>
          <div className={`count-herd ${q.mode === 'count' || q.op === '+' ? 'count-dropzone' : ''}`} aria-label="モンスター">
            {herd.map(m => monImg(m, 'count-mon', (q.mode === 'count' || isSub) ? 'herd' : undefined))}
          </div>
        </div>
      )}

      <div className="count-actions">
        {phase === 'collecting' && q.mode === 'count' && (
          <>
            <div className="drag-arrow" aria-hidden>⬆</div>
            <div className="count-pool">{pool.map(m => monImg(m, 'pool-mon', 'pool'))}</div>
            <button className="big-button count-done" onClick={checkCount}>✋ できた！</button>
          </>
        )}

        {phase === 'collecting' && q.mode === 'addsub' && q.op === '+' && (
          <>
            <div className="drag-arrow" aria-hidden>⬆</div>
            <div className="count-pool">{pool.map(m => monImg(m, 'pool-mon', 'pool'))}</div>
          </>
        )}
        {phase === 'collecting' && isSub && (
          <p className="count-hint">モンスターを そとに スライドして {q.delta}こ にがそう</p>
        )}

        {phase === 'answering' && (
          <div className="count-choices">
            {q.choices.map(n => (
              <button key={n} className="choice-num" onClick={() => q.mode === 'make10' ? pickBuild(n) : pickNumber(n)}>{n}</button>
            ))}
          </div>
        )}

        {phase === 'correct' && <div className="count-feedback ok">🎉 せいかい！</div>}
        {phase === 'wrong' && <div className="count-feedback ng">もういちど かぞえてね</div>}

        {phase === 'collecting' && q.mode !== 'make10' && (
          <button className="count-reset" onClick={resetRound} aria-label="やりなおし">🔄 やりなおし</button>
        )}
      </div>

      <div className="count-progress">
        {Array.from({ length: totalRounds }, (_, i) => (
          <span key={i} className={i < round ? 'done' : i === round ? 'now' : ''}>●</span>
        ))}
      </div>

      {drag && (
        <img className="count-mon drag-ghost" src={monsterImageUrl(drag.mon.id)} alt="" draggable={false} style={{ left: drag.x, top: drag.y }} />
      )}
    </div>
  )
}
