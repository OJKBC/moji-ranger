import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initPersistence } from './store/progress'

// 起動時にセーブの復旧（localStorage が消えていたら IndexedDB から復活）を済ませてから描画する。
// 失敗しても必ずゲームは起動する（エラー画面は出さない）
initPersistence()
  .catch(() => undefined)
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
