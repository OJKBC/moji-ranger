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

type Phase = 'showing' | 'collecting' | 'answering' | 'correct' | 'wrong' | 'done'

/** 1匹ぶんのモンスター（種類はバラバラ・少し傾けて散らす） */
interface Mon { key: number; id: string; rot: number }

let monKey = 0
const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))
/** 数字の読み（1〜20） */
const READ: Record<number, string> = {
  1: 'いち', 2: 'に', 3: 'さん', 4: 'よん', 5: 'ご', 6: 'ろく', 7: 'なな', 8: 'はち', 9: 'きゅう', 10: 'じゅう',
  11: 'じゅう いち', 12: 'じゅう に', 13: 'じゅう さん', 14: 'じゅう よん', 15: 'じゅう ご',
  16: 'じゅう ろく', 17: 'じゅう なな', 18: 'じゅう はち', 19: 'じゅう きゅう', 20: 'に じゅう',
}
const rn = (n: number) => READ[n] ?? String(n)
function shuffle<T>(a: T[]): T[] { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[r[i], r[j]] = [r[j], r[i]] } return r }

/** つよい・よわい両方から抽選（1ゲーム内でもバラバラに出る） */
const SPECIES_POOL = [...STRONG_MONSTER_IDS, ...WEAK_MONSTER_IDS]
function makeMons(n: number): Mon[] {
  const pool = shuffle(SPECIES_POOL)
  return Array.from({ length: n }, (_, i) => ({ key: monKey++, id: pool[i % pool.length] ?? 'monster-strong-1', rot: rand(-12, 12) }))
}

/** 答えの近傍から重複しない3択（必ず正解を含む） */
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
  /** 正解の数 */
  answer: number
  /** count: あつめる目標 / addsub: 最初にいる数 / make10: 最初にいる数 */
  base: number
  /** addsub: ふえる/へる 数 / make10: 目標に足りない数（=answer） */
  delta: number
  /** addsub の増減 */
  op: '+' | '-' | ''
  /** make10: 作る目標の数 */
  target: number
  /** addsub / make10 の数字カード（count は空＝できたボタン方式） */
  choices: number[]
}

/** 直前と違う数になるまで数回引き直す（同じ問題ばかり出ないように） */
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
      const ans = a - b
      return { mode: 'addsub', answer: ans, base: a, delta: b, op: '-', target: 0, choices: numberChoices(ans, 0, 20), prompt: `ここに ${b}こ へったら なんこ？`, speak: `ここに、${rn(b)}、こへったらなんこ` }
    }
    let a = rand(1, spec.addMax - 1)
    let b = rand(1, Math.max(1, spec.addMax - a))
    if (a + b === avoid) { a = rand(1, spec.addMax - 1); b = rand(1, Math.max(1, spec.addMax - a)) }
    const ans = a + b
    return { mode: 'addsub', answer: ans, base: a, delta: b, op: '+', target: 0, choices: numberChoices(ans, 1, 20), prompt: `ここに ${b}こ ふえたら なんこ？`, speak: `ここに、${rn(b)}、こふえたらなんこ` }
  }
  // make10（すうじをつくろう）: 目標 T をつくる。最初に base いて、あと need（=answer）で T。
  // 空きマスは出さない（数えると答えが分かってしまうため）。目標 T を見て、数字カードで選ぶ。
  let T = rand(spec.targetMin, spec.targetMax)
  for (let i = 0; i < 8 && T === avoid && spec.targetMax > spec.targetMin; i++) T = rand(spec.targetMin, spec.targetMax)
  const need = rand(Math.max(1, T - 10), Math.min(9, T - 1))
  const base = T - need
  return { mode: 'make10', answer: need, base, delta: need, op: '', target: T, choices: numberChoices(need, 1, 9), prompt: `${T}を つくろう！`, speak: `${rn(T)}、をつくろう` }
}

/**
 * かぞえて系（暗算不要）。モードはステージ固定（stage.countMode）。
 * count=スライドで集める / addsub=ふえ/へりを見て数える（数字カード）/ make10=目標をつくる（数字カード・空きマス無し）。
 * 答えの数字は大きく出さない（数えさせる）。ライフ・スター・記録・音は既存流用。
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
  /** 場にいるモンスター */
  const [herd, setHerd] = useState<Mon[]>([])
  /** count でスライドして集めるモンスター */
  const [pool, setPool] = useState<Mon[]>([])

  const speakPrompt = useCallback((question: Question) => { voice.speak(question.speak) }, [])

  // タイマーは追跡して、新しい問題の開始やアンマウントで確実に消す。
  // （StrictMode の二重マウントで「ふえる/へる」の増減が二重に適用される事故を防ぐ）
  const timers = useRef<number[]>([])
  const clearTimers = useCallback(() => { timers.current.forEach(id => window.clearTimeout(id)); timers.current = [] }, [])
  const later = useCallback((fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)) }, [])

  const beginQuestion = useCallback((question: Question) => {
    clearTimers()
    startAt.current = Date.now()
    sfx.uiTap()
    if (question.mode === 'count') {
      setHerd([])
      setPool(makeMons(question.delta + rand(1, 3)))
      setPhase('collecting')
      later(() => speakPrompt(question), 300)
    } else if (question.mode === 'addsub') {
      // 最初に base いる → 少し待って ふえる/へる を見せる → 数字カードで答える
      setPool([])
      setHerd(makeMons(question.base))
      setPhase('showing')
      later(() => speakPrompt(question), 300)
      later(() => {
        // 絶対値でセットし直す（増減の二重適用を根本から防ぐ）: '+' は base+delta / '-' は base-delta
        setHerd(h => {
          const total = question.op === '+' ? question.base + question.delta : question.base - question.delta
          if (h.length === total) return h
          if (h.length < total) return [...h, ...makeMons(total - h.length)]
          return h.slice(0, total)
        })
        sfx.pop()
        setPhase('answering')
        later(() => voice.speak('なんこ'), 500)
      }, 1700)
    } else { // make10（すうじをつくろう）
      setPool([])
      setHerd(makeMons(question.base))
      setPhase('collecting') // 数字カードを出して待つ
      later(() => speakPrompt(question), 300)
    }
  }, [speakPrompt, clearTimers, later])

  useEffect(() => { beginQuestion(q); return clearTimers }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__countState = { difficulty, mode, round, phase, herd: herd.length, answer: q.answer, target: q.target }
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
    later(nextRound, 1500)
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
      later(() => setPhase(q.mode === 'count' ? 'collecting' : 'answering'), 1100)
    }
  }, [wrongCount, lives, q, stage.id, difficulty, later])

  // ---- count: スライドで集める ----
  const grab = (m: Mon) => {
    if (phase !== 'collecting' || q.mode !== 'count') return
    setPool(p => p.filter(x => x.key !== m.key))
    setHerd(c => [...c, m])
    sfx.pop()
  }
  const putBack = (m: Mon) => {
    if (phase !== 'collecting' || q.mode !== 'count') return
    setHerd(c => c.filter(x => x.key !== m.key))
    setPool(p => [...p, m])
    sfx.uiTap()
  }
  const checkCount = () => {
    if (phase !== 'collecting' || q.mode !== 'count') return
    const ok = herd.length === q.answer
    recordAnswer(String(q.answer), 'number', ok, Date.now() - startAt.current)
    if (ok) onCorrect()
    else { sfx.wrong(); voice.speak('もういちどかぞえてね'); setPhase('wrong'); later(() => setPhase('collecting'), 1100) }
  }

  // ---- addsub: 数字カードで答える（ふえ/へり を見て数える） ----
  const pickNumber = (n: number) => {
    if (phase !== 'answering') return
    const ok = n === q.answer
    recordAnswer(String(q.answer), 'number', ok, Date.now() - startAt.current)
    if (ok) onCorrect(); else onWrong()
  }

  // ---- make10（すうじをつくろう）: 数字カードで「あと なんこ」を選ぶ → 足して目標か判定 ----
  const pickBuild = (k: number) => {
    if (phase !== 'collecting' || q.mode !== 'make10') return
    const ok = q.base + k === q.target
    recordAnswer(String(q.answer), 'number', ok, Date.now() - startAt.current)
    setHerd(c => [...c, ...makeMons(k)])
    sfx.pop()
    later(() => {
      if (ok) { sfx.purify(); onCorrect() }
      else { onWrong(); setHerd(makeMons(q.base)) }
    }, 800)
  }

  const resetRound = () => { if (phase === 'collecting' || phase === 'answering') beginQuestion(q) }

  // ---- スライド（ドラッグ・count のみ） ----
  const dropRef = useRef<HTMLDivElement>(null)
  const grabRef = useRef(grab); grabRef.current = grab
  const putBackRef = useRef(putBack); putBackRef.current = putBack
  type Drag = { mon: Mon; from: 'pool' | 'herd'; x: number; y: number }
  const dragRef = useRef<Drag | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)

  const startDrag = (e: ReactPointerEvent, m: Mon, from: 'pool' | 'herd') => {
    if (phase !== 'collecting' || q.mode !== 'count') return
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
      else if (d.from === 'herd' && !inside) putBackRef.current(d.mon)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
  }, [])

  // ---- 描画 ----
  const monImg = (m: Mon, cls: string, from?: 'pool' | 'herd') => (
    <img
      key={m.key} src={monsterImageUrl(m.id)} alt="" className={cls} draggable={false}
      style={{ transform: `rotate(${m.rot}deg)`, opacity: drag?.mon.key === m.key ? 0.3 : 1 }}
      onPointerDown={from ? e => startDrag(e, m, from) : undefined}
    />
  )

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

      <div className="count-body" ref={dropRef}>
        {q.mode === 'count' ? (
          <div className="count-herd count-dropzone" aria-label="ここに あつめる">
            {herd.map(m => monImg(m, 'count-mon', 'herd'))}
          </div>
        ) : (
          // addsub / make10: 場のモンスターを大きく見せる（スライドはしない・数える）
          <div className="count-herd" aria-label="モンスター">
            {herd.map(m => monImg(m, 'count-mon'))}
          </div>
        )}
      </div>

      <div className="count-actions">
        {phase === 'collecting' && q.mode === 'count' && (
          <>
            <div className="drag-arrow" aria-hidden>⬆</div>
            <div className="count-pool">
              {pool.map(m => monImg(m, 'pool-mon', 'pool'))}
            </div>
            <button className="big-button count-done" onClick={checkCount}>✋ できた！</button>
          </>
        )}

        {phase === 'collecting' && q.mode === 'make10' && (
          <div className="count-choices">
            {q.choices.map(n => (
              <button key={n} className="choice-num" onClick={() => pickBuild(n)}>{n}</button>
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

        {(phase === 'collecting' || phase === 'answering') && (
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
