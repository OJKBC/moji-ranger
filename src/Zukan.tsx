import { useRef, useState } from 'react'
import { CAPTURABLE_MONSTER_IDS, monsterImageUrl, monsterName } from './data/monsterNames'
import { exportSave, getBuddy, importSave, loadProgress, setBuddy } from './store/progress'
import { sfx } from './audio/sfx'
import { voice } from './audio/voice'

interface Props {
  onBack: () => void
}

/** 保存ファイル名: mojiranger-save-YYYYMMDD.json */
function saveFileName(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `mojiranger-save-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`
}

/** Base64（UTF-8対応）との相互変換（機種変・端末またぎのコード共有用） */
const toCode = (json: string) => btoa(String.fromCharCode(...new TextEncoder().encode(json)))
const fromCode = (code: string) => new TextDecoder().decode(Uint8Array.from(atob(code.trim()), c => c.charCodeAt(0)))

/**
 * ずかん（図鑑）。なかまにしたモンスターは画像＋なまえ、
 * まだのモンスターは明るい「？」カードで表示する。
 * タップで大きく表示して、なまえを読み上げる。
 */
export function Zukan({ onBack }: Props) {
  const progress = loadProgress()
  const captured = new Set(progress.capturedMonsters)
  // 図鑑に載るのは「つよい（capturable）」だけ。総数・カウントもつよい基準
  const capturedCount = CAPTURABLE_MONSTER_IDS.filter(id => captured.has(id)).length
  const [selected, setSelected] = useState<string | null>(null)
  // ㊸ あいぼう（相棒）。図鑑から選ぶ・変更する
  const [buddy, setBuddyState] = useState<string | null>(() => getBuddy(progress))

  const chooseBuddy = (id: string) => {
    sfx.uiTap()
    const next = buddy === id ? null : id // もう一度押すと解除
    setBuddy(next)
    setBuddyState(next)
    if (next) voice.speak('あいぼうにするね')
  }

  // 保護者メニュー（親ゲート: 大人向けの計算問題を解くと開く）
  const [parentStep, setParentStep] = useState<'closed' | 'gate' | 'menu' | 'confirm'>('closed')
  const [gate] = useState(() => {
    const a = 6 + Math.floor(Math.random() * 4) // 6..9
    const b = 6 + Math.floor(Math.random() * 4)
    return { a, b }
  })
  const [gateInput, setGateInput] = useState('')
  const [pasteCode, setPasteCode] = useState('')
  const [pendingImport, setPendingImport] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const open = (id: string) => {
    sfx.uiTap()
    setSelected(id)
    voice.speak(`${monsterName(id)}！`)
  }

  const checkGate = () => {
    sfx.uiTap()
    if (Number(gateInput) === gate.a * gate.b) {
      setParentStep('menu')
      setNotice('')
    } else {
      setGateInput('')
    }
  }

  const downloadSave = () => {
    sfx.uiTap()
    const blob = new Blob([exportSave()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = saveFileName()
    a.click()
    URL.revokeObjectURL(url)
    setNotice('ほぞんファイルを ダウンロードしました')
  }

  const copyCode = async () => {
    sfx.uiTap()
    try {
      await navigator.clipboard.writeText(toCode(exportSave()))
      setNotice('コードを コピーしました（メモ帳などに はりつけて ほかんしてね）')
    } catch {
      setNotice('コピーできませんでした。ファイル保存を つかってね')
    }
  }

  const onFileChosen = async (file: File | null) => {
    if (!file) return
    setPendingImport(await file.text())
    setParentStep('confirm')
  }

  const onPasteRestore = () => {
    sfx.uiTap()
    if (!pasteCode.trim()) return
    try {
      setPendingImport(fromCode(pasteCode))
      setParentStep('confirm')
    } catch {
      setNotice('コードが ちがうみたい。もういちど かくにんしてね')
    }
  }

  const doImport = () => {
    sfx.uiTap()
    if (pendingImport && importSave(pendingImport)) {
      // 復元完了 → 画面全体を新しいデータで読み直す
      window.location.reload()
    } else {
      setPendingImport(null)
      setParentStep('menu')
      setNotice('よみこめませんでした。ファイル/コードを かくにんしてね')
    }
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
          {capturedCount} / {CAPTURABLE_MONSTER_IDS.length}
        </div>
      </div>
      {/* ㊸ あいぼうの案内（なかまがいなければ集めるよう促す） */}
      <p className="buddy-status">
        {capturedCount === 0
          ? '🤝 まずは なかまを あつめよう！（なかまを タップして あいぼうに できるよ）'
          : buddy
            ? <>🤝 いまの あいぼう: <b>{monsterName(buddy)}</b></>
            : '🤝 なかまを タップして「あいぼう」に できるよ'}
      </p>
      <div className="map-grid zukan-grid">
        {CAPTURABLE_MONSTER_IDS.map(id => {
          const got = captured.has(id)
          return got ? (
            <button key={id} className={`zukan-card ${id === buddy ? 'is-buddy' : ''}`} onClick={() => open(id)}>
              {id === buddy && <span className="buddy-mark" aria-label="あいぼう">🤝</span>}
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

      {/* 保護者向け: ずかんの ほぞん・よみこみ（控えめな導線） */}
      <button className="parent-link" onClick={() => { sfx.uiTap(); setParentStep('gate') }}>
        👪 おうちのひとへ（ほぞん・よみこみ）
      </button>

      {selected && (
        <div className="zukan-modal" onClick={() => { sfx.uiTap(); setSelected(null) }}>
          <div className="zukan-modal-box">
            {selected === buddy && <div className="buddy-badge-big">🤝 いま あいぼう中！</div>}
            <img className="zukan-modal-img" src={monsterImageUrl(selected)} alt="" />
            <p className="zukan-modal-name">{monsterName(selected)}</p>
            <button
              className="icon-button zukan-speak"
              onClick={e => { e.stopPropagation(); sfx.uiTap(); voice.speak(`${monsterName(selected)}！`) }}
              aria-label="なまえをきく"
            >
              🔊
            </button>
            {/* ㊾ あいぼうに選ぶ（もう一度で解除）。大きく・分かりやすく・押したくなるボタン */}
            <button
              className={`buddy-set-btn ${selected === buddy ? 'is-active' : ''}`}
              onClick={e => { e.stopPropagation(); chooseBuddy(selected) }}
            >
              <span className="buddy-set-icon">{selected === buddy ? '✅' : '⭐'}</span>
              <span className="buddy-set-text">
                {selected === buddy ? 'あいぼうを やめる' : 'あいぼうに する！'}
              </span>
            </button>
          </div>
        </div>
      )}

      {parentStep !== 'closed' && (
        <div className="zukan-modal" onClick={() => setParentStep('closed')}>
          <div className="zukan-modal-box parent-box" onClick={e => e.stopPropagation()}>
            {parentStep === 'gate' && (
              <>
                <p className="parent-title">おうちのひと かくにん</p>
                <p className="parent-note">{gate.a} × {gate.b} = ?</p>
                <input
                  className="parent-input"
                  type="number"
                  value={gateInput}
                  onChange={e => setGateInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && checkGate()}
                />
                <button className="sub-button" onClick={checkGate}>すすむ</button>
              </>
            )}
            {parentStep === 'menu' && (
              <>
                <p className="parent-title">ずかんの ほぞん・よみこみ</p>
                <button className="sub-button" onClick={downloadSave}>📥 ファイルに ほぞんする</button>
                <button className="sub-button" onClick={() => { sfx.uiTap(); fileInputRef.current?.click() }}>
                  📂 ファイルから よみこむ
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                  onChange={e => onFileChosen(e.target.files?.[0] ?? null)}
                />
                <button className="sub-button" onClick={copyCode}>📋 コードを コピー（べつの たんまつ用）</button>
                <textarea
                  className="parent-paste"
                  placeholder="コードを ここに はりつけて ↓ をおす"
                  value={pasteCode}
                  onChange={e => setPasteCode(e.target.value)}
                />
                <button className="sub-button" onClick={onPasteRestore}>🔁 コードから もどす</button>
                {notice && <p className="parent-note">{notice}</p>}
                {/* ㊼ マナーモードの案内（保護者向け・控えめに） */}
                <p className="parent-note parent-audio-note">
                  🔈 音が出ないときは、iPhone の「マナーモード（サイレントスイッチ）」を
                  解除してください。ブラウザでは自動で解除できないことがあります。
                </p>
                <button className="sub-button" onClick={() => { sfx.uiTap(); setParentStep('closed') }}>とじる</button>
              </>
            )}
            {parentStep === 'confirm' && (
              <>
                <p className="parent-title">いまのデータに うわがきするよ</p>
                <p className="parent-note">よみこむと、いまの ずかん・きろくが よみこんだ内容に おきかわります。</p>
                <button className="big-button" onClick={doImport}>うわがきして よみこむ</button>
                <button className="sub-button" onClick={() => { sfx.uiTap(); setPendingImport(null); setParentStep('menu') }}>
                  やめる
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
