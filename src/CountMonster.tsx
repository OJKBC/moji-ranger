import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EventBus } from './EventBus'
import { countSpec, TEN_FRAME_SIZE } from './data/counting'
import type { CountMode, CountSpec } from './data/counting'
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

/** 1匹ぶんのモンスター（種類はバラバラ・見た目に少し傾きをつけて散らす） */
interface Mon { key: number; id: string; rot: number }

let monKey = 0
const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))
function shuffle<T>(a: T[]): T[] { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[r[i], r[j]] = [r[j], r[i]] } return r }

/** n匹、色々な種類のモンスターを作る（1ゲーム内でもバラバラに出る） */
function makeMons(n: number): Mon[] {
  const pool = shuffle(STRONG_MONSTER_IDS)
  return Array.from({ length: n }, (_, i) => ({
    key: monKey++,
    id: pool[i % pool.length] ?? 'monster-strong-1',
    rot: rand(-14, 14),
  }))
}

/** 答えの近傍から重複しない3択（0未満/上限超えは避ける・必ず正解を含む） */
function numberChoices(answer: number, lo = 0, hi = 10): number[] {
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
  speak: string[]
  /** 正解の数 */
  answer: number
  /** テンフレームに最初からいる数（make10 のプレフィル） */
  base: number
  /** count: あつめる目標 / addsub-add: 追加する数 / addsub-sub: にがす数 */
  need: number
  /** ひき算（テンフレーム相当のモンスターをタップして「にがす」） */
  release: boolean
  /** addsub の「ぜんぶで？/のこりは？」数字カード。空=できたボタン方式(count) */
  choices: number[]
  /** make10 の「かたまり」候補 */
  chunkChoices: number[]
}

function makeQuestion(spec: CountSpec): Question {
  if (spec.mode === 'count') {
    const target = rand(spec.countMin, spec.countMax)
    return {
      mode: 'count', answer: target, base: 0, need: target, release: false,
      choices: [], chunkChoices: [],
      prompt: `${target}こ あつめよう！`, speak: ['あつめよう'],
    }
  }
  if (spec.mode === 'addsub') {
    const doSub = spec.includeSub && Math.random() < 0.5
    if (doSub) {
      const a = rand(3, Math.min(9, spec.addMax))
      const b = rand(1, a - 1)
      return {
        mode: 'addsub', answer: a - b, base: a, need: b, release: true,
        choices: numberChoices(a - b, 0, 10), chunkChoices: [],
        prompt: `${a}こ いるね。${b}こ にがそう！`, speak: ['にがそう'],
      }
    }
    const a = rand(1, spec.addMax - 1)
    const b = rand(1, Math.max(1, spec.addMax - a))
    return {
      mode: 'addsub', answer: a + b, base: a, need: b, release: false,
      choices: numberChoices(a + b, 1, 10), chunkChoices: [],
      prompt: `${a}こ いるね。もう ${b}こ あつめよう！`, speak: ['あつめよう'],
    }
  }
  // make10
  const prefill = rand(spec.countMin, spec.countMax)
  const need = TEN_FRAME_SIZE - prefill
  return {
    mode: 'make10', answer: need, base: prefill, need, release: false,
    choices: [], chunkChoices: numberChoices(need, 1, 9),
    prompt: 'あと なんこで 10 かな？', speak: ['あとなんこでじゅう'],
  }
}

/**
 * かぞえて系（暗算不要）。モードはステージ固定（stage.countMode）。
 * モンスターは種類バラバラ・箱に入れず自由に散らして見やすく置く。答えの数字は大きく出さない
 * （数えさせる）。タップ時に数を読み上げない（答えバレ防止）。ライフ・スター・記録・音は既存流用。
 */
export function CountMonster({ stage, difficulty }: Props) {
  const mode: CountMode = stage.countMode ?? 'count'
  const spec = countSpec(mode, difficulty)
  const startAt = useRef(Date.now())

  const [round, setRound] = useState(0)
  const [lives, setLives] = useState(3)
  const [wrongCount, setWrongCount] = useState(0)
  const [q, setQ] = useState<Question>(() => makeQuestion(spec))
  const [phase, setPhase] = useState<Phase>('collecting')
  /** テンフレーム/あつめた場所にいるモンスター */
  const [collected, setCollected] = useState<Mon[]>([])
  /** タップして集めるモンスター（count / addsub-add） */
  const [pool, setPool] = useState<Mon[]>([])

  const speakPrompt = useCallback((question: Question) => {
    voice.speak(question.speak[0] ?? '')
  }, [])

  const beginQuestion = useCallback((question: Question) => {
    setPhase('collecting')
    startAt.current = Date.now()
    if (question.mode === 'count') {
      setCollected([])
      setPool(makeMons(question.need + rand(1, 3)))
    } else if (question.mode === 'addsub') {
      setCollected(makeMons(question.base))
      setPool(question.release ? [] : makeMons(question.need))
    } else { // make10
      setCollected(makeMons(question.base))
      setPool([])
    }
    sfx.uiTap()
    window.setTimeout(() => speakPrompt(question), 300)
  }, [speakPrompt])

  useEffect(() => { beginQuestion(q) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__countState = { difficulty, mode, round, phase, collected: collected.length }
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
    const nq = makeQuestion(spec)
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

  // count / addsub-add: プールの1匹を「あつめる」（数は読み上げない＝答えバレ防止）
  const grab = (m: Mon) => {
    if (phase !== 'collecting' || q.release) return
    setPool(p => p.filter(x => x.key !== m.key))
    setCollected(c => [...c, m])
    sfx.pop()
  }
  // count: 入れすぎたら1匹もどす（やさしく取り消し）
  const putBack = (m: Mon) => {
    if (phase !== 'collecting' || q.release || q.mode !== 'count') return
    setCollected(c => c.filter(x => x.key !== m.key))
    setPool(p => [...p, m])
    sfx.uiTap()
  }
  // addsub-sub: あつまっている1匹を「にがす」。指定数まで逃がしたら、それ以上は逃がさない
  // （にがしすぎて先に進めなくなるのを防ぐ。やり直しは やりなおし ボタンで）
  const release = (m: Mon) => {
    if (phase !== 'collecting' || !q.release) return
    if (collected.length <= q.base - q.need) return
    setCollected(c => c.filter(x => x.key !== m.key))
    sfx.fizzle()
  }
  // count: 「できた！」でちょうどか判定（罰しない＝ライフは減らさずやり直し）
  const checkCount = () => {
    if (phase !== 'collecting') return
    const ok = collected.length === q.answer
    recordAnswer(String(q.answer), 'number', ok, Date.now() - startAt.current)
    if (ok) onCorrect()
    else { sfx.wrong(); voice.speak('もういちどかぞえてね'); setPhase('wrong'); window.setTimeout(() => setPhase('collecting'), 1100) }
  }
  // addsub: 「ぜんぶで？/のこりは？」の数字カードを選ぶ（テンフレーム/群れを数えて選ぶ）
  const pickNumber = (n: number) => {
    if (phase !== 'answering') return
    const ok = n === q.answer
    recordAnswer(String(q.answer), 'number', ok, Date.now() - startAt.current)
    if (ok) onCorrect(); else onWrong()
  }
  // make10: かたまり（K匹）を選んで入れる → ちょうど10で成功
  const pickChunk = (k: number) => {
    if (phase !== 'collecting') return
    const ok = q.base + k === TEN_FRAME_SIZE
    recordAnswer(String(q.answer), 'number', ok, Date.now() - startAt.current)
    setCollected(c => [...c, ...makeMons(k)])
    sfx.pop()
    window.setTimeout(() => {
      if (ok) { sfx.purify(); onCorrect() }
      else { onWrong(); setCollected(makeMons(q.base)) }
    }, 700)
  }
  // やり直し（数え間違いをやさしく戻す）
  const resetRound = () => { if (phase === 'collecting' || phase === 'answering') beginQuestion(q) }

  // make10 の「かたまり」候補は問題ごとに1回だけ作る（再描画で種類がちらつかないように）
  const chunkMons = useMemo(
    () => q.chunkChoices.map(k => ({ k, mons: makeMons(k) })),
    [q],
  )

  // addsub: 集め終え/にがし終えたら自動で「こたえをえらぶ」へ
  useEffect(() => {
    if (phase !== 'collecting' || q.mode !== 'addsub') return
    const doneCollecting = q.release ? collected.length === q.base - q.need : pool.length === 0
    if (doneCollecting) {
      const t = window.setTimeout(() => {
        setPhase('answering')
        voice.speak(q.release ? 'のこりはなんこ' : 'ぜんぶでなんこ')
      }, 600)
      return () => window.clearTimeout(t)
    }
  }, [phase, pool, collected, q])

  // ---- 描画 ----
  const monImg = (m: Mon, cls: string, onClick?: () => void) => (
    <img
      key={m.key} src={monsterImageUrl(m.id)} alt="" className={cls}
      style={{ transform: `rotate(${m.rot}deg)` }}
      onClick={onClick}
    />
  )

  return (
    <div className="count-screen">
      {/* ヘッダー: 指示＋🔊＋ハート（大きな数字ヒントは出さない） */}
      <div className="count-header">
        <div className="count-prompt">
          <span>{q.prompt}</span>
          <button className="count-replay" onClick={() => { sfx.uiTap(); speakPrompt(q) }} aria-label="もういちど きく">🔊</button>
        </div>
        <div className="count-hearts">
          {[0, 1, 2].map(i => <span key={i}>{i < lives ? '💖' : '🤍'}</span>)}
        </div>
      </div>

      <div className="count-body">
        {q.mode === 'make10' ? (
          // 10のおうち（テンフレーム）。箱は薄く、モンスターははっきり見せる
          <div className="ten-home">
            {Array.from({ length: TEN_FRAME_SIZE }, (_, i) => {
              const m = collected[i]
              return (
                <div key={i} className={`home-slot ${m ? 'filled' : 'empty'}`}>
                  {m && monImg(m, 'count-mon')}
                </div>
              )
            })}
          </div>
        ) : (
          // かぞえる / ふえる・へる: あつめた群れ（箱なし・自由に散らす）
          <div className="count-herd" aria-label="あつめた モンスター">
            {collected.length === 0 && <span className="count-herd-empty">ここに あつまるよ</span>}
            {collected.map(m => monImg(m, 'count-mon', q.release ? () => release(m) : () => putBack(m)))}
          </div>
        )}
      </div>

      {/* 操作エリア */}
      <div className="count-actions">
        {phase === 'collecting' && q.mode === 'count' && (
          <>
            <div className="count-pool">
              {pool.map(m => monImg(m, 'pool-mon', () => grab(m)))}
            </div>
            <button className="big-button count-done" onClick={checkCount}>✋ できた！</button>
          </>
        )}

        {phase === 'collecting' && q.mode === 'addsub' && !q.release && (
          <div className="count-pool">
            {pool.map(m => monImg(m, 'pool-mon', () => grab(m)))}
          </div>
        )}

        {phase === 'collecting' && q.mode === 'addsub' && q.release && (
          <p className="count-hint">モンスターを タップして {q.need}こ にがそう</p>
        )}

        {phase === 'collecting' && q.mode === 'make10' && (
          <div className="count-chunks">
            {chunkMons.map(({ k, mons }) => (
              <button key={k} className="chunk-btn" onClick={() => pickChunk(k)}>
                <span className="chunk-monsters">
                  {mons.map(m => <img key={m.key} src={monsterImageUrl(m.id)} alt="" style={{ transform: `rotate(${m.rot}deg)` }} />)}
                </span>
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

        {(phase === 'collecting' || phase === 'answering') && (
          <button className="count-reset" onClick={resetRound} aria-label="やりなおし">🔄 やりなおし</button>
        )}
      </div>

      <div className="count-progress">
        {Array.from({ length: totalRounds }, (_, i) => (
          <span key={i} className={i < round ? 'done' : i === round ? 'now' : ''}>●</span>
        ))}
      </div>
    </div>
  )
}
