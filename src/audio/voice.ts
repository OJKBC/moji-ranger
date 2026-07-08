/**
 * 音声読み上げモジュール。Web Speech API（ja-JP）を使う。
 *
 * 重要: 日本語 TTS は端末・ブラウザで品質も有無もバラバラなので、
 * このモジュールが使えなくてもゲームが成立するよう、呼び出し側は
 * 必ず視覚提示（出題文字の常時表示・大きな正解表示）を併用すること。
 *
 * 将来、録音済み音声ファイルに差し替える場合はこのファイルだけを
 * 置き換えればよい（speak() のインターフェースを維持する）。
 */

import { sfx } from './sfx'

class VoicePlayer {
  readonly supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  private jaVoice: SpeechSynthesisVoice | null = null
  private initialized = false
  enabled = true

  /** 最初のユーザー操作の中で呼ぶ（iOS Safari の制約対策） */
  init(): void {
    if (!this.supported || this.initialized) return
    this.initialized = true
    this.pickVoice()
    // 音声リストは非同期に届くことがある
    window.speechSynthesis.addEventListener('voiceschanged', () => this.pickVoice())
    // 空の発話でエンジンを起こしておく（ユーザー操作起点が必要な環境向け）。
    // volume は 1 のままにする（iOS は最初の発話の音量設定がセッションに残ることがあり、
    // 0 にすると以後の読み上げまで無音になる報告がある。空文字なので何も聞こえない）
    const primer = new SpeechSynthesisUtterance('')
    primer.volume = 1
    window.speechSynthesis.speak(primer)
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

  /** 日本語音声が確認できているか（false でもゲームは視覚提示で続行） */
  available(): boolean {
    return this.supported && this.jaVoice !== null
  }

  /**
   * 読み上げる。直前の発話はキャンセルしてテンポを優先する。
   * @returns 発話を開始できたか
   */
  speak(text: string, opts?: { rate?: number; pitch?: number }): boolean {
    if (!this.supported || !this.enabled) return false
    try {
      // iOS/Chrome は他の音声再生やタブ切替のあと synth が paused のまま固まり、
      // speak しても無音になることがある。毎回 resume で確実に起こす
      window.speechSynthesis.resume()
      // cancel は必要なときだけ（Chrome は cancel 直後の speak を落とすことがある）
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel()
      }
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = 'ja-JP'
      if (this.jaVoice) utter.voice = this.jaVoice
      utter.rate = opts?.rate ?? 0.85
      utter.pitch = opts?.pitch ?? 1.15
      utter.volume = 1

      // iOS: AudioContext 再生中は TTS が消音されるため、読み上げの間だけ
      // 効果音側を一時停止する（終了・エラー・タイムアウトで必ず解除）
      sfx.beginSpeechDuck()
      let ducked = true
      const finish = () => {
        if (!ducked) return
        ducked = false
        sfx.endSpeechDuck()
      }
      utter.onend = finish
      utter.onerror = finish
      window.setTimeout(finish, Math.min(5000, 900 + text.length * 220))

      window.speechSynthesis.speak(utter)
      return true
    } catch {
      return false
    }
  }

  cancel(): void {
    if (this.supported) window.speechSynthesis.cancel()
  }
}

export const voice = new VoicePlayer()
