import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages はリポジトリ名のサブパスで配信されるため base を設定する。
// リポジトリ名を変えたらここも合わせて変更すること。
// （dev サーバーも http://localhost:5173/moji-ranger/ で動く）
export default defineConfig({
  plugins: [react()],
  base: '/moji-ranger/',
})
