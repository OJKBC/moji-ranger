import { useState } from 'react'
import { ALL_MONSTER_IDS, monsterImageUrl, monsterName } from './data/monsterNames'
import { loadProgress } from './store/progress'
import { sfx } from './audio/sfx'
import { voice } from './audio/voice'

interface Props {
  onBack: () => void
}

/**
 * ずかん（図鑑）。なかまにしたモンスターは画像＋なまえ、
 * まだのモンスターは明るい「？」カードで表示する。
 * タップで大きく表示して、なまえを読み上げる。
 */
export function Zukan({ onBack }: Props) {
  const progress = loadProgress()
  const captured = new Set(progress.capturedMonsters)
  const [selected, setSelected] = useState<string | null>(null)

  const open = (id: string) => {
    sfx.uiTap()
    setSelected(id)
    voice.speak(`${monsterName(id)}！`)
  }

  return (
    <div className="map-screen zukan-screen">
      <div className="map-header">
        <button className="icon-button" onClick={() => { sfx.uiTap(); onBack() }} aria-label="もどる">
          ⬅
        </button>
        <h2 className="map-title">ずかん</h2>
        {/* 収集カウント: 数字＋ボールで読めない子にも伝わる */}
        <div className="map-total zukan-count">
          <img src={`${import.meta.env.BASE_URL}assets/balls/ball-red.png`} alt="" />
          {captured.size} / {ALL_MONSTER_IDS.length}
        </div>
      </div>
      <div className="map-grid zukan-grid">
        {ALL_MONSTER_IDS.map(id => {
          const got = captured.has(id)
          return got ? (
            <button key={id} className="zukan-card" onClick={() => open(id)}>
              <img className="zukan-img" src={monsterImageUrl(id)} alt={monsterName(id)} />
              <span className="zukan-name">{monsterName(id)}</span>
            </button>
          ) : (
            <div key={id} className="zukan-card zukan-unknown">
              <span className="zukan-q">？</span>
            </div>
          )
        })}
      </div>

      {selected && (
        <div className="zukan-modal" onClick={() => { sfx.uiTap(); setSelected(null) }}>
          <div className="zukan-modal-box">
            <img className="zukan-modal-img" src={monsterImageUrl(selected)} alt="" />
            <p className="zukan-modal-name">{monsterName(selected)}</p>
            <button
              className="icon-button zukan-speak"
              onClick={e => { e.stopPropagation(); sfx.uiTap(); voice.speak(`${monsterName(selected)}！`) }}
              aria-label="なまえをきく"
            >
              🔊
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
