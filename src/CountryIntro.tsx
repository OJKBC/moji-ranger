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
  const chars = useMemo(() => country?.characteristics ?? [], [country])
  // いま光らせている特徴（-1=国名だけ）。読み上げに合わせて1つずつ点灯
  const [step, setStep] = useState(-1)
  const doneRef = useRef(false)

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    voice.cancel()
    onDone()
  }

  useEffect(() => {
    // 国名 → 特徴を順に読み上げ（各クリップは Nanami 音声）。最後まで出したら少し待って終了。
    const timers: ReturnType<typeof setTimeout>[] = []
    sfx.uiTap()
    voice.speakCountry(name)
    const GAP = 2200 // 1文ぶんの間（テンポ優先）
    chars.forEach((c, i) => {
      timers.push(setTimeout(() => {
        setStep(i)
        voice.speakCountry(c)
      }, 1200 + i * GAP))
    })
    // 最後の特徴のあと、少し余韻を置いて自動で閉じる
    timers.push(setTimeout(finish, 1200 + chars.length * GAP + 1400))
    return () => timers.forEach(clearTimeout)
    // code が変わるたびに演出を作り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  return (
    <div className="overlay-screen country-intro" onClick={finish}>
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

        {/* 特徴（読み上げに合わせて点灯。読める子のために文字も出す） */}
        <ul className="country-facts">
          {chars.map((c, i) => (
            <li key={i} className={i <= step ? 'on' : ''}>{c}</li>
          ))}
        </ul>

        <button className="big-button country-intro-next" onClick={finish}>▶ つぎへ</button>
      </div>
    </div>
  )
}
