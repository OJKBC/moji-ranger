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
import { EN_VOICE_CLIPS } from './voiceManifestEn'
import { EN_ABC_CLIPS } from './voiceManifestAbc'
import { COUNTRY_VOICE_CLIPS } from './voiceManifestCountry'
import { readingFor } from '../data/reading'

class VoicePlayer {
  readonly supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  private jaVoice: SpeechSynthesisVoice | null = null
  private enVoice: SpeechSynthesisVoice | null = null
  private initialized = false
  private warmed = false
  /** デコード済みクリップ（前後の無音をトリムした再生区間つき） */
  private clips = new Map<string, { buf: AudioBuffer; offset: number; duration: number }>()
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
    const all = [...Object.values(VOICE_CLIPS), ...Object.values(EN_VOICE_CLIPS), ...Object.values(EN_ABC_CLIPS), ...Object.values(COUNTRY_VOICE_CLIPS)]
    for (const file of all) {
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
    this.enVoice =
      voices.find(v => v.lang === 'en-US' && v.localService) ??
      voices.find(v => v.lang === 'en-US') ??
      voices.find(v => v.lang.startsWith('en')) ??
      null
  }

  /** 読み上げ手段があるか（クリップがあれば常に true） */
  available(): boolean {
    return Object.keys(VOICE_CLIPS).length > 0 || (this.supported && this.jaVoice !== null)
  }

  private tokenize(text: string): string[] {
    return text.split(/[、。！？!?\s]+/).filter(Boolean)
  }

  /** クリップ前後の無音を検出して再生区間を詰める（連結時の「し・・か・・」間延び防止） */
  private trimBounds(buf: AudioBuffer): { offset: number; duration: number } {
    const data = buf.getChannelData(0)
    const threshold = 0.012
    let start = 0
    while (start < data.length && Math.abs(data[start]) < threshold) start++
    let end = data.length - 1
    while (end > start && Math.abs(data[end]) < threshold) end--
    const offset = Math.max(0, start / buf.sampleRate - 0.012)
    const duration = Math.max(0.05, Math.min(buf.duration - offset, end / buf.sampleRate - offset + 0.05))
    return { offset, duration }
  }

  private async loadClip(
    ctx: AudioContext, file: string,
  ): Promise<{ buf: AudioBuffer; offset: number; duration: number } | null> {
    const cached = this.clips.get(file)
    if (cached) return cached
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}assets/voice/${file}`)
      const arr = await res.arrayBuffer()
      const buf = await ctx.decodeAudioData(arr)
      const clip = { buf, ...this.trimBounds(buf) }
      this.clips.set(file, clip)
      return clip
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
    // クリップに無いテキストは speechSynthesis へフォールバック。
    // ㊻ 単独文字は読みマップで誤読（助詞化・ローマ字読み等）を防ぎ、言語も切り替える。
    if (tokens.length === 1) {
      const r = readingFor(tokens[0])
      if (r) return this.speakTts(r.text, { ...opts, lang: r.lang === 'en' ? 'en-US' : 'ja-JP' })
    }
    return this.speakTts(text, opts)
  }

  /**
   * 英語（en-US）を読み上げる。単一トークン（アルファベット1文字 or 単語）想定。
   * 事前生成した英語クリップがあればそれを再生し、無ければ Web Speech(en-US) に
   * フォールバックする。どちらも使えなければ false を返す（呼び出し側で大きな表示に切り替える）。
   * TODO: 将来 録音した英語音声を EN_VOICE_CLIPS に差し替えれば、このまま反映される。
   * @returns 音が出せるか（false のときは視覚フォールバックを出す）
   */
  speakEn(text: string): boolean {
    if (!this.enabled) return false
    const key = text.trim().toLowerCase()
    const graph = sfx.getGraph()
    const file = EN_VOICE_CLIPS[key]
    if (graph && file) {
      void this.playClips(graph.ctx, graph.out, [file])
      return true
    }
    // フォールバック: en-US の音声合成（端末に英語音声があるとき）
    if (this.supported && this.enVoice) {
      return this.speakTts(text, { lang: 'en-US', rate: 0.8, pitch: 1.1 })
    }
    return false
  }

  /**
   * ㉚「A for Apple」方式でアルファベットを読み上げる。
   * 事前生成した「letter for example」クリップ（ゆっくり・はっきり）を再生し、
   * 無ければ en-US 音声合成で `${letter} for ${example}` を読む（rate 低め）。
   * N/M・B/D・F/S のような近い音でも、例単語で必ず区別できる。
   * TODO: 将来 録音音声を EN_ABC_CLIPS に差し替えれば、このまま反映される。
   * @returns 音が出せるか（false のときは視覚フォールバック＝例単語カードに任せる）
   */
  speakAbc(letter: string, example: string): boolean {
    if (!this.enabled) return false
    const key = letter.trim().toLowerCase()
    const graph = sfx.getGraph()
    const file = EN_ABC_CLIPS[key]
    if (graph && file) {
      void this.playClips(graph.ctx, graph.out, [file])
      return true
    }
    if (this.supported && this.enVoice) {
      return this.speakTts(`${letter} for ${example}`, { lang: 'en-US', rate: 0.6, pitch: 1.05 })
    }
    return false
  }

  /**
   * くに（国旗クイズ）用の読み上げ。国名・特徴・出題文は文全体で1クリップを事前生成しているので、
   * テキスト全体をキーにそのクリップを再生する（自然な ja-JP-Nanami の声）。
   * クリップが無ければ voice.speak（トークン分割→クリップ/TTS）にフォールバックする。
   * @returns 音を出せたか
   */
  speakCountry(text: string): boolean {
    if (!this.enabled) return false
    const key = text.trim()
    const graph = sfx.getGraph()
    const file = COUNTRY_VOICE_CLIPS[key]
    if (graph && file) {
      void this.playClips(graph.ctx, graph.out, [file])
      return true
    }
    return this.speak(text)
  }

  private async playClips(ctx: AudioContext, out: AudioNode, files: string[]): Promise<void> {
    const session = ++this.playSession
    this.stopClips()
    const clips = await Promise.all(files.map(f => this.loadClip(ctx, f)))
    if (session !== this.playSession) return // 新しい発話・キャンセルで置き換えられた
    if (clips.some(c => c === null)) return
    if (ctx.state === 'suspended') void ctx.resume()
    // 声は効果音より前に出す（master 0.5 × 1.6 = 実効 0.8）
    const gain = ctx.createGain()
    gain.gain.value = 1.6
    gain.connect(out)
    let t = ctx.currentTime + 0.02
    for (const clip of clips as Array<{ buf: AudioBuffer; offset: number; duration: number }>) {
      const src = ctx.createBufferSource()
      src.buffer = clip.buf
      src.connect(gain)
      src.start(t, clip.offset, clip.duration)
      t += clip.duration + 0.02
      this.playing.push(src)
    }
  }

  private stopClips(): void {
    for (const src of this.playing) {
      try { src.stop() } catch { /* 既に停止済み */ }
    }
    this.playing = []
  }

  /** フォールバック: Web Speech API（クリップに無い文章用。lang で日本語/英語を切替） */
  private speakTts(text: string, opts?: { rate?: number; pitch?: number; lang?: string }): boolean {
    if (!this.supported) return false
    const isEn = opts?.lang?.startsWith('en') ?? false
    const preferred = isEn ? this.enVoice : this.jaVoice
    if (isEn && !preferred) return false // 英語音声が無ければ鳴らさない（視覚フォールバックに任せる）
    try {
      // タブ切替等で synth が paused のまま固まることがあるため毎回起こす
      window.speechSynthesis.resume()
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel()
      }
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = opts?.lang ?? 'ja-JP'
      if (preferred) utter.voice = preferred
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
