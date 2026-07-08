import { useEffect, useRef, useState } from 'react'
import { BONUS_BALLS, PITY_FAILS, bonusRollBall } from './data/balls'
import type { BallSpec } from './data/balls'
import { CAPTURABLE_MONSTER_IDS, monsterImageUrl, monsterName } from './data/monsterNames'
import {
  captureFailCount, loadProgress, markBonusClaimed,
  recordCaptureFail, recordCaptureSuccess,
} from './store/progress'
import { sfx } from './audio/sfx'
import { voice } from './audio/voice'

interface Props {
  /** なかまが増えた（＝親にバックアップを促す等）とき通知 */
  onCaptured?: () => void
  onClose: () => void
}

const ballUrl = (file: string) => `${import.meta.env.BASE_URL}assets/balls/${file}`

type Phase = 'intro' | 'roulette' | 'ready' | 'throwing' | 'success' | 'fail' | 'reward'

/**
 * ㊷ ログインボーナス（1日1回）。
 * その日はじめて開いたとき、未捕獲のモンスターが1体あらわれ、なかまボールを1回投げられる。
 * ボールは「青以上」だけの日替わり抽選（bonusRollBall）。2回失敗救済（pity）も整合。
 * 未捕獲がもう無ければ「ありがとう」の星ごほうびにフォールバック（データは変えない）。
 * 逃してもペナルティなし・強制や通知はしない。表示した時点で markBonusClaimed（1日1回）。
 */
export function LoginBonus({ onCaptured, onClose }: Props) {
  // 未捕獲のなかま候補（1回だけ抽選）
  const [monsterId] = useState<string | null>(() => {
    const progress = loadProgress()
    const captured = new Set(progress.capturedMonsters)
    const remaining = CAPTURABLE_MONSTER_IDS.filter(id => !captured.has(id))
    if (remaining.length === 0) return null
    return remaining[Math.floor(Math.random() * remaining.length)]
  })
  // 出すボールを1回だけ決める（pity: 2回失敗済みなら必ず紫）
  const [ball] = useState<BallSpec>(() => {
    const pity = monsterId ? captureFailCount(loadProgress(), monsterId) >= PITY_FAILS : false
    return bonusRollBall(pity)
  })
  const [phase, setPhase] = useState<Phase>(monsterId ? 'intro' : 'reward')
  const [rouletteBall, setRouletteBall] = useState<BallSpec>(BONUS_BALLS[0])
  const started = useRef(false)
  const alive = useRef(true)

  // アンマウント後の setState を防ぐ（StrictMode の二重マウント/タイマーにも耐える）
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  // 表示した時点で「今日ぶんは受け取った」＝1日1回（成功/失敗に関わらず）
  useEffect(() => {
    markBonusClaimed()
    voice.speak('きょうのボーナス')
  }, [])

  // 導入 → ルーレット → 投げられる状態へ（一度だけ進行）。
  // ※ タイマーを cleanup で消さない（StrictMode の二重呼び出しで進行が止まるのを防ぐ）。
  //    代わりに alive フラグで、生きているときだけ setState する。
  useEffect(() => {
    if (!monsterId || started.current) return
    started.current = true
    const set = (fn: () => void) => { if (alive.current) fn() }
    window.setTimeout(() => {
      set(() => setPhase('roulette'))
      let ticks = 0
      const spin = () => {
        if (!alive.current) return
        sfx.rouletteTick(ticks)
        setRouletteBall(BONUS_BALLS[ticks % BONUS_BALLS.length])
        ticks++
        if (ticks < 12) {
          window.setTimeout(spin, 90 + ticks * 14) // だんだん減速
        } else {
          sfx.rouletteStop()
          set(() => setRouletteBall(ball))
          if (ball.rainbow) sfx.specialFanfare()
          window.setTimeout(() => set(() => setPhase('ready')), 600)
        }
      }
      spin()
    }, 900)
  }, [monsterId, ball])

  const throwBall = () => {
    if (phase !== 'ready' || !monsterId) return
    sfx.throwBall()
    setPhase('throwing')
    const success = Math.random() < ball.successRate
    window.setTimeout(() => sfx.ballShake(0), 700)
    window.setTimeout(() => sfx.ballShake(1), 1100)
    window.setTimeout(() => sfx.ballShake(2), 1500)
    window.setTimeout(() => {
      if (!alive.current) return
      if (success) {
        recordCaptureSuccess(monsterId)
        onCaptured?.()
        sfx.captureSuccess()
        voice.speak(`${monsterName(monsterId)}、なかまになった！`)
        setPhase('success')
      } else {
        recordCaptureFail(monsterId)
        sfx.escapePop()
        voice.speak('またあそぼうね！')
        setPhase('fail')
      }
    }, 2000)
  }

  const done = () => { sfx.uiTap(); onClose() }

  return (
    <div className="bonus-overlay">
      <div className="bonus-box">
        <div className="bonus-banner">🎁 きょうの ボーナス！</div>

        {monsterId ? (
          <>
            <p className="bonus-sub">
              {phase === 'ready' && 'タップして ボールを なげよう！'}
              {phase === 'throwing' && 'つかまえられるかな…？'}
              {phase === 'success' && `${monsterName(monsterId)} が なかまに なった！`}
              {phase === 'fail' && 'にげちゃった！ また あした あそぼうね'}
              {(phase === 'intro' || phase === 'roulette') && 'あたらしい なかまが あらわれた！'}
            </p>

            <div className={`bonus-stage phase-${phase}`}>
              <img
                className="bonus-monster"
                src={monsterImageUrl(monsterId)}
                alt={monsterName(monsterId)}
              />
              {(phase === 'roulette' || phase === 'ready' || phase === 'throwing') && (
                <img
                  className="bonus-ball"
                  src={ballUrl(phase === 'roulette' ? rouletteBall.file : ball.file)}
                  alt={ball.name}
                />
              )}
              {phase === 'success' && <div className="bonus-sparkle">✨🎉✨</div>}
            </div>

            {phase === 'ready' && (
              <button className="big-button bonus-throw" onClick={throwBall}>
                🎯 なげる！（{ball.name}）
              </button>
            )}
            {(phase === 'success' || phase === 'fail') && (
              <button className="big-button" onClick={done}>▶ すすむ</button>
            )}
          </>
        ) : (
          <>
            {/* 未捕獲がもう無い＝フォールバックのごほうび（データは変えない） */}
            <p className="bonus-sub">きょうも あそびに きてくれて ありがとう！</p>
            <div className="bonus-reward">⭐️🌟⭐️</div>
            <p className="bonus-sub">なかまは ぜんぶ そろってるよ！ すごい！</p>
            <button className="big-button" onClick={done}>▶ すすむ</button>
          </>
        )}
      </div>
    </div>
  )
}
