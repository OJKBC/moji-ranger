# もじレンジャー ビームアカデミー

カメラが夜のもじシティを前進し、「もやもやモンスター」と対峙。まわりに並んだ文字の選択肢から
正しい文字をビームで撃つと、敵のもやが晴れていく（浄化）——4〜6歳向けのひらがな学習ビームアクション。
完全クライアントサイド（GitHub Pages のみで動作、サーバー・API キー不要）。

- **技術構成**: React + TypeScript + Vite（シェル）＋ Phaser 3（ゲーム本体）
- **描画**: 2.5D（Three.js 不使用）。パララックス背景＋疑似遠近投影 `scale = f/(f+z)` のビルボードで前進を表現
- **進捗保存**: localStorage のみ（スキーマ version 付き）
- **音声**: Web Speech API（ja-JP）＋ 効果音は WebAudio 合成。TTS が使えない端末でも視覚提示で遊べる
- **ブランチ**: `main`＝2.5D 対峙版 / `legacy-2d`＝承認済み 2D 固定画面版（退避）

## 操作方法

- **タッチ**: ドラッグで照準を動かす／タップでビーム発射（タップ位置の近くのバブルに強く吸い付くオートエイム既定）
- **PC**: マウスで照準、クリックでビーム
- 学習タスクは「正確に狙う」ではなく「正しい文字を選ぶ」。撃ち逃しは記録されず、選択肢は答えるまで待つ

## ゲームの流れ（連戦 → ボス）

1. **進む**: カメラが街を自動前進。**前方から次のもやもやモンスターが近づいてくる**のが見える
   （移動中も自由にビームを撃てる・無罰）。浄化演出の途中で前進が再開し、待ち時間がない
2. **対峙**: 敵の手前でなめらかに減速し、正面から対峙（世界はゆっくり流れ続ける）。
   **狙う文字は音声だけで伝える**（画面に文字を出すと聞かなくても答えが分かってしまうため）。
   🔊ボタンでいつでも聞き直せる。TTS が使えない環境だけ文字表示にフォールバック
3. **浄化**: 敵の周りに文字バブルが並ぶ（**不透明・最前面で常にくっきり**）。正しい文字を撃つと
   もやが晴れて笑顔になり空へ帰る。ザコは正解1回・テンポ重視
4. **規定体数（データで設定）を浄化するとボス出現**: 予兆演出（ゆっくり見上げる＋低い気配音）→
   浄化メーター付きの大きい対峙戦。ボスの出題は**そのステージで練習した文字だけ**
5. ボスを浄化したらゴールへ

### 出題と難易度（正答率70〜85%帯狙い）

- 敵ごとの出題文字は `src/learning/picker.ts` が選ぶ: 誤答が多い・未見・低熟達を優先（簡易間隔反復）
- プールは `battle.letterPool`（習わせたい順）の先頭 `poolStart` 文字から始まり、
  習得（correct 2回以上）に応じて1文字ずつ開放される
- 選択肢は `src/learning/distractors.ts` が生成（ひらがなステージはひらがなで統一）。
  セッション正答率が **85%を超えると似た文字**（ぬ/め・ね/れ 等）が混ざり、**70%を下回ると選択肢が1つ減る**
- 撃ち逃し・時間切れは記録しない（時間切れ自体が無い）。誤答のみ `letterStats.wrong` に記録

### CameraRig と酔い防止

進行は `Ride25DScene` 内のリグ（progress / speed / targetSpeed）で制御。急加減速なし（イージング）、
回転なし、上下バブは±3px（対峙中はほぼ停止）、ヒット時のシェイクは微弱。
設定 UI（揺れ・自動照準・速度）はフェーズ3で追加予定（現在はやさしい既定値で固定）。

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

## ステージ・エンカウントの追加方法

`src/data/stages.ts` の `STAGES` 配列にオブジェクトを1件追加するだけ。
配列の並び順がステージマップの順序・アンロック順になる。

### 2.5D 連戦ステージ（renderer: '2.5d'）

`battle` を書くだけで連戦→ボスのルートができる。**体数・出題プール・選択肢数・ボス条件はすべてここで調整**:

```ts
battle: {
  enemyCount: 4,            // ボス出現までに浄化するザコの体数
  purifyStepsPerEnemy: 1,   // ザコ1体あたりの正解数（1推奨・2以上でメーター表示）
  bossPurifySteps: 4,       // ボスの浄化に必要な正解数
  choiceCount: 5,           // 選択肢の数（正答率で自動増減）
  rideDistance: 480,        // 敵と敵の間の前進距離
  letterPool: ['あ', 'い', 'う', 'お', 'ん', /* 習わせたい順 */],
  poolStart: 5,             // 最初に開放しておく文字数
},
```

### 2D 固定画面ステージ（renderer 省略・レガシー）

3つのゲームモードが使える:

- **find** … 正解を1つさがして撃つ（`correctAnswer` を指定）
- **sequence** … 順序どおりに撃って単語を完成（`correctSequence` / `word` / `celebration` を指定）
- **math** … 式を聞いて正解のゲートを撃つ（`problems` を指定）

```ts
{
  id: 'hiragana-ne',
  title: '「ね」をさがせ！',
  type: 'hiragana',
  mode: 'find',
  correctAnswer: 'ね',
  correctKind: 'hiragana',
  distractors: [{ label: 'れ', kind: 'hiragana' }, { label: 'わ', kind: 'hiragana' }],
  voicePrompts: ['ね を さがして、ビーム！'],
  rounds: 8,
  targetsPerRound: 5,
  // ...
}
```

マップカードの絵文字は `src/StageMap.tsx` の `STAGE_ICONS` に追加する（未定義なら ⭐ になる）。

## 素材の差し替え方法

ゲームが実際に読むのは `src/assets/` 内の処理済み画像（bg.jpg / enemies.png / heroes.png）。
原画（`ヒーロー.png` / `敵.png` / `背景.png`）を `../画像/` に置いて前処理スクリプトを実行すると再生成される
（現在の `../画像/` フォルダには 2.5D 版の**構図参考画像**が入っており、原画は差し替え済みのため
`src/assets/` が正となる）。

```bash
node scripts/prepare-assets.mjs
```

- `ヒーロー.png` … 横5体並びのスプライトシート（1体 220×825 で読み込み）
- `敵.png` … 左:くらやみモンスター / 右:浄化後 の2フレーム（350×525）
- `背景.png` … 背景（JPEG 化される）

2.5D の街の置き物（ビル・木・街灯）・一人称の手・バブルは Canvas で手続き描画しており、
`Ride25DScene.makeTextures()` にまとまっている。効果音は `src/audio/sfx.ts`、読み上げは
`src/audio/voice.ts` に分離してあり、録音済み音声ファイルへの差し替えはこの2ファイルの置き換えだけで済む。

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
