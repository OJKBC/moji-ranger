import { useEffect, useMemo, useRef, useState } from 'react'
import WorldMap from '@svg-maps/world'
import { countryByCode, countryName, flagUrl } from './data/countries'
import { voice } from './audio/voice'
import { sfx } from './audio/sfx'

interface Props {
  /** 正解した国コード（ISO alpha-2） */
  code: string
  /** 紹介演出が終わったら呼ぶ（ゲーム側の続きを進める） */
  onDone: () => void
}

/**
 * くにの正解後に出す「世界地図＋特徴」紹介オーバーレイ（共通エンジンの上に重ねる演出）。
 * - 世界地図で「日本（青）」と「出題国（オレンジで光る）」をハイライトし、位置関係を見せる。
 * - 国名 → 特徴を2〜3個、やさしい音声で順に読み上げる（テンポよく5〜8秒）。
 * - 「▶ つぎへ」でいつでもスキップできる。
 * 地図データ: @svg-maps/world（CC-BY-4.0）。
 */
export function CountryIntro({ code, onDone }: Props) {
  const country = countryByCode(code)
  const name = countryName(code)
  // 雑学は3つストックしておき、そのプレイではランダムで1つだけ出す
  const fact = useMemo(() => {
    const cs = country?.characteristics ?? []
    return cs.length ? cs[Math.floor(Math.random() * cs.length)] : ''
  }, [code]) // eslint-disable-line react-hooks/exhaustive-deps
  const [showFact, setShowFact] = useState(false)
  const doneRef = useRef(false)

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    voice.cancel()
    onDone()
  }

  useEffect(() => {
    // 国名 → 雑学を1つ読み上げる。少し余韻を置いて自動で閉じる。
    const timers: ReturnType<typeof setTimeout>[] = []
    sfx.uiTap()
    voice.speakCountry(name)
    timers.push(setTimeout(() => { setShowFact(true); if (fact) voice.speakCountry(fact) }, 1200))
    timers.push(setTimeout(finish, 4200))
    return () => timers.forEach(clearTimeout)
    // code が変わるたびに演出を作り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  return (
    <div className="country-intro" onClick={finish}>
      <div className="country-intro-card" onClick={e => e.stopPropagation()}>
        <div className="country-intro-head">
          <img className="country-intro-flag" src={flagUrl(code)} alt="" />
          <span className="country-intro-name">{name}</span>
        </div>

        <div className="country-map-wrap">
          <svg className="country-map" viewBox={WorldMap.viewBox} role="img" aria-label={`${name}の ばしょ`}>
            {WorldMap.locations.map(loc => {
              const cls = loc.id === code ? 'wm-target' : loc.id === 'jp' ? 'wm-japan' : 'wm-land'
              return <path key={loc.id} d={loc.path} className={cls} />
            })}
          </svg>
          {/* はんれい（日本＝あお / この くに＝オレンジ） */}
          <div className="country-map-legend">
            <span><i className="lg lg-jp" /> にほん</span>
            <span><i className="lg lg-target" /> {name}</span>
          </div>
        </div>

        {/* 雑学（ランダムで1つ・読み上げに合わせて点灯。読める子のために文字も出す） */}
        <ul className="country-facts">
          <li className={showFact ? 'on' : ''}>{fact}</li>
        </ul>

        <button className="big-button country-intro-next" onClick={finish}>▶ つぎへ</button>
      </div>
    </div>
  )
}
