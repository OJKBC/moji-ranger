import { useState } from 'react'
import { stagesInCategory, CATEGORY_META } from './data/stages'
import { clearedLevelOf, isStageUnlocked, loadProgress, nextLevelOf } from './store/progress'
import { sfx } from './audio/sfx'
import { voice } from './audio/voice'
import { MAX_DIFFICULTY } from './types'
import type { DifficultyLevel, Stage, StageCategory } from './types'

/** 難易度バッジの並び（1..最高難易度） */
const LEVELS = Array.from({ length: MAX_DIFFICULTY }, (_, i) => i + 1)

/** ステージごとの見た目（マップノードの絵文字） */
const STAGE_ICONS: Record<string, string> = {
  'hiragana-a': 'あ',
  'katakana-a': 'ア',
  'word-neko': '🐱',
  'number-3': '3',
  'math-add-1': '➕',
  'math-sub-1': '➖',
  'english-abc': 'A',
  'english-words': 'ab',
  'english-meaning': '💬',
}

interface Props {
  category: StageCategory
  onSelect: (stage: Stage, level: DifficultyLevel) => void
  onBack: () => void
  onZukan: () => void
  /** くにカテゴリで「せかいずかん」を開く（world のときだけ特別ノードを出す） */
  onWorldZukan?: () => void
  /** ㊾c にがてが溜まったときだけ渡される「ふくしゅうステージ」（キラキラの特別ノード） */
  reviewStage?: Stage | null
}

/**
 * ㊹ ステージ地図。ステージが道でつながった「すごろく／街めぐり」風。
 * クリアすると道が点灯し、進んだところの街が明るくなる（浄化して街を助ける世界観）。
 *
 * 選択の自由は狭めない（⑫⑲）: カテゴリ内のステージは（解放済みなら）タップで選べる。
 * 各ステージ内の難易度ゲートは維持（クリアで次のレベルへ）。スクロール可・safe area 対応。
 */
export function StageMap({ category, onSelect, onBack, onZukan, onWorldZukan, reviewStage }: Props) {
  const progress = loadProgress()
  const stages = stagesInCategory(category)
  const meta = CATEGORY_META[category]
  // ㊽ 現在地＝最初の「解放済みでまだクリアしていない」ステージ（📍で強調）
  const currentIndex = stages.findIndex(
    s => isStageUnlocked(s, progress) && clearedLevelOf(progress, s.id) === 0,
  )
  // 難易度えらび（一度でもクリア済みのステージだけ「さいしょから／つづきから」を聞く）
  const [chooser, setChooser] = useState<{ stage: Stage; cont: DifficultyLevel } | null>(null)

  const handleSelect = (stage: Stage, unlocked: boolean) => {
    if (!unlocked) {
      sfx.wrong()
      voice.speak('まえの ステージを クリアしてね！')
      return
    }
    sfx.uiTap()
    // つづき（次の挑戦難易度）が1より上＝一度クリアしている → どこから始めるか選ばせる。
    // 前回の高い難易度に強制されず、いつでも「さいしょから（レベル1）」に戻れるようにする。
    const cont = nextLevelOf(progress, stage.id)
    if (cont > 1) {
      voice.speak('さいしょから？ つづきから？')
      setChooser({ stage, cont })
      return
    }
    // まだクリアしていないステージは、そのまま難易度1で始める。
    onSelect(stage, 1)
  }

  return (
    <div className="map-screen">
      <div className="fx-orbs" aria-hidden><span /><span /><span /><span /><span /><span /></div>
      <div className="map-header">
        <button className="icon-button" onClick={() => { sfx.uiTap(); onBack() }} aria-label="カテゴリへもどる">
          ⬅
        </button>
        <h2 className="map-title">
          <span className="map-cat-icon" style={{ color: meta.color }}>{meta.icon}</span> {meta.label}のまち
        </h2>
        <button className="icon-button zukan-button" onClick={onZukan} aria-label="ずかん">
          📖<span>ずかん</span>
        </button>
        <div className="map-total">⭐ {progress.totalStars}</div>
      </div>

      <div className="pathmap" style={{ ['--cat-color' as string]: meta.color }}>
        {/* ㊾c ふくしゅうステージ（にがてが溜まったときだけ・キラキラの特別ノード） */}
        {reviewStage && (
          <button
            className="review-stage-node"
            onClick={() => { sfx.uiTap(); onSelect(reviewStage, 1) }}
          >
            <span className="review-stage-spark" aria-hidden>✨</span>
            <span className="review-stage-icon">📖</span>
            <span className="review-stage-text">
              <b>ふくしゅうステージ</b>
              <small>にがてを おさらいしよう！</small>
            </span>
            <span className="review-stage-spark right" aria-hidden>✨</span>
          </button>
        )}
        {/* くに: せかいずかん（あつめた国旗）への入り口 */}
        {category === 'world' && onWorldZukan && (
          <button className="review-stage-node world-zukan-node" onClick={() => { sfx.uiTap(); onWorldZukan() }}>
            <span className="review-stage-icon">🌏</span>
            <span className="review-stage-text">
              <b>せかいずかん</b>
              <small>あつめた くにを みる</small>
            </span>
          </button>
        )}
        {/* スタート地点（旗） */}
        <div className="path-start">🚩 スタート</div>
        {stages.map((stage, i) => {
          const unlocked = isStageUnlocked(stage, progress)
          const cleared = clearedLevelOf(progress, stage.id)
          const isCleared = cleared > 0
          // 道の点灯: 先頭は常に点灯。以降は「前のステージをクリア済み」で点灯（道が伸びる）
          const prevCleared = i === 0 || clearedLevelOf(progress, stages[i - 1].id) > 0
          const isCurrent = i === currentIndex
          const side = i % 2 === 0 ? 'left' : 'right'
          return (
            <div key={stage.id} className={`path-step ${side}`} style={{ ['--d' as string]: `${i * 0.08}s` }}>
              <span className={`path-link ${prevCleared ? 'lit' : ''}`} aria-hidden />
              <button
                className={`path-node ${unlocked ? '' : 'locked'} ${isCleared ? 'cleared' : ''} ${isCurrent ? 'is-current' : ''}`}
                onClick={() => handleSelect(stage, unlocked)}
              >
                {isCurrent && <span className="path-here" aria-hidden>📍 いまここ</span>}
                <span className="path-node-badge">{i + 1}</span>
                <span className="path-node-icon">{unlocked ? STAGE_ICONS[stage.id] ?? '⭐' : '🔒'}</span>
                <span className="path-node-name">{stage.title}</span>
                <span className="stage-levels">
                  {LEVELS.map(n => (
                    <span
                      key={n}
                      className={
                        n <= cleared ? 'level-badge done'
                          : unlocked && n === cleared + 1 ? 'level-badge next'
                            : 'level-badge'
                      }
                    >
                      {n <= cleared ? '★' : n}
                    </span>
                  ))}
                </span>
              </button>
            </div>
          )
        })}
        {/* ゴール地点（お城＝街が助かる） */}
        <div className="path-goal">🏰 ゴール</div>
      </div>

      {/* 難易度えらび: 前回の続き（高い難易度）に強制されず、最初から/つづきから 選べる */}
      {chooser && (
        <div className="confirm-overlay" onClick={() => { sfx.uiTap(); setChooser(null) }}>
          <div className="confirm-box level-choose" onClick={e => e.stopPropagation()}>
            <p className="confirm-text">{chooser.stage.title}</p>
            <p className="level-choose-sub">どこから はじめる？</p>
            <button className="big-button" onClick={() => { sfx.uiTap(); onSelect(chooser.stage, 1) }}>
              ▶ さいしょから（レベル1）
            </button>
            <button className="big-button" onClick={() => { sfx.uiTap(); onSelect(chooser.stage, chooser.cont) }}>
              ⏩ つづきから（レベル{chooser.cont}）
            </button>
            <button className="sub-button" onClick={() => { sfx.uiTap(); setChooser(null) }}>
              🗺️ もどる
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
