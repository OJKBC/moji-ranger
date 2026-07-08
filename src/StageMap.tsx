import { stagesInCategory, CATEGORY_META } from './data/stages'
import { clearedLevelOf, isStageUnlocked, loadProgress } from './store/progress'
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
  'english-abc': 'A',
  'english-words': 'ab',
  'english-meaning': '💬',
}

interface Props {
  category: StageCategory
  onSelect: (stage: Stage, level: DifficultyLevel) => void
  onBack: () => void
  onZukan: () => void
}

/**
 * ㊹ ステージ地図。ステージが道でつながった「すごろく／街めぐり」風。
 * クリアすると道が点灯し、進んだところの街が明るくなる（浄化して街を助ける世界観）。
 *
 * 選択の自由は狭めない（⑫⑲）: カテゴリ内のステージは（解放済みなら）タップで選べる。
 * 各ステージ内の難易度ゲートは維持（クリアで次のレベルへ）。スクロール可・safe area 対応。
 */
export function StageMap({ category, onSelect, onBack, onZukan }: Props) {
  const progress = loadProgress()
  const stages = stagesInCategory(category)
  const meta = CATEGORY_META[category]

  const handleSelect = (stage: Stage, unlocked: boolean) => {
    if (!unlocked) {
      sfx.wrong()
      voice.speak('まえの ステージを クリアしてね！')
      return
    }
    sfx.uiTap()
    // どのステージも必ず難易度1から始める（クリアでレベル2→3…へ進行）。
    onSelect(stage, 1)
  }

  return (
    <div className="map-screen">
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
        {/* スタート地点（旗） */}
        <div className="path-start">🚩 スタート</div>
        {stages.map((stage, i) => {
          const unlocked = isStageUnlocked(stage, progress)
          const cleared = clearedLevelOf(progress, stage.id)
          const isCleared = cleared > 0
          // 道の点灯: 先頭は常に点灯。以降は「前のステージをクリア済み」で点灯（道が伸びる）
          const prevCleared = i === 0 || clearedLevelOf(progress, stages[i - 1].id) > 0
          const side = i % 2 === 0 ? 'left' : 'right'
          return (
            <div key={stage.id} className={`path-step ${side}`}>
              <span className={`path-link ${prevCleared ? 'lit' : ''}`} aria-hidden />
              <button
                className={`path-node ${unlocked ? '' : 'locked'} ${isCleared ? 'cleared' : ''}`}
                onClick={() => handleSelect(stage, unlocked)}
              >
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
    </div>
  )
}
