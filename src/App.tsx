import { useCallback, useEffect, useState } from 'react'
import { EventBus } from './EventBus'
import { PhaserGame } from './game/PhaserGame'
import { STAGES } from './data/stages'
import { sfx } from './audio/sfx'
import { voice } from './audio/voice'
import type { StageResult } from './types'
import bgUrl from './assets/bg.jpg'
import heroesUrl from './assets/heroes.png'

type Screen = 'title' | 'game' | 'result'

export default function App() {
  const [screen, setScreen] = useState<Screen>('title')
  const [result, setResult] = useState<StageResult | null>(null)
  const [playKey, setPlayKey] = useState(0)
  const stage = STAGES[0]

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

  const startGame = useCallback(() => {
    // 最初のユーザー操作の中で音声をアンロックする（iOS/Android 対策）
    sfx.unlock()
    voice.init()
    sfx.uiTap()
    setPlayKey(k => k + 1)
    setScreen('game')
  }, [])

  const backToTitle = useCallback(() => {
    sfx.uiTap()
    setScreen('title')
  }, [])

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
          <button className="big-button" onClick={startGame}>
            ▶ スタート
          </button>
          <p className="title-note">おとが でるよ 🔊</p>
        </div>
      )}

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
            「あ」を {result.rounds} かい みつけたよ！
            {result.maxCombo >= 3 && <> さいだい れんぞく ×{result.maxCombo}！</>}
          </p>
          <button className="big-button" onClick={startGame}>
            🔁 もういっかい
          </button>
          <button className="sub-button" onClick={backToTitle}>
            🏠 タイトルへ
          </button>
        </div>
      )}
    </div>
  )
}
