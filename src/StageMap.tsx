import { STAGES } from './data/stages'
import { loadProgress } from './store/progress'
import { sfx } from './audio/sfx'
import { voice } from './audio/voice'
import type { Stage } from './types'

/** ステージごとの見た目（マップカードの絵文字と色） */
const STAGE_ICONS: Record<string, string> = {
  'hiragana-a': 'あ',
  'word-neko': '🐱',
  'number-3': '3',
  'math-add-1': '➕',
}

interface Props {
  onSelect: (stage: Stage) => void
  onBack: () => void
}

/**
 * ステージマップ。読めない子でも進められるよう、
 * 大きなカード・絵文字・★表示・カギ🔒だけで構成する。
 */
export function StageMap({ onSelect, onBack }: Props) {
  const progress = loadProgress()

  const handleSelect = (stage: Stage, unlocked: boolean) => {
    if (!unlocked) {
      sfx.wrong()
      voice.speak('まえの ステージを クリアしてね！')
      return
    }
    sfx.uiTap()
    onSelect(stage)
  }

  return (
    <div className="map-screen">
      <div className="map-header">
        <button className="icon-button" onClick={onBack} aria-label="タイトルへ">
          🏠
        </button>
        <h2 className="map-title">ステージをえらぼう！</h2>
        <div className="map-total">⭐ {progress.totalStars}</div>
      </div>
      <div className="map-grid">
        {STAGES.map((stage, i) => {
          const unlocked = progress.unlockedStages.includes(stage.id)
          const stars = progress.stageStars[stage.id] ?? 0
          return (
            <button
              key={stage.id}
              className={unlocked ? 'stage-card' : 'stage-card locked'}
              onClick={() => handleSelect(stage, unlocked)}
            >
              <span className="stage-number">{i + 1}</span>
              <span className="stage-icon">{unlocked ? STAGE_ICONS[stage.id] ?? '⭐' : '🔒'}</span>
              <span className="stage-name">{stage.title}</span>
              <span className="stage-stars">
                {[1, 2, 3].map(n => (
                  <span key={n} className={n <= stars ? 'mini-star on' : 'mini-star'}>★</span>
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
