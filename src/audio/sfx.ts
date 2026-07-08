/**
 * 効果音モジュール。外部音声ファイルに依存せず WebAudio で合成する。
 * 将来、録音済み音声ファイルへ差し替える場合はこのファイルだけを書き換えればよい。
 *
 * iOS/Android はユーザー操作まで AudioContext が動かないため、
 * 最初のタップ（タイトル画面のスタート）で unlock() を必ず呼ぶこと。
 */

class SfxPlayer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  /** 同種音の直近再生時刻（連打でうるさくならないよう間引く） */
  private lastPlayAt: Record<string, number> = {}
  enabled = true

  /**
   * 読み上げクリップ（voice.ts）と共有するオーディオグラフ。
   * 声と効果音を1つの AudioContext に統一し、iOS での競合を根本的に避ける。
   */
  getGraph(): { ctx: AudioContext; out: AudioNode } | null {
    return this.ctx && this.master ? { ctx: this.ctx, out: this.master } : null
  }

  /** 同じ種類の音が minGapMs 以内に鳴っていたら true（=スキップする） */
  private throttled(key: string, minGapMs: number): boolean {
    const now = performance.now()
    if (now - (this.lastPlayAt[key] ?? -Infinity) < minGapMs) return true
    this.lastPlayAt[key] = now
    return false
  }

  /** 初回ユーザー操作の中で呼ぶ */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.5
      this.master.connect(this.ctx.destination)
      const len = Math.floor(this.ctx.sampleRate * 0.15)
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const data = this.noiseBuffer.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    // 注意: 以前ここにあった「無音 <audio> 再生でサイレントスイッチを回避する」ハックは、
    // オーディオセッションを切り替えて TTS（出題の声）を消してしまう副作用があったため撤去した。
  }

  /**
   * 再生直前の保険。モバイルはタブ切替や画面ロックで AudioContext が
   * suspended に戻ることがあるため、毎回状態を確認して復帰させる。
   */
  private ready(): boolean {
    if (!this.enabled || !this.ctx || !this.master) return false
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return true
  }

  private tone(
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    duration: number,
    volume: number,
    delay = 0,
  ): void {
    if (!this.ready()) return
    const ctx = this.ctx!
    const t0 = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(startFreq, t0)
    if (endFreq !== startFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + duration)
    gain.gain.setValueAtTime(volume, t0)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
    osc.connect(gain)
    gain.connect(this.master!)
    osc.start(t0)
    osc.stop(t0 + duration + 0.02)
  }

  private noise(duration: number, volume: number, filterFreq: number, delay = 0): void {
    if (!this.ready() || !this.noiseBuffer) return
    const ctx = this.ctx!
    const t0 = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = filterFreq
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, t0)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.master!)
    src.start(t0)
    src.stop(t0 + duration)
  }

  /** ビーム発射（「ドンッ」と強く・連射しても耳障りにならない短さ） */
  shoot(): void {
    if (this.throttled('shoot', 70)) return
    this.tone('sine', 160, 50, 0.2, 0.55) // 低音の芯（ドンッの胴体）
    this.tone('square', 240, 80, 0.09, 0.2) // アタック
    this.noise(0.12, 0.4, 800) // 空気の衝撃
    this.noise(0.05, 0.15, 3000, 0.02) // 発射後のシュッ
  }

  /** 着弾・シャボン玉が弾ける（正解ヒットの主役音。着弾の瞬間に鳴らす） */
  pop(): void {
    if (this.throttled('pop', 60)) return
    this.noise(0.09, 0.5, 1800)
    this.tone('triangle', 520, 90, 0.13, 0.4)
    this.tone('sine', 1300, 1900, 0.07, 0.18, 0.01)
    this.tone('sine', 2200, 3000, 0.06, 0.1, 0.02) // キラッ
  }

  /** キラキラ（正解の大文字表示に合わせて） */
  sparkle(): void {
    const notes = [880, 1174.7, 1568]
    notes.forEach((f, i) => this.tone('sine', f, f, 0.14, 0.14, i * 0.055))
  }

  /** コンボが伸びるたび、少しずつ音程が上がる */
  comboUp(combo: number): void {
    const base = 620 * (1 + Math.min(combo, 10) * 0.07)
    this.tone('sine', base, base, 0.08, 0.14)
    this.tone('sine', base * 1.5, base * 1.5, 0.1, 0.12, 0.06)
  }

  /** 誤答（責めない、ごく柔らかい音） */
  wrong(): void {
    if (this.throttled('wrong', 150)) return
    this.tone('sine', 330, 262, 0.22, 0.1)
  }

  /** ライフ減少（やさしいポン音。ショックを与えない） */
  lifeLose(): void {
    if (this.throttled('lifeLose', 150)) return
    this.tone('sine', 420, 300, 0.16, 0.12)
    this.noise(0.05, 0.12, 900, 0.02)
  }

  /** 空撃ち（かすかなキラ） */
  fizzle(): void {
    this.tone('sine', 1100, 1500, 0.06, 0.05)
  }

  /** モンスター浄化（明るいキラキラ＋ポップな解放音） */
  purify(): void {
    const notes = [523, 659, 784, 1046]
    notes.forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.1, i * 0.07))
    this.noise(0.12, 0.18, 3200, 0.05) // シャラッと晴れる
    this.tone('sine', 1568, 2093, 0.22, 0.1, 0.28) // 最後のキラッ
  }

  /** ステージクリアのファンファーレ */
  fanfare(): void {
    const seq: Array<[number, number]> = [[523, 0], [659, 0.12], [784, 0.24], [1046, 0.38]]
    seq.forEach(([f, d]) => this.tone('triangle', f, f, 0.3, 0.18, d))
    this.tone('triangle', 1318, 1318, 0.5, 0.14, 0.55)
  }

  /** UI ボタン（軽いポップ音） */
  uiTap(): void {
    if (this.throttled('uiTap', 80)) return
    this.tone('sine', 700, 900, 0.07, 0.1)
  }

  // ---- なかまボール（捕獲演出）用 ----

  /** ルーレットの切替カチッ音（step が進むほど音程が上がる） */
  rouletteTick(step: number): void {
    const f = 900 + (step % 8) * 60
    this.tone('square', f, f, 0.04, 0.08)
    this.noise(0.02, 0.1, 3200)
  }

  /** ルーレットが止まった瞬間のジャーン */
  rouletteStop(): void {
    this.tone('triangle', 523, 523, 0.3, 0.16)
    this.tone('triangle', 659, 659, 0.35, 0.14, 0.04)
    this.tone('triangle', 784, 784, 0.45, 0.14, 0.08)
    this.noise(0.2, 0.2, 2200)
  }

  /** 紫ボール登場の特別ファンファーレ（虹エフェクトと同期） */
  specialFanfare(): void {
    const seq: Array<[number, number]> = [[523, 0], [659, 0.1], [784, 0.2], [1046, 0.3], [1318, 0.42], [1568, 0.56]]
    seq.forEach(([f, d]) => this.tone('triangle', f, f, 0.32, 0.16, d))
    this.noise(0.5, 0.14, 3000, 0.2)
    this.tone('sine', 2093, 2637, 0.4, 0.1, 0.7)
  }

  /** ボールを投げるヒュッ */
  throwBall(): void {
    this.noise(0.16, 0.3, 1600)
    this.tone('sine', 700, 1300, 0.16, 0.12)
  }

  /** モンスターが光になって吸い込まれるキュイーン */
  suck(): void {
    this.tone('sine', 400, 1800, 0.4, 0.16)
    this.tone('sine', 600, 2400, 0.35, 0.1, 0.05)
    this.noise(0.3, 0.12, 2600, 0.08)
  }

  /** ボールの揺れ（i=0,1,2 と少しずつ音程が上がってドキドキ感） */
  ballShake(i: number): void {
    const f = 300 + i * 90
    this.tone('triangle', f, f * 0.85, 0.16, 0.2)
    this.noise(0.06, 0.14, 900, 0.02)
  }

  /** なかま成功のキラーン＋ロック */
  captureSuccess(): void {
    this.tone('sine', 1568, 2093, 0.18, 0.14)
    this.tone('triangle', 784, 784, 0.16, 0.14, 0.05)
    const seq: Array<[number, number]> = [[659, 0.2], [784, 0.32], [1046, 0.44], [1318, 0.6]]
    seq.forEach(([f, d]) => this.tone('triangle', f, f, 0.3, 0.16, d))
    this.noise(0.4, 0.12, 3200, 0.2)
  }

  /** 失敗（にげられた）: やさしいポン＋にこにこ帰っていく明るい音 */
  escapePop(): void {
    this.noise(0.08, 0.25, 1200)
    this.tone('sine', 500, 350, 0.18, 0.14)
    // 悲しくならない、ふわっと明るい別れの音
    this.tone('sine', 784, 1046, 0.3, 0.08, 0.3)
  }

  /**
   * ㊵ ボス登場の「ドーン！」（迫力はあるが、こわすぎない＝ワクワク方向）。
   * 深い低音の胴＋衝撃の空気で迫力を出しつつ、明るい長三和音の上昇＋キラッで前向きに締める。
   * 予兆（omen）とは別に、ボスが大きく現れる瞬間に鳴らす（カメラの見上げ演出と同期）。
   */
  bossAppear(): void {
    if (this.throttled('bossAppear', 300)) return
    this.tone('sine', 130, 46, 0.7, 0.5) // 低音の胴（ドーン）
    this.tone('triangle', 90, 40, 0.6, 0.32, 0.02) // サブの厚み
    this.noise(0.5, 0.28, 300) // 衝撃の空気
    this.noise(0.16, 0.16, 1600, 0.02) // アタックのパン
    // わくわくする明るい上昇（長三和音＝威圧的にしない）
    const rise: Array<[number, number]> = [[262, 0.14], [392, 0.26], [523, 0.38]]
    rise.forEach(([f, d]) => this.tone('triangle', f, f, 0.34, 0.16, d))
    this.tone('sine', 1046, 1046, 0.4, 0.1, 0.46) // 最後のキラッ
  }

  /** ボス出現の予兆（少しこわい緊張感。地鳴り＋不穏な半音のうねり） */
  omen(): void {
    this.tone('triangle', 90, 55, 0.8, 0.24) // 低い地鳴り
    this.tone('sawtooth', 110, 92, 0.5, 0.05, 0.05) // かすかなうなり
    this.noise(0.7, 0.1, 420, 0.15) // 風がざわつく
    this.tone('triangle', 196, 208, 0.45, 0.11, 0.55) // 半音上がる不穏な音
    this.tone('triangle', 247, 262, 0.5, 0.1, 0.95)
  }
}

export const sfx = new SfxPlayer()
