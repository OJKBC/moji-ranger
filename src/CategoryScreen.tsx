import { CATEGORY_META, CATEGORY_ORDER, stagesInCategory } from './data/stages'
import { loadProgress, clearedLevelOf } from './store/progress'
import { sfx } from './audio/sfx'
import { voice } from './audio/voice'
import type { StageCategory } from './types'

interface Props {
  onSelect: (category: StageCategory) => void
  onBack: () => void
  onZukan: () => void
}

/**
 * ㊺ 大枠カテゴリ選択（にほんご / えいご / さんすう）。
 * 読めない子にも分かるよう、大きな絵（あ / A / 123）＋色＋音声で区別する。
 * タップでそのカテゴリのステージ地図へ。もどるでタイトルへ。
 */
export function CategoryScreen({ onSelect, onBack, onZukan }: Props) {
  const progress = loadProgress()

  const pick = (category: StageCategory) => {
    sfx.uiTap()
    voice.speak(CATEGORY_META[category].voice)
    onSelect(category)
  }

  return (
    <div className="map-screen category-screen">
      <div className="map-header">
        <button className="icon-button" onClick={() => { sfx.uiTap(); onBack() }} aria-label="タイトルへ">
          🏠
        </button>
        <h2 className="map-title">なにで あそぶ？</h2>
        <button className="icon-button zukan-button" onClick={onZukan} aria-label="ずかん">
          📖<span>ずかん</span>
        </button>
        <div className="map-total">⭐ {progress.totalStars}</div>
      </div>

      <div className="category-grid">
        {CATEGORY_ORDER.map(cat => {
          const meta = CATEGORY_META[cat]
          const stages = stagesInCategory(cat)
          const cleared = stages.filter(s => clearedLevelOf(progress, s.id) > 0).length
          return (
            <button
              key={cat}
              className="category-card"
              style={{ ['--cat-color' as string]: meta.color }}
              onClick={() => pick(cat)}
            >
              <span className="category-icon">{meta.icon}</span>
              <span className="category-label">{meta.label}</span>
              <span className="category-progress">
                {'★'.repeat(cleared)}{'☆'.repeat(Math.max(0, stages.length - cleared))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
