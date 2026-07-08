import { useCallback, useEffect, useState } from 'react'
import { EventBus } from './EventBus'
import { PhaserGame } from './game/PhaserGame'
import { STAGES } from './data/stages'
import { StageMap } from './StageMap'
import { Zukan } from './Zukan'
import { isStageUnlocked, loadProgress } from './store/progress'
import { sfx } from './audio/sfx'
import { voice } from './audio/voice'
import { MAX_DIFFICULTY } from './types'
import type { DifficultyLevel, Stage, StageResult } from './types'
import bgUrl from './assets/bg.jpg'

/** タイトル画面に出す登場モンスター（public/assets/monsters/ から） */
const monsterUrl = (file: string) => `${import.meta.env.BASE_URL}assets/monsters/${file}`

type Screen = 'title' | 'map' | 'game' | 'result' | 'failed' | 'zukan'

/** ライフ0時に Phaser から届く失敗情報 */
interface StageFailed {
  stageId: string
  difficulty: DifficultyLevel
}

/**
 * リザルト後の「つぎ」の行き先。
 * 難易度3未満なら同じステージの次の難易度、難易度3クリア後は
 * マップ順で次の解放済みステージ（その子の次の挑戦難易度）へ。
 */
function nextChallengeOf(result: StageResult): { stage: Stage; level: DifficultyLevel } | null {
  const stage = STAGES.find(s => s.id === result.stageId)
  if (!stage) return null
  if (result.difficulty < MAX_DIFFICULTY) {
    return { stage, level: (result.difficulty + 1) as DifficultyLevel }
  }
  const progress = loadProgress()
  const index = STAGES.findIndex(s => s.id === result.stageId)
  for (let i = index + 1; i < STAGES.length; i++) {
    if (!STAGES[i].hidden && isStageUnlocked(STAGES[i], progress)) {
      // 新しいステージへの挑戦は必ず難易度1から
      return { stage: STAGES[i], level: 1 }
    }
  }
  return null
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('title')
  const [stage, setStage] = useState<Stage>(STAGES[0])
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(1)
  const [result, setResult] = useState<StageResult | null>(null)
  const [failInfo, setFailInfo] = useState<StageFailed | null>(null)
  const [confirmQuit, setConfirmQuit] = useState(false)
  const [playKey, setPlayKey] = useState(0)
  /** このステージで新しくなかまが増えた（リザルトで控えめにバックアップを促す） */
  const [capturedThisRun, setCapturedThisRun] = useState(false)
  /** ずかんを閉じたとき戻る画面（マップ or リザルト） */
  const [zukanFrom, setZukanFrom] = useState<Screen>('map')

  const openZukan = useCallback((from: Screen) => {
    sfx.uiTap()
    setZukanFrom(from)
    setScreen('zukan')
  }, [])

  useEffect(() => {
    // モバイルの音声解禁: 最初のタップに限らず、あらゆるユーザー操作で
    // AudioContext を作成/resume する（タブ切替や画面ロックで止まっても復帰）
    const unlockAudio = () => {
      sfx.unlock()
      voice.init()
    }
    document.addEventListener('pointerdown', unlockAudio, { passive: true })

    const onClear = (r: StageResult) => {
      setConfirmQuit(false)
      setResult(r)
      setScreen('result')
    }
    const onFailed = (f: StageFailed) => {
      setConfirmQuit(false)
      setFailInfo(f)
      setScreen('failed')
    }
    const onCaptured = () => setCapturedThisRun(true)
    EventBus.on('stage-clear', onClear)
    EventBus.on('stage-failed', onFailed)
    EventBus.on('monster-captured', onCaptured)
    return () => {
      document.removeEventListener('pointerdown', unlockAudio)
      EventBus.off('stage-clear', onClear)
      EventBus.off('stage-failed', onFailed)
      EventBus.off('monster-captured', onCaptured)
    }
  }, [])

  const openMap = useCallback(() => {
    // 最初のユーザー操作の中で音声をアンロックする（iOS/Android 対策）
    sfx.unlock()
    voice.init()
    sfx.uiTap()
    setScreen('map')
  }, [])

  const playStage = useCallback((s: Stage, level: DifficultyLevel) => {
    setStage(s)
    setDifficulty(level)
    setConfirmQuit(false)
    setCapturedThisRun(false)
    setPlayKey(k => k + 1)
    setScreen('game')
  }, [])

  const backToTitle = useCallback(() => {
    sfx.uiTap()
    setScreen('title')
  }, [])

  // ゲーム中の「もどる」: いきなり離脱せず、一時停止して確認を挟む
  const askQuit = useCallback(() => {
    sfx.uiTap()
    EventBus.emit('game-pause')
    setConfirmQuit(true)
  }, [])

  const continueGame = useCallback(() => {
    sfx.uiTap()
    setConfirmQuit(false)
    EventBus.emit('game-resume')
  }, [])

  const quitToMap = useCallback(() => {
    sfx.uiTap()
    voice.cancel()
    setConfirmQuit(false)
    setScreen('map') // PhaserGame はアンマウントで破棄される
  }, [])

  const next = result ? nextChallengeOf(result) : null

  return (
    <div className="app" style={{ backgroundImage: `url(${bgUrl})` }}>
      {screen === 'title' && (
        <div className="overlay-screen title-screen">
          {/* 登場モンスターがお出迎え（中央につよい・両脇によわい） */}
          <div className="title-monsters">
            <img className="tm tm-left" src={monsterUrl('monster-weak-1.png')} alt="" />
            <img className="tm tm-center" src={monsterUrl('monster-strong-9.png')} alt="" />
            <img className="tm tm-right" src={monsterUrl('monster-weak-6.png')} alt="" />
          </div>
          <h1 className="title-logo">
            まなびレンジャー
            <span>ビームアカデミー</span>
          </h1>
          <p className="title-sub">ひらがな・カタカナ・ことば・さんすう</p>
          <button className="big-button title-start" onClick={openMap}>
            ▶ スタート
          </button>
          <p className="title-note">おとが でるよ 🔊</p>
        </div>
      )}

      {screen === 'map' && (
        <StageMap onSelect={playStage} onBack={backToTitle} onZukan={() => openZukan('map')} />
      )}

      {screen === 'zukan' && <Zukan onBack={() => setScreen(zukanFrom)} />}

      {screen === 'game' && (
        <>
          <PhaserGame key={playKey} stage={stage} difficulty={difficulty} />
          <button className="back-button" onClick={askQuit} aria-label="ステージマップへもどる">
            ⬅
          </button>
          {confirmQuit && (
            <div className="confirm-overlay">
              <div className="confirm-box">
                <p className="confirm-text">⏸ やめる？</p>
                <button className="big-button" onClick={continueGame}>
                  ▶ つづける
                </button>
                <button className="sub-button" onClick={quitToMap}>
                  🗺️ やめる
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {screen === 'failed' && failInfo && (
        <div className="overlay-screen">
          <button
            className="back-button"
            onClick={() => { sfx.uiTap(); setScreen('map') }}
            aria-label="ステージマップへもどる"
          >
            ⬅
          </button>
          {/* やさしい失敗表現: 暗転させない・叱らない・すぐ再挑戦できる */}
          <div className="fail-hearts">🌫️ 🌫️ 🌫️</div>
          <h2 className="fail-heading">もやもやに つつまれちゃった！</h2>
          <p className="result-detail">だいじょうぶ！ もういちど やってみよう</p>
          <button
            className="big-button"
            onClick={() => { sfx.uiTap(); playStage(stage, failInfo.difficulty) }}
          >
            🔁 もういちど
          </button>
          <button className="sub-button" onClick={() => { sfx.uiTap(); setScreen('map') }}>
            🗺️ ステージマップへ
          </button>
        </div>
      )}

      {screen === 'result' && result && (
        <div className="overlay-screen">
          <button
            className="back-button"
            onClick={() => { sfx.uiTap(); setScreen('map') }}
            aria-label="ステージマップへもどる"
          >
            ⬅
          </button>
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
            {STAGES.find(s => s.id === result.stageId)?.title ?? ''} レベル{result.difficulty} クリア！
            {result.maxCombo >= 3 && <> さいだい れんぞく ×{result.maxCombo}！</>}
          </p>
          {next && (
            <button className="big-button" onClick={() => { sfx.uiTap(); playStage(next.stage, next.level) }}>
              {next.stage.id === result.stageId
                ? `⏫ レベル${next.level} に ちょうせん`
                : '⏩ つぎのステージ'}
            </button>
          )}
          <button
            className={next ? 'sub-button' : 'big-button'}
            onClick={() => { sfx.uiTap(); playStage(stage, result.difficulty) }}
          >
            🔁 もういっかい
          </button>
          <button className="sub-button" onClick={() => openZukan('result')}>
            📖 ずかんをみる
          </button>
          {capturedThisRun && (
            <p className="backup-hint">
              あたらしい なかまが ふえたよ！ ずかんを ほぞんしておくと あんしんだよ（ずかん → おうちのひと）
            </p>
          )}
          <button className="sub-button" onClick={() => { sfx.uiTap(); setScreen('map') }}>
            🗺️ ステージマップへ
          </button>
        </div>
      )}
    </div>
  )
}
