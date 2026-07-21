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

### ㊿「よむ」ステージ（音声入力）とプライバシー

- ひらがな（難易度が上がると単語）を **声に出して読む** ステージ。**画面・進行・演出は他ステージと同じ
  共通エンジン**（`Ride25DScene`）＝一人称の両手・夜のもじシティ・対峙・浄化メーター・ライフ・あいぼう・
  リザルト。差分は「入力が声であること」だけ。読む対象は他ステージと同じ大きなバブルに1つ表示し、
  正しく読めたら **こえビーム（声に反応して両手からビーム）** でバブルを撃ち抜き浄化が進む。
- 判定はブラウザ標準の Web Speech API（`SpeechRecognition`, `ja-JP`）。ユーティリティは `src/speech.ts`、
  エンジン統合は `Ride25DScene`（`mode: 'read'`）。マイクHUD（光る＋波形バー）で「聞いている」ことを表示。
- **入力方式＝「はなす」ボタン（tap one-shot）**: 下部中央の「はなす」ボタンを押すと認識開始。押している間だけ
  聞くのではなく、押したら1回ぶん聞いて話し終わりで自動終了（`continuous=false`）。**常時聞きっぱなしにしない**
  ことで、周囲の雑音を誤認識して勝手に減点する事故を防ぐ。押すたびに前セッションを `abort` してから `start`。
  聞いている間は上部の「きいてるよ」HUD（光る＋波形）で明示。
- **反応速度**: `interimResults=true` で、**途中経過(interim)で一致した時点で final を待たず即・正解**
  （こえビーム自動発射・発話→演出まで体感1秒以内）。**不正解の確定は final のみ**（interim の誤認識では減点しない）。
- **タップでは判定しない**: 「よむ」では文字バブルをタップしても割れず正解にならない（軽く揺れるだけ）。
  正解の唯一の入力は声。正しく読めたら**ごほうびとして両手からビームが自動発射**される。
- **出題時に答えを言わない**: 出題の声かけは「よんでみよう！」のみ。誤答フィードバックも答えの読みを言わず
  「もういちど よんでみよう」と促すだけ（読むのは子どもの役目）。正解後は文字を大きく見せて読み上げてよい。
- **プライバシー**: マイク音声の判定はすべて **端末内（ブラウザの音声認識）** で行い、
  **録音の保存・サーバー送信は一切しない**。マイクは認識中だけ使う。初回に保護者向けの
  マイク利用同意画面を表示（同意は `localStorage` に記録し次回以降は省略）。
- **対応端末**: `SpeechRecognition` がある Chrome / Edge / Android のみ。iOS Safari は非対応のため、
  `isSpeechSupported()` の機能検出で **非対応端末には「よむ」ステージを地図に出さない**（進捗データは温存）。
- **幼児向けの寛容判定**（`judgeReading`）: 一致・一部一致・1文字違いは正解。**認識できなかったときは
  誤答にせず**そのままやり直し（ライフは減らない）。明確な違い（final確定）のみ誤答＝ライフ-1。
- 検証は `scripts/play-read.mjs`（疑似 `SpeechRecognition` を注入し、非対応非表示／interim即正解／
  interim誤答は無視・final誤答のみ減点／認識失敗は無罰／共通エンジン起動 を自動確認）。

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

### くに（国旗クイズ）ステージ

「〇〇の はたは どれ？」と音声で伝え、正しい**国旗の画像バブル**を撃つ 2.5D の find ステージ。
正解すると **世界地図で「日本」と「出題国」をハイライト**し、その国の**特徴を2〜3個やさしい音声**で
読み上げる（`src/CountryIntro.tsx`）。正解した国は **せかいずかん**（`src/WorldZukan.tsx`）に貯まる。

**国の追加・特徴の修正は `src/data/countries.ts` の編集だけ**でできる（`code` は ISO 3166-1 alpha-2 小文字）:

```ts
{ code: 'fr', name: 'フランス', characteristics: [
  'ヨーロッパに ある くにだよ',   // 1個目は「場所」を入れると分かりやすい
  'パンや ケーキが とても おいしい',
  'サッカーが つよいよ',
] },
```

編集したら次の2つを再実行する（どちらもネット上の画像を拾わず、同梱パッケージ／TTSから作る）:

```bash
node scripts/prepare-flags.mjs    # 新しい国の国旗PNGを public/assets/flags/ に用意（flag-icons から）
node scripts/generate-voice.mjs   # 新しい国名・特徴・出題文の読み上げクリップを生成
```

難易度は共通ルール（`src/data/difficulty.ts`）。上の難易度ほど**出題国が増え**（poolStart＋poolBonus）、
**似た国旗**（`SIMILAR_FLAG_GROUPS`＝仏/伊・蘭/露 など）がダミーに混ざる。カテゴリ「くに」は
`stages.ts` の `CATEGORY_ORDER / CATEGORY_META` に登録済み（カテゴリ選択に自動で並ぶ）。

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

### モンスターの追加

1. 原画を `../画像/モンスター/よわい/` または `../画像/モンスター/つよい/` に置く。
   **ファイル名をひらがなにしておくと（例 `どらごんきんぐ.png`）、その名前がそのまま「なまえ」として登録される**。
2. `node scripts/prepare-monsters.mjs` を実行（`--sheet` を付けると番号付き一覧シートも出力）。
   - 前回から**増えた画像だけ**を `public/assets/monsters/` に `monster-weak-N.png` / `monster-strong-N.png` の
     続き番号で取り込む（**既存の番号・なかま記録は変わらない**＝`scripts/monster-map.json` で永続管理）。
   - ひらがな名の画像は `src/data/monster-names.json` に名前を自動登録する（**既存の名前は上書きしない**）。
   - `scratchpad/monster-roster.txt` に「ID・ファイル名・元名・なまえ」の一覧が出る（編集の手がかり）。
3. `node scripts/generate-voice.mjs` を実行（新しい名前の読み上げ音声だけ追加生成される）。

### モンスターの「なまえ」を直す（★ここだけ編集すれば全部に反映）

- 名前の**唯一の元データは `src/data/monster-names.json`**（`"ID": "なまえ"` の一覧）。
  ここの名前を書き換えるだけで、**ずかん・なかま演出・読み上げ・あいぼう表示のすべてに反映**される。
  ```json
  {
    "monster-strong-1": "えんまおう",
    "monster-strong-2": "あおきば",
    "monster-weak-1": "りゅうたん"
  }
  ```
- どのIDがどの画像かは、画像 `public/assets/monsters/<ID>.png` を見るか、`scratchpad/monster-roster.txt` を参照。
- 名前を直したら `node scripts/generate-voice.mjs` を再実行すると、読み上げ音声もその名前に更新される。
- **注意**: 画像の実ファイル名（＝ID）は変えないこと（Webパスと「なかま」記録が壊れるため）。名前だけを変える。
- JSON に無いIDは「もやもやNごう」の仮名が自動で付く（`monsterName()`）。仮名を直したいときは JSON に足す。

## 素材のライセンス・クレジット

外部からの画像収集（クロール）は行わず、オープンライセンスの npm パッケージ／同梱データのみ使用:

- **国旗**: [flag-icons](https://github.com/lipis/flag-icons)（**MIT License**）。ビルド時に必要な国だけ
  `sharp` で PNG 化して `public/assets/flags/` に置く（`scripts/prepare-flags.mjs`）。
- **世界地図**: [@svg-maps/world](https://github.com/VictorCazanave/svg-maps)（**CC BY 4.0**・作者 Victor Cazanave）。
  国ごとの SVG パスを `src/CountryIntro.tsx` で描画してハイライトする。
- **読み上げ**: Microsoft Edge のニューラル TTS（`ja-JP-Nanami` ほか）で事前生成した mp3（`scripts/generate-voice.mjs`）。

いずれも外部通信なしでオフライン動作する（GitHub Pages 上でも同梱アセットだけで表示）。

## 開発用スクリプト

- `scripts/shot.mjs` … タイトル〜ゲーム画面のスクリーンショットを撮る（要 Edge）
- `scripts/play-through.mjs` … 8ラウンド自動プレイして正解演出・リザルト・localStorage 記録を検証する
- `scripts/prepare-flags.mjs` … `src/data/countries.ts` の国の国旗を PNG 化（flag-icons → `public/assets/flags/`）

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
