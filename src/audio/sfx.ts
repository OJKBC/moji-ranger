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
  enabled = true

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
  }

  private tone(
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    duration: number,
    volume: number,
    delay = 0,
  ): void {
    if (!this.enabled || !this.ctx || !this.master) return
    const t0 = this.ctx.currentTime + delay
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(startFreq, t0)
    if (endFreq !== startFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + duration)
    gain.gain.setValueAtTime(volume, t0)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
    osc.connect(gain)
    gain.connect(this.master)
    osc.start(t0)
    osc.stop(t0 + duration + 0.02)
  }

  private noise(duration: number, volume: number, filterFreq: number, delay = 0): void {
    if (!this.enabled || !this.ctx || !this.master || !this.noiseBuffer) return
    const t0 = this.ctx.currentTime + delay
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = filterFreq
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(volume, t0)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    src.start(t0)
    src.stop(t0 + duration)
  }

  /** ビーム発射（押した瞬間） */
  shoot(): void {
    this.tone('square', 750, 190, 0.09, 0.12)
  }

  /** 着弾・シャボン玉が弾ける（正解ヒットの主役音） */
  pop(): void {
    this.noise(0.09, 0.5, 1800)
    this.tone('triangle', 520, 90, 0.13, 0.4)
    this.tone('sine', 1300, 1900, 0.07, 0.18, 0.01)
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
    this.tone('sine', 330, 262, 0.22, 0.1)
  }

  /** 空撃ち（かすかなキラ） */
  fizzle(): void {
    this.tone('sine', 1100, 1500, 0.06, 0.05)
  }

  /** モンスター浄化（ふわっと上がる） */
  purify(): void {
    const notes = [523, 659, 784, 1046]
    notes.forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.1, i * 0.07))
  }

  /** ステージクリアのファンファーレ */
  fanfare(): void {
    const seq: Array<[number, number]> = [[523, 0], [659, 0.12], [784, 0.24], [1046, 0.38]]
    seq.forEach(([f, d]) => this.tone('triangle', f, f, 0.3, 0.18, d))
    this.tone('triangle', 1318, 1318, 0.5, 0.14, 0.55)
  }

  /** UI ボタン */
  uiTap(): void {
    this.tone('sine', 700, 900, 0.07, 0.1)
  }

  /** ボス出現の予兆（低くやわらかい気配。怖がらせない） */
  omen(): void {
    this.tone('triangle', 130, 95, 0.5, 0.12)
    this.tone('triangle', 110, 85, 0.6, 0.1, 0.45)
  }
}

export const sfx = new SfxPlayer()
