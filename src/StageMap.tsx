import { STAGES } from './data/stages'
import { clearedLevelOf, isStageUnlocked, loadProgress } from './store/progress'
import { sfx } from './audio/sfx'
import { voice } from './audio/voice'
import type { DifficultyLevel, Stage } from './types'

/** ステージごとの見た目（マップカードの絵文字と色） */
const STAGE_ICONS: Record<string, string> = {
  'hiragana-a': 'あ',
  'katakana-a': 'ア',
  'word-neko': '🐱',
  'number-3': '3',
  'math-add-1': '➕',
}

interface Props {
  onSelect: (stage: Stage, level: DifficultyLevel) => void
  onBack: () => void
  onZukan: () => void
}

/**
 * ステージマップ。読めない子でも進められるよう、
 * 大きなカード・絵文字・カギ🔒だけで構成する。
 * 各ステージは難易度1→2→3の3段階。カードには難易度進捗バッジを表示し、
 * タップすると「次に挑戦する難易度」で始まる（全クリア後は3で遊べる）。
 */
export function StageMap({ onSelect, onBack, onZukan }: Props) {
  const progress = loadProgress()

  const handleSelect = (stage: Stage, unlocked: boolean) => {
    if (!unlocked) {
      sfx.wrong()
      voice.speak('まえの ステージを クリアしてね！')
      return
    }
    sfx.uiTap()
    // どのステージも必ず難易度1から始める（クリアでレベル2→3へ進行）。
    // バッジは最高到達度の表示として維持し、クリア済みでも何度でも遊び直せる
    onSelect(stage, 1)
  }

  return (
    <div className="map-screen">
      <div className="map-header">
        <button className="icon-button" onClick={onBack} aria-label="タイトルへ">
          🏠
        </button>
        <h2 className="map-title">ステージをえらぼう！</h2>
        {/* ずかん（読めない子にも分かるアイコン＋表記） */}
        <button className="icon-button zukan-button" onClick={onZukan} aria-label="ずかん">
          📖<span>ずかん</span>
        </button>
        <div className="map-total">⭐ {progress.totalStars}</div>
      </div>
      <div className="map-grid">
        {STAGES.filter(s => !s.hidden).map((stage, i) => {
          const unlocked = isStageUnlocked(stage, progress)
          const cleared = clearedLevelOf(progress, stage.id)
          return (
            <button
              key={stage.id}
              className={unlocked ? 'stage-card' : 'stage-card locked'}
              onClick={() => handleSelect(stage, unlocked)}
            >
              <span className="stage-number">{i + 1}</span>
              <span className="stage-icon">{unlocked ? STAGE_ICONS[stage.id] ?? '⭐' : '🔒'}</span>
              <span className="stage-name">{stage.title}</span>
              {/* 難易度進捗: クリア済み=点灯 / 次に挑戦=ふちどり / 未到達=うすく */}
              <span className="stage-levels">
                {([1, 2, 3] as const).map(n => (
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
          )
        })}
      </div>
    </div>
  )
}
