/**
 * 効果音モジュール。外部音声ファイルに依存せず WebAudio で合成する。
 * 将来、録音済み音声ファイルへ差し替える場合はこのファイルだけを書き換えればよい。
 *
 * iOS/Android はユーザー操作まで AudioContext が動かないため、
 * 最初のタップ（タイトル画面のスタート）で unlock() を必ず呼ぶこと。
 */

/** iPhone/iPad か（iPadOS はデスクトップ偽装するため maxTouchPoints でも判定） */
const IS_IOS = typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

class SfxPlayer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  /** 同種音の直近再生時刻（連打でうるさくならないよう間引く） */
  private lastPlayAt: Record<string, number> = {}
  /**
   * iOS は AudioContext が動いていると speechSynthesis（出題の声）が消音される
   * 既知の競合がある。読み上げ中は効果音側を一時停止して声を優先する（iOS のみ）。
   */
  private speechDucks = 0
  enabled = true

  /**
   * 読み上げ開始（voice.speak から呼ばれる）。
   * iOS では suspend が「完了してから」発話しないと競合が残るため Promise を返す。
   */
  beginSpeechDuck(): Promise<void> {
    if (!IS_IOS) return Promise.resolve()
    this.speechDucks++
    if (this.ctx && this.ctx.state === 'running') {
      return this.ctx.suspend().catch(() => undefined)
    }
    return Promise.resolve()
  }

  /** 読み上げ終了（onend/onerror/タイムアウトで必ず呼ばれる） */
  endSpeechDuck(): void {
    if (!IS_IOS) return
    this.speechDucks = Math.max(0, this.speechDucks - 1)
    if (this.speechDucks === 0 && this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
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
    // 読み上げ中（speech duck）は resume しない＝声を消さない
    if (this.ctx.state === 'suspended' && this.speechDucks === 0) void this.ctx.resume()
    // 注意: 以前ここにあった「無音 <audio> 再生でサイレントスイッチを回避する」ハックは、
    // オーディオセッションを切り替えて TTS（出題の声）を消してしまう副作用があったため撤去した。
  }

  /**
   * 再生直前の保険。モバイルはタブ切替や画面ロックで AudioContext が
   * suspended に戻ることがあるため、毎回状態を確認して復帰させる。
   */
  /** iOS: 効果音を鳴らしていない間はコンテキストを止めておく（TTSと競合させない） */
  private idleTimer: number | null = null

  private scheduleIdleSuspend(): void {
    if (!IS_IOS) return
    if (this.idleTimer !== null) window.clearTimeout(this.idleTimer)
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = null
      if (this.speechDucks === 0 && this.ctx && this.ctx.state === 'running') {
        void this.ctx.suspend()
      }
    }, 700)
  }

  private ready(): boolean {
    if (!this.enabled || !this.ctx || !this.master) return false
    // 読み上げ中（iOS）は効果音をスキップして声を優先する
    if (this.speechDucks > 0) return false
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    // iOS は鳴らし終わったら自動でコンテキストを止める（バースト動作）
    this.scheduleIdleSuspend()
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

  /** ボス出現の予兆（ワクワクする高揚感。怖い低音・不協和音にしない） */
  omen(): void {
    const notes = [262, 330, 392, 523] // ドミソド（明るい上昇）
    notes.forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.11, i * 0.13))
    this.noise(0.3, 0.08, 2400, 0.4) // シャラーッという期待感
    this.tone('sine', 784, 1046, 0.25, 0.09, 0.55)
  }
}

export const sfx = new SfxPlayer()
