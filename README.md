# もじレンジャー ビームアカデミー

音声で言われた文字を、夜空を漂うシャボン玉の中から狙って撃ち抜く、4〜6歳向けのひらがな学習シューティングゲーム。
完全クライアントサイド（GitHub Pages のみで動作、サーバー・API キー不要）。

- **技術構成**: React + TypeScript + Vite（シェル）＋ Phaser 3（ゲーム本体）
- **進捗保存**: localStorage のみ（スキーマ version 付き）
- **音声**: Web Speech API（ja-JP）＋ 効果音は WebAudio 合成。TTS が使えない端末でも視覚提示で遊べる

## ローカル起動

```bash
npm install
npm run dev
# → http://localhost:5173/moji-ranger/ を開く
```

## GitHub Pages への公開手順

1. `vite.config.ts` の `base` がリポジトリ名と一致していることを確認する（現在 `/moji-ranger/`）。
   リポジトリ名を変えた場合はここも変更する。
2. GitHub リポジトリの **Settings → Pages → Source** を **GitHub Actions** にする。
3. `main` ブランチに push すると `.github/workflows/deploy.yml` が自動でビルド＆デプロイする。
4. 公開 URL: `https://<ユーザー名>.github.io/moji-ranger/`

## ステージの追加方法

`src/data/stages.ts` の `STAGES` 配列にオブジェクトを1件追加するだけ。

```ts
{
  id: 'hiragana-ne',
  title: '「ね」をさがせ！',
  type: 'hiragana',
  correctAnswer: 'ね',
  correctKind: 'hiragana',
  distractors: [{ label: 'れ', kind: 'hiragana' }, { label: 'わ', kind: 'hiragana' }],
  voicePrompts: ['ね を さがして、ビーム！'],
  rounds: 8,
  targetsPerRound: 5,
  // ...
}
```

順序撃ち（`correctSequence`）・算数ゲート（`gates`）用のフィールドは型定義済み（実装はフェーズ2）。

## 素材の差し替え方法

原画を `../画像/` に置き、前処理スクリプトを実行すると
縮小・背景透過・圧縮された画像が `src/assets/` に生成される。

```bash
node scripts/prepare-assets.mjs
```

- `ヒーロー.png` … 横5体並びのスプライトシート（1体 220×825 で読み込み）
- `敵.png` … 左:くらやみモンスター / 右:浄化後 の2フレーム（350×525）
- `背景.png` … 背景（JPEG 化される）

効果音は `src/audio/sfx.ts`、読み上げは `src/audio/voice.ts` に分離してあり、
録音済み音声ファイルへの差し替えはこの2ファイルの置き換えだけで済む。

## 開発用スクリプト

- `scripts/shot.mjs` … タイトル〜ゲーム画面のスクリーンショットを撮る（要 Edge）
- `scripts/play-through.mjs` … 8ラウンド自動プレイして正解演出・リザルト・localStorage 記録を検証する

## 構成

```
src/
  data/stages.ts     ステージデータ（ここに足すだけで増える）
  store/progress.ts  進捗保存（localStorage・schemaVersion 付き）
  audio/sfx.ts       効果音（WebAudio 合成）
  audio/voice.ts     読み上げ（Web Speech API＋フォールバック）
  game/GameScene.ts  ゲーム本体（Phaser シーン）
  game/PhaserGame.tsx React ↔ Phaser ラッパー
  EventBus.ts        React ↔ Phaser のイベント連絡
  App.tsx            タイトル・リザルト等のシェル
  types.ts           型定義
```
