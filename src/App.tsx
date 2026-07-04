import { useCallback, useEffect, useState } from 'react'
import { EventBus } from './EventBus'
import { PhaserGame } from './game/PhaserGame'
import { STAGES, nextStageOf } from './data/stages'
import { StageMap } from './StageMap'
import { loadProgress } from './store/progress'
import { sfx } from './audio/sfx'
import { voice } from './audio/voice'
import type { Stage, StageResult } from './types'
import bgUrl from './assets/bg.jpg'
import heroesUrl from './assets/heroes.png'

type Screen = 'title' | 'map' | 'game' | 'result'

export default function App() {
  const [screen, setScreen] = useState<Screen>('title')
  const [stage, setStage] = useState<Stage>(STAGES[0])
  const [result, setResult] = useState<StageResult | null>(null)
  const [playKey, setPlayKey] = useState(0)

  useEffect(() => {
    const onClear = (r: StageResult) => {
      setResult(r)
      setScreen('result')
    }
    EventBus.on('stage-clear', onClear)
    return () => {
      EventBus.off('stage-clear', onClear)
    }
  }, [])

  const openMap = useCallback(() => {
    // 最初のユーザー操作の中で音声をアンロックする（iOS/Android 対策）
    sfx.unlock()
    voice.init()
    sfx.uiTap()
    setScreen('map')
  }, [])

  const playStage = useCallback((s: Stage) => {
    setStage(s)
    setPlayKey(k => k + 1)
    setScreen('game')
  }, [])

  const backToTitle = useCallback(() => {
    sfx.uiTap()
    setScreen('title')
  }, [])

  const next = result ? nextStageOf(result.stageId) : null
  const nextUnlocked = next ? loadProgress().unlockedStages.includes(next.id) : false

  return (
    <div className="app" style={{ backgroundImage: `url(${bgUrl})` }}>
      {screen === 'title' && (
        <div className="overlay-screen">
          <p className="title-sub">よるの もじシティを すくえ！</p>
          <h1 className="title-logo">
            もじレンジャー
            <span>ビームアカデミー</span>
          </h1>
          <div className="title-hero" style={{ backgroundImage: `url(${heroesUrl})` }} />
          <button className="big-button" onClick={openMap}>
            ▶ スタート
          </button>
          <p className="title-note">おとが でるよ 🔊</p>
        </div>
      )}

      {screen === 'map' && <StageMap onSelect={playStage} onBack={backToTitle} />}

      {screen === 'game' && <PhaserGame key={playKey} stage={stage} />}

      {screen === 'result' && result && (
        <div className="overlay-screen">
          <h2 className="result-heading">よくできました！</h2>
          <div className="result-stars">
            {[1, 2, 3].map(n => (
              <span
                key={n}
                className={n <= result.stars ? 'star on' : 'star'}
                style={{ animationDelay: `${0.15 + n * 0.3}s` }}
              >
                ★
              </span>
            ))}
          </div>
          <p className="result-detail">
            {STAGES.find(s => s.id === result.stageId)?.title ?? ''} クリア！
            {result.maxCombo >= 3 && <> さいだい れんぞく ×{result.maxCombo}！</>}
          </p>
          {next && nextUnlocked && (
            <button className="big-button" onClick={() => { sfx.uiTap(); playStage(next) }}>
              ⏩ つぎのステージ
            </button>
          )}
          <button
            className={next && nextUnlocked ? 'sub-button' : 'big-button'}
            onClick={() => { sfx.uiTap(); playStage(stage) }}
          >
            🔁 もういっかい
          </button>
          <button className="sub-button" onClick={() => { sfx.uiTap(); setScreen('map') }}>
            🗺️ ステージマップへ
          </button>
        </div>
      )}
    </div>
  )
}
