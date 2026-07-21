import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { EventBus } from './EventBus'
import { PhaserGame } from './game/PhaserGame'
import { STAGES, categoryOf, makeReviewStage } from './data/stages'
import { StageMap } from './StageMap'
import { isSpeechSupported } from './speech'
import { CategoryScreen } from './CategoryScreen'
import { LoginBonus } from './LoginBonus'
import { Zukan } from './Zukan'
import { WorldZukan } from './WorldZukan'
// くにの世界地図（@svg-maps/world）は大きいので、くにステージを遊ぶときだけ遅延読み込みする
const CountryIntro = lazy(() => import('./CountryIntro').then(m => ({ default: m.CountryIntro })))
import { REVIEW_MIN_WEAK, canClaimBonus, isStageUnlocked, loadProgress, weakKanaForReview } from './store/progress'
import { sfx } from './audio/sfx'
import { voice } from './audio/voice'
import { MAX_DIFFICULTY } from './types'
import type { DifficultyLevel, Stage, StageCategory, StageResult } from './types'
import bgUrl from './assets/bg.jpg'

/** タイトル画面に出す登場モンスター（public/assets/monsters/ から） */
const monsterUrl = (file: string) => `${import.meta.env.BASE_URL}assets/monsters/${file}`

type Screen = 'title' | 'category' | 'map' | 'game' | 'mic-consent' | 'result' | 'failed' | 'zukan' | 'world-zukan'

/** ㊿「よむ」ステージ初回に一度だけ表示する保護者向けマイク同意（記録すれば次回以降は省略） */
const MIC_CONSENT_KEY = 'moji-ranger-mic-consent'

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
  /** ずかんを閉じたとき戻る画面（カテゴリ or マップ or リザルト） */
  const [zukanFrom, setZukanFrom] = useState<Screen>('category')
  /** ㊺ 選択中の大枠カテゴリ（にほんご/えいご/さんすう） */
  const [category, setCategory] = useState<StageCategory>('jp')
  /** ㊷ ログインボーナス表示中か（1日1回・その日はじめて開いたとき） */
  const [bonusOpen, setBonusOpen] = useState(false)
  /** くに: 正解後の「世界地図＋特徴」オーバーレイに出す国コード（null=非表示） */
  const [countryIntro, setCountryIntro] = useState<string | null>(null)

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
    // くに: 国旗を正解 → 世界地図＋特徴オーバーレイを開く（閉じるとゲーム側の続きが進む）
    const onCountryIntro = (p: { code: string }) => setCountryIntro(p.code)
    EventBus.on('stage-clear', onClear)
    EventBus.on('stage-failed', onFailed)
    EventBus.on('monster-captured', onCaptured)
    EventBus.on('country-intro', onCountryIntro)
    return () => {
      document.removeEventListener('pointerdown', unlockAudio)
      EventBus.off('stage-clear', onClear)
      EventBus.off('stage-failed', onFailed)
      EventBus.off('monster-captured', onCaptured)
      EventBus.off('country-intro', onCountryIntro)
    }
  }, [])

  const openCategory = useCallback(() => {
    // 最初のユーザー操作の中で音声をアンロックする（iOS/Android 対策）
    sfx.unlock()
    voice.init()
    sfx.uiTap()
    // ㊷ その日はじめて開いたときだけログインボーナス（逃してもペナルティなし）
    if (canClaimBonus()) setBonusOpen(true)
    setScreen('category')
  }, [])

  const chooseCategory = useCallback((cat: StageCategory) => {
    setCategory(cat)
    setScreen('map')
  }, [])

  const playStage = useCallback((s: Stage, level: DifficultyLevel) => {
    setStage(s)
    setDifficulty(level)
    setCategory(categoryOf(s)) // 地図と直前に遊んだステージのカテゴリを合わせる
    setConfirmQuit(false)
    setCapturedThisRun(false)
    // ㊿「よむ」は共通エンジンで遊ぶ（画面・進行は他ステージと同じ）。ただし初回だけ、
    //   ゲーム開始前に保護者向けのマイク同意を挟む（同意後は毎回そのままゲームへ）。
    // 音声認識が使える端末で、まだ同意していないときだけマイク案内を出す
    // （使えない端末はタップで遊ぶのでマイク案内は不要）。
    if (s.mode === 'read' && isSpeechSupported() && localStorage.getItem(MIC_CONSENT_KEY) !== '1') {
      setScreen('mic-consent')
      return
    }
    setPlayKey(k => k + 1)
    setScreen('game')
  }, [])

  // マイク同意 → 共通エンジンで「よむ」ステージを開始
  const acceptMicConsent = useCallback(() => {
    sfx.uiTap()
    localStorage.setItem(MIC_CONSENT_KEY, '1')
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
  // ㊾c にほんごの地図で、にがてかなが一定数たまったら「ふくしゅうステージ」を出す。
  //   クリアや習熟でにがてが減れば、再計算で自動的に消える。
  const reviewStage = (screen === 'map' && category === 'jp')
    ? (() => { const weak = weakKanaForReview(); return weak.length >= REVIEW_MIN_WEAK ? makeReviewStage(weak) : null })()
    : null
  const isReviewResult = result?.stageId === 'review-jp'

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
          <button className="big-button title-start" onClick={openCategory}>
            ▶ スタート
          </button>
          <p className="title-note">おとが でるよ 🔊</p>
        </div>
      )}

      {screen === 'category' && (
        <CategoryScreen
          onSelect={chooseCategory}
          onBack={backToTitle}
          onZukan={() => openZukan('category')}
        />
      )}

      {screen === 'map' && (
        <StageMap
          category={category}
          onSelect={playStage}
          onBack={() => { sfx.uiTap(); setScreen('category') }}
          onZukan={() => openZukan('map')}
          onWorldZukan={() => { sfx.uiTap(); setScreen('world-zukan') }}
          reviewStage={reviewStage}
        />
      )}

      {screen === 'zukan' && <Zukan onBack={() => setScreen(zukanFrom)} />}
      {screen === 'world-zukan' && <WorldZukan onBack={() => { sfx.uiTap(); setScreen('map') }} />}

      {/* くに: 正解後の世界地図＋特徴オーバーレイ（ゲーム画面の上に重ねる。閉じると続行） */}
      {countryIntro && (
        <Suspense fallback={null}>
          <CountryIntro
            code={countryIntro}
            onDone={() => { setCountryIntro(null); EventBus.emit('country-intro-done') }}
          />
        </Suspense>
      )}

      {/* ㊷ ログインボーナス（1日1回・カテゴリ画面の上に重ねて出す） */}
      {bonusOpen && (
        <LoginBonus
          onCaptured={() => setCapturedThisRun(true)}
          onClose={() => setBonusOpen(false)}
        />
      )}

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

      {screen === 'mic-consent' && (
        <div className="overlay-screen">
          <div className="reading-consent">
            <h2>🎤 「よむ」の あそびかた</h2>
            <p className="reading-consent-lead">もじを こえに だして よむと、モンスターを きよめられるよ！</p>
            <p className="reading-consent-note">
              おうちのかたへ: このステージは <b>マイク</b> を つかいます。声は <b>この端末の中だけで判定</b>し、
              録音の保存・送信は一切しません。次の画面でマイクの使用を「許可」してください。
            </p>
            <button className="big-button" onClick={acceptMicConsent}>▶ はじめる</button>
            <button className="sub-button" onClick={() => { sfx.uiTap(); setScreen('map') }}>やめる</button>
          </div>
        </div>
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
          <h2 className="result-heading">{isReviewResult ? '🌟 ふくしゅう だいせいこう！' : 'よくできました！'}</h2>
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
            {isReviewResult
              ? 'にがてを たくさん おさらいできたね！'
              : <>{STAGES.find(s => s.id === result.stageId)?.title ?? (result.stageId === stage.id ? stage.title : '')} レベル{result.difficulty} クリア！{result.maxCombo >= 3 && <> さいだい れんぞく ×{result.maxCombo}！</>}</>}
          </p>
          {result.reviewItem && <ReviewCard item={result.reviewItem} />}
          {next && (
            <button className="big-button" onClick={() => { sfx.uiTap(); playStage(next.stage, next.level) }}>
              {next.stage.id === result.stageId
                ? `⏫ レベル${next.level} に ちょうせん`
                : '⏩ つぎのステージ'}
            </button>
          )}
          {/* 子どもが間違えて押しやすい「もういっかい」「ステージマップへ」は撤去。
             もどるは左上の ⬅ だけに集約（本人の明示要望）。
             残すのは「レベル●のちょうせん（＝next）」と「ずかんをみる」のみ。 */}
          <button className={next ? 'sub-button' : 'big-button'} onClick={() => openZukan('result')}>
            📖 ずかんをみる
          </button>
          {capturedThisRun && (
            <p className="backup-hint">
              あたらしい なかまが ふえたよ！ ずかんを ほぞんしておくと あんしんだよ（ずかん → おうちのひと）
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * ㊾b クリア後の「にがて振り返り」。そのプレイで一番間違えた項目を大きく1つ出して読み上げる。
 * 叱らず前向きに（「これは『ぬ』だよ」）。間違いゼロなら親側で描画しない（ここには来ない）。
 */
function ReviewCard({ item }: { item: NonNullable<StageResult['reviewItem']> }) {
  const say = useCallback(() => {
    if (item.en) voice.speakEn(item.read)
    else if (item.read) voice.speak(item.read)
  }, [item])
  useEffect(() => {
    // 称賛の直後に、そっと1つだけ復習する
    const t = setTimeout(say, 1000)
    return () => clearTimeout(t)
  }, [say])
  return (
    <div className="review-card">
      <span className="review-label">💡 きょうの おさらい</span>
      <div className="review-item">
        {item.icon && <span className="review-icon">{item.icon}</span>}
        <span className="review-text">{item.text}</span>
      </div>
      <button className="review-replay" onClick={() => { sfx.uiTap(); say() }}>🔊 もういちど</button>
    </div>
  )
}
