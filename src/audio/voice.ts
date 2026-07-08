/**
 * 音声読み上げモジュール。
 *
 * 方式: 事前生成した音声クリップ（public/assets/voice/・ja-JP ニューラルTTSで生成）を
 * 効果音と同じ AudioContext で再生する。テキストを 、。！？とスペースで区切り、
 * トークンごとのクリップをつないで発話する（例: 「これは、シ、だよ」→ これは+シ+だよ）。
 *
 * 背景: iPhone の speechSynthesis は WebAudio と競合して消音される・状態が固まる等
 * 不安定だったため、ファイル再生方式に切り替えた（サイレントスイッチや競合の影響が
 * 効果音と同じ挙動に揃う）。クリップに無いテキストは speechSynthesis にフォールバック。
 *
 * クリップを増やすときは scripts/generate-voice.mjs のトークン表に追加して再実行する。
 */
import { sfx } from './sfx'
import { VOICE_CLIPS } from './voiceManifest'

class VoicePlayer {
  readonly supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  private jaVoice: SpeechSynthesisVoice | null = null
  private initialized = false
  private warmed = false
  private buffers = new Map<string, AudioBuffer>()
  private playing: AudioBufferSourceNode[] = []
  /** 発話セッション番号。新しい発話やキャンセルで進み、古い非同期再生を無効化する */
  private playSession = 0
  enabled = true

  /** 最初のユーザー操作の中で呼ぶ（クリップの先読み＋TTSフォールバックの起床） */
  init(): void {
    if (this.initialized) return
    this.initialized = true
    this.warm()
    if (!this.supported) return
    this.pickVoice()
    window.speechSynthesis.addEventListener('voiceschanged', () => this.pickVoice())
    // 空の発話でエンジンを起こしておく（フォールバック用。何も聞こえない）
    const primer = new SpeechSynthesisUtterance('')
    primer.volume = 1
    window.speechSynthesis.speak(primer)
  }

  /** クリップを HTTP キャッシュへ先読みしておく（初回発話の遅れ防止） */
  private warm(): void {
    if (this.warmed) return
    this.warmed = true
    for (const file of Object.values(VOICE_CLIPS)) {
      void fetch(`${import.meta.env.BASE_URL}assets/voice/${file}`).catch(() => undefined)
    }
  }

  private pickVoice(): void {
    if (!this.supported) return
    const voices = window.speechSynthesis.getVoices()
    this.jaVoice =
      voices.find(v => v.lang === 'ja-JP' && v.localService) ??
      voices.find(v => v.lang === 'ja-JP') ??
      voices.find(v => v.lang.startsWith('ja')) ??
      null
  }

  /** 読み上げ手段があるか（クリップがあれば常に true） */
  available(): boolean {
    return Object.keys(VOICE_CLIPS).length > 0 || (this.supported && this.jaVoice !== null)
  }

  private tokenize(text: string): string[] {
    return text.split(/[、。！？!?\s]+/).filter(Boolean)
  }

  private async loadBuffer(ctx: AudioContext, file: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(file)
    if (cached) return cached
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}assets/voice/${file}`)
      const arr = await res.arrayBuffer()
      const buf = await ctx.decodeAudioData(arr)
      this.buffers.set(file, buf)
      return buf
    } catch {
      return null
    }
  }

  /**
   * 読み上げる。直前の発話は止めてテンポを優先する。
   * @returns 発話を開始できたか
   */
  speak(text: string, opts?: { rate?: number; pitch?: number }): boolean {
    if (!this.enabled) return false
    const tokens = this.tokenize(text)
    const files = tokens.map(t => VOICE_CLIPS[t])
    const graph = sfx.getGraph()
    if (graph && files.length > 0 && files.every(Boolean)) {
      void this.playClips(graph.ctx, graph.out, files)
      return true
    }
    // クリップに無いテキストは speechSynthesis へフォールバック
    return this.speakTts(text, opts)
  }

  private async playClips(ctx: AudioContext, out: AudioNode, files: string[]): Promise<void> {
    const session = ++this.playSession
    this.stopClips()
    const buffers = await Promise.all(files.map(f => this.loadBuffer(ctx, f)))
    if (session !== this.playSession) return // 新しい発話・キャンセルで置き換えられた
    if (buffers.some(b => b === null)) return
    if (ctx.state === 'suspended') void ctx.resume()
    // 声は効果音より前に出す（master 0.5 × 1.6 = 実効 0.8）
    const gain = ctx.createGain()
    gain.gain.value = 1.6
    gain.connect(out)
    let t = ctx.currentTime + 0.03
    for (const buf of buffers as AudioBuffer[]) {
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(gain)
      src.start(t)
      t += buf.duration + 0.05
      this.playing.push(src)
    }
  }

  private stopClips(): void {
    for (const src of this.playing) {
      try { src.stop() } catch { /* 既に停止済み */ }
    }
    this.playing = []
  }

  /** フォールバック: Web Speech API（クリップに無い文章用） */
  private speakTts(text: string, opts?: { rate?: number; pitch?: number }): boolean {
    if (!this.supported) return false
    try {
      // タブ切替等で synth が paused のまま固まることがあるため毎回起こす
      window.speechSynthesis.resume()
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel()
      }
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = 'ja-JP'
      if (this.jaVoice) utter.voice = this.jaVoice
      utter.rate = opts?.rate ?? 0.85
      utter.pitch = opts?.pitch ?? 1.15
      utter.volume = 1
      window.speechSynthesis.speak(utter)
      return true
    } catch {
      return false
    }
  }

  cancel(): void {
    this.playSession++
    this.stopClips()
    if (this.supported) window.speechSynthesis.cancel()
  }
}

export const voice = new VoicePlayer()
