import { useState } from 'react'
import { COUNTRIES, countryByCode, countryName, flagUrl } from './data/countries'
import { loadProgress } from './store/progress'
import { sfx } from './audio/sfx'
import { voice } from './audio/voice'

interface Props {
  onBack: () => void
}

/**
 * せかいずかん（くにの図鑑）。正解してあつめた国は国旗＋なまえ、
 * まだの国は明るい「？」カードで表示する。タップで大きく＋なまえと特徴を読み上げ。
 * 仕組み・見た目はモンスターの「ずかん」と揃える（別コレクション）。
 */
export function WorldZukan({ onBack }: Props) {
  const progress = loadProgress()
  const collected = new Set(progress.collectedCountries)
  const collectedCount = COUNTRIES.filter(c => collected.has(c.code)).length
  const [selected, setSelected] = useState<string | null>(null)

  const open = (code: string) => {
    sfx.uiTap()
    setSelected(code)
    voice.speakCountry(countryName(code))
  }

  const selCountry = selected ? countryByCode(selected) : null

  return (
    <div className="map-screen zukan-screen">
      <div className="map-header">
        <button className="icon-button" onClick={() => { sfx.uiTap(); onBack() }} aria-label="もどる">
          ⬅
        </button>
        <h2 className="map-title">せかいずかん</h2>
        <div className="map-total zukan-count">
          🌏 {collectedCount} / {COUNTRIES.length}
        </div>
      </div>
      <p className="buddy-status">
        {collectedCount === 0
          ? '🌏 こっきクイズで せいかいすると、くにが あつまるよ！'
          : <>🌏 あつめた くに: <b>{collectedCount}こく</b></>}
      </p>
      <div className="map-grid zukan-grid">
        {COUNTRIES.map(c => {
          const got = collected.has(c.code)
          return got ? (
            <button key={c.code} className="zukan-card" onClick={() => open(c.code)}>
              <img className="zukan-img zukan-flag" src={flagUrl(c.code)} alt={c.name} />
              <span className="zukan-name">{c.name}</span>
            </button>
          ) : (
            <div key={c.code} className="zukan-card zukan-unknown">
              <span className="zukan-q">？</span>
            </div>
          )
        })}
      </div>

      {selected && selCountry && (
        <div className="zukan-modal" onClick={() => { sfx.uiTap(); setSelected(null) }}>
          <div className="zukan-modal-box" onClick={e => e.stopPropagation()}>
            <img className="zukan-modal-img zukan-modal-flag" src={flagUrl(selected)} alt="" />
            <p className="zukan-modal-name">{selCountry.name}</p>
            <ul className="country-facts on-all">
              {selCountry.characteristics.map((f, i) => <li key={i} className="on">{f}</li>)}
            </ul>
            <button
              className="icon-button zukan-speak"
              onClick={e => {
                e.stopPropagation(); sfx.uiTap()
                voice.speakCountry(selCountry.name)
              }}
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
