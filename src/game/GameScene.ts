import Phaser from 'phaser'
import bgUrl from '../assets/bg.jpg'
import heroesUrl from '../assets/heroes.png'
import enemiesUrl from '../assets/enemies.png'
import { EventBus } from '../EventBus'
import { sfx } from '../audio/sfx'
import { voice } from '../audio/voice'
import { HEROES } from '../data/stages'
import { loadProgress, recordAnswer, recordSeen, recordStageClear } from '../store/progress'
import type { Stage, StageResult, TargetKind } from '../types'

export const GAME_W = 960
export const GAME_H = 640

const PLAY = { left: 85, right: GAME_W - 85, top: 185, bottom: GAME_H - 290 }
const FONT = '"Hiragino Maru Gothic ProN", "BIZ UDPGothic", "Yu Gothic UI", "Meiryo", sans-serif'
const BUBBLE_COLORS = [0xffc2d4, 0xaddcff, 0xfff2ad, 0xc9f2b8, 0xe3ccff]
const SHOT_COOLDOWN_MS = 110
const AIM_ASSIST_RADIUS = 70

interface FloatingTarget {
  container: Phaser.GameObjects.Container
  bubble: Phaser.GameObjects.Image
  letter: Phaser.GameObjects.Text
  label: string
  kind: TargetKind
  isCorrect: boolean
  vx: number
  vy: number
  baseScale: number
  radius: number
  swayPhase: number
  alive: boolean
}

/**
 * ゲーム本体シーン。1ステージ分のコアループ
 * 「音声で出題 → 漂うターゲットを撃つ → 正解の快感 / やさしい誤答対応」を担う。
 */
export class GameScene extends Phaser.Scene {
  private stageData: Stage
  private heroColor = 0xff4d4d
  private heroFrame = 0

  private hero!: Phaser.GameObjects.Image
  private palm = { x: 0, y: 0 }
  private targets: FloatingTarget[] = []
  private missionBar!: Phaser.GameObjects.Container
  private comboBadge!: Phaser.GameObjects.Container
  private comboText!: Phaser.GameObjects.Text
  private roundDots: Phaser.GameObjects.Arc[] = []

  private roundIndex = 0
  private roundStartAt = 0
  private stageStartAt = 0
  private combo = 0
  private maxCombo = 0
  private wrongTotal = 0
  private wrongThisRound = 0
  private wrongTapStreak = 0
  private struggledLastRound = false
  private hintReplayDone = false
  private hintGlowDone = false
  private freezeUntil = 0
  private lastShotAt = -9999
  private acceptInput = true
  private roundActive = false

  constructor(stage: Stage) {
    super('Game')
    this.stageData = stage
  }

  preload(): void {
    this.load.image('bg', bgUrl)
    this.load.spritesheet('heroes', heroesUrl, { frameWidth: 220, frameHeight: 825 })
    this.load.spritesheet('enemies', enemiesUrl, { frameWidth: 350, frameHeight: 525 })
  }

  create(): void {
    const progress = loadProgress()
    const hero = HEROES.find(h => h.id === progress.selectedHero) ?? HEROES[0]
    this.heroColor = hero.color
    this.heroFrame = hero.frameIndex

    this.stageStartAt = this.time.now
    this.makeTextures()
    this.buildBackground()
    this.buildHero()
    this.buildMissionBar()
    this.buildRoundDots()
    this.buildComboBadge()
    this.buildAmbientMonster()

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.shoot(p.x, p.y))
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.removeAllListeners()
      voice.cancel()
    })

    this.time.delayedCall(450, () => this.spawnRound())
  }

  // ---------------------------------------------------------------- textures

  private makeTextures(): void {
    if (!this.textures.exists('bubble')) {
      const size = 160
      const canvas = this.textures.createCanvas('bubble', size, size)
      if (canvas) {
        const ctx = canvas.getContext()
        const r = size / 2
        const grad = ctx.createRadialGradient(r - 18, r - 22, 10, r, r, r)
        grad.addColorStop(0, 'rgba(255,255,255,0.98)')
        grad.addColorStop(0.55, 'rgba(255,255,255,0.9)')
        grad.addColorStop(0.88, 'rgba(255,255,255,0.72)')
        grad.addColorStop(1, 'rgba(255,255,255,0.95)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(r, r, r - 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.arc(r, r, r - 5, 0, Math.PI * 2)
        ctx.stroke()
        // 左上のツヤ
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.beginPath()
        ctx.ellipse(r - 26, r - 34, 20, 12, -0.6, 0, Math.PI * 2)
        ctx.fill()
        canvas.refresh()
      }
    }
    if (!this.textures.exists('dot')) {
      const g = this.add.graphics()
      g.fillStyle(0xffffff, 1)
      g.fillCircle(8, 8, 8)
      g.generateTexture('dot', 16, 16)
      g.destroy()
    }
    if (!this.textures.exists('star')) {
      const g = this.add.graphics()
      const pts: Phaser.Math.Vector2[] = []
      const cx = 15, cy = 15
      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + (i * Math.PI) / 5
        const radius = i % 2 === 0 ? 14 : 6
        pts.push(new Phaser.Math.Vector2(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius))
      }
      g.fillStyle(0xffffff, 1)
      g.fillPoints(pts, true)
      g.generateTexture('star', 30, 30)
      g.destroy()
    }
    if (!this.textures.exists('ring')) {
      const g = this.add.graphics()
      g.lineStyle(6, 0xffffff, 1)
      g.strokeCircle(24, 24, 20)
      g.generateTexture('ring', 48, 48)
      g.destroy()
    }
    if (!this.textures.exists('softglow')) {
      const size = 256
      const canvas = this.textures.createCanvas('softglow', size, size)
      if (canvas) {
        const ctx = canvas.getContext()
        const grad = ctx.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size / 2)
        grad.addColorStop(0, 'rgba(255,255,255,0.9)')
        grad.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, size, size)
        canvas.refresh()
      }
    }
  }

  // ------------------------------------------------------------------ build

  private buildBackground(): void {
    const bg = this.add.image(GAME_W / 2, GAME_H / 2, 'bg').setDepth(0)
    const scale = Math.max(GAME_W / bg.width, GAME_H / bg.height)
    bg.setScale(scale)
  }

  private buildHero(): void {
    this.hero = this.add.image(GAME_W / 2, GAME_H + 10, 'heroes', this.heroFrame)
      .setOrigin(0.5, 1)
      .setDepth(5)
    const scale = 105 / 220
    this.hero.setScale(scale)
    // 掲げた手のひら（ビーム発射点）はフレーム内のおよそ (18%, 46%)
    this.palm.x = this.hero.x + (0.18 - 0.5) * this.hero.displayWidth
    this.palm.y = this.hero.y + (0.46 - 1) * this.hero.displayHeight
    // 手のひらの常時グロー
    const glow = this.add.image(this.palm.x, this.palm.y, 'softglow')
      .setDepth(6).setScale(0.28).setTint(this.heroColor).setAlpha(0.55)
    this.tweens.add({
      targets: glow, scale: 0.38, alpha: 0.75,
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
    // 登場ポップ
    this.hero.setScale(scale * 0.6).setAlpha(0)
    this.tweens.add({ targets: this.hero, scale, alpha: 1, duration: 350, ease: 'Back.easeOut' })
  }

  private buildMissionBar(): void {
    const width = 600
    const bg = this.add.graphics()
    bg.fillStyle(0xffffff, 0.94)
    bg.fillRoundedRect(-width / 2, -37, width, 74, 26)
    bg.lineStyle(4, 0xffc94d, 1)
    bg.strokeRoundedRect(-width / 2, -37, width, 74, 26)
    const label = this.add.text(-24, 0, this.stageData.missionText, {
      fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#3a3a70',
    }).setOrigin(0.5)
    const speakerBg = this.add.circle(width / 2 - 46, 0, 27, 0xffc94d)
    const speaker = this.add.text(width / 2 - 46, 1, '🔊', { fontSize: '28px' }).setOrigin(0.5)
    speakerBg.setInteractive({ useHandCursor: true })
    speakerBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation()
      sfx.uiTap()
      this.speakPrompt()
    })
    this.missionBar = this.add.container(GAME_W / 2, 52, [bg, label, speakerBg, speaker]).setDepth(90)
    this.missionBar.setScale(0)
    this.tweens.add({ targets: this.missionBar, scale: 1, duration: 320, ease: 'Back.easeOut' })
  }

  private buildRoundDots(): void {
    const total = this.stageData.rounds
    const gap = 30
    const startX = GAME_W / 2 - ((total - 1) * gap) / 2
    for (let i = 0; i < total; i++) {
      const dot = this.add.circle(startX + i * gap, 112, 8, 0xffffff, 0.35)
        .setStrokeStyle(2, 0xffffff, 0.7)
        .setDepth(90)
      this.roundDots.push(dot)
    }
  }

  private buildComboBadge(): void {
    const star = this.add.image(-30, 0, 'star').setTint(0xffd94d).setScale(1.4)
    this.comboText = this.add.text(-8, 0, '', {
      fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0, 0.5).setStroke('#b8860b', 6)
    this.comboBadge = this.add.container(GAME_W - 150, 120, [star, this.comboText])
      .setDepth(90).setAlpha(0)
  }

  private buildAmbientMonster(): void {
    // 夜空を漂う「くらやみモンスター」（雰囲気担当。撃つ対象ではない）
    const monster = this.add.image(GAME_W - 110, 200, 'enemies', 0)
      .setDepth(2).setScale(0.22).setAlpha(0.75)
    this.tweens.add({
      targets: monster, y: 230, x: GAME_W - 140,
      duration: 3200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
  }

  // ----------------------------------------------------------------- rounds

  private speakPrompt(): void {
    const prompts = this.stageData.voicePrompts
    voice.speak(prompts[this.roundIndex % prompts.length])
  }

  private spawnRound(): void {
    const stage = this.stageData
    this.roundActive = true
    this.wrongThisRound = 0
    this.hintReplayDone = false
    this.hintGlowDone = false
    this.roundStartAt = this.time.now

    const count = this.struggledLastRound ? 3 : stage.targetsPerRound
    const distractors = Phaser.Utils.Array.Shuffle([...stage.distractors]).slice(0, count - 1)
    const labels: { label: string; kind: TargetKind; isCorrect: boolean }[] = [
      { label: stage.correctAnswer, kind: stage.correctKind, isCorrect: true },
      ...distractors.map(d => ({ label: d.label, kind: d.kind, isCorrect: false })),
    ]
    Phaser.Utils.Array.Shuffle(labels)

    // 3×2 のグリッドからスロットを選び、ジッターを加えて重なりなく配置する
    const cols = [0.17, 0.5, 0.83].map(f => PLAY.left + f * (PLAY.right - PLAY.left))
    const rows = [0.22, 0.72].map(f => PLAY.top + f * (PLAY.bottom - PLAY.top))
    const slots: { x: number; y: number }[] = []
    for (const y of rows) for (const x of cols) slots.push({ x, y })
    Phaser.Utils.Array.Shuffle(slots)

    labels.forEach((spec, i) => {
      const slot = slots[i]
      const x = Phaser.Math.Clamp(slot.x + Phaser.Math.Between(-45, 45), PLAY.left, PLAY.right)
      const y = Phaser.Math.Clamp(slot.y + Phaser.Math.Between(-30, 30), PLAY.top, PLAY.bottom)
      this.createTarget(spec.label, spec.kind, spec.isCorrect, x, y, i)
    })

    recordSeen(stage.correctAnswer, stage.correctKind)
    this.speakPrompt()

    if (import.meta.env.DEV) {
      // 自動テスト用フック（本番ビルドには含まれない）
      ;(window as unknown as Record<string, unknown>).__debugTargets = this.targets.map(t => ({
        x: t.container.x, y: t.container.y, label: t.label, correct: t.isCorrect,
      }))
    }
  }

  private createTarget(label: string, kind: TargetKind, isCorrect: boolean, x: number, y: number, index: number): void {
    const colorIndex = Phaser.Math.Between(0, BUBBLE_COLORS.length - 1)
    const bubble = this.add.image(0, 0, 'bubble').setTint(BUBBLE_COLORS[colorIndex])
    const letter = this.add.text(0, 0, label, {
      fontFamily: FONT, fontSize: '64px', fontStyle: 'bold', color: '#33336b',
    }).setOrigin(0.5).setStroke('#ffffff', 8)
    const container = this.add.container(x, y, [bubble, letter]).setDepth(10)

    const baseScale = this.struggledLastRound && isCorrect ? 0.98 : 0.78
    const speedScale = this.struggledLastRound ? 0.55 : 1
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2)
    const speed = Phaser.Math.FloatBetween(22, 45) * speedScale

    const target: FloatingTarget = {
      container, bubble, letter, label, kind, isCorrect,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      baseScale,
      radius: 80 * baseScale,
      swayPhase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      alive: true,
    }
    this.targets.push(target)

    container.setScale(0)
    this.tweens.add({
      targets: container, scale: baseScale,
      duration: 300, delay: index * 55, ease: 'Back.easeOut',
    })
  }

  private clearRoundTargets(): void {
    for (const t of this.targets) {
      t.alive = false
      this.tweens.add({
        targets: t.container, scale: 0, alpha: 0, duration: 220, ease: 'Back.easeIn',
        onComplete: () => t.container.destroy(),
      })
    }
    this.targets = []
  }

  // ---------------------------------------------------------------- shooting

  private shoot(x: number, y: number): void {
    if (!this.acceptInput) return
    const now = this.time.now
    if (now - this.lastShotAt < SHOT_COOLDOWN_MS) return
    this.lastShotAt = now

    // エイムアシスト: タップ点の近くにターゲットがあれば吸い付く
    let best: FloatingTarget | null = null
    let bestDist = Infinity
    for (const t of this.targets) {
      if (!t.alive) continue
      const d = Phaser.Math.Distance.Between(x, y, t.container.x, t.container.y)
      if (d < t.radius + AIM_ASSIST_RADIUS && d < bestDist) {
        best = t
        bestDist = d
      }
    }

    const impactX = best ? best.container.x : x
    const impactY = best ? best.container.y : y
    this.drawBeam(impactX, impactY)
    sfx.shoot()

    if (!best) {
      this.fizzle(impactX, impactY)
      return
    }
    if (best.isCorrect) {
      this.resolveCorrect(best)
    } else {
      this.resolveWrong(best)
    }
  }

  private drawBeam(tx: number, ty: number): void {
    const light = Phaser.Display.Color.IntegerToColor(this.heroColor).lighten(35).color
    const g = this.add.graphics().setDepth(50)
    g.lineStyle(20, this.heroColor, 0.22)
    g.lineBetween(this.palm.x, this.palm.y, tx, ty)
    g.lineStyle(9, light, 0.65)
    g.lineBetween(this.palm.x, this.palm.y, tx, ty)
    g.lineStyle(3.5, 0xffffff, 1)
    g.lineBetween(this.palm.x, this.palm.y, tx, ty)
    g.fillStyle(0xffffff, 0.9)
    g.fillCircle(tx, ty, 14)
    g.fillStyle(light, 0.45)
    g.fillCircle(tx, ty, 26)
    this.tweens.add({ targets: g, alpha: 0, duration: 110, onComplete: () => g.destroy() })

    const muzzle = this.add.image(this.palm.x, this.palm.y, 'star')
      .setDepth(51).setTint(light).setScale(0.9)
    this.tweens.add({
      targets: muzzle, scale: 0.2, alpha: 0, angle: 90, duration: 140,
      onComplete: () => muzzle.destroy(),
    })
    // ヒーローの反動（ごく小さく）
    this.tweens.add({
      targets: this.hero, scaleX: this.hero.scaleX * 1.05, scaleY: this.hero.scaleY * 0.97,
      duration: 55, yoyo: true,
    })
  }

  private fizzle(x: number, y: number): void {
    sfx.fizzle()
    const emitter = this.add.particles(0, 0, 'dot', {
      speed: { min: 30, max: 90 }, scale: { start: 0.4, end: 0 },
      lifespan: 300, tint: 0xffffff, emitting: false,
    }).setDepth(55)
    emitter.explode(6, x, y)
    this.time.delayedCall(400, () => emitter.destroy())
  }

  // ---------------------------------------------------------------- correct

  private resolveCorrect(t: FloatingTarget): void {
    if (!this.roundActive) return
    this.roundActive = false
    const reaction = this.time.now - this.roundStartAt

    // --- juice: ヒットストップ＋シェイク＋パーティクル（すべて着弾フレームで） ---
    sfx.pop()
    this.freezeUntil = this.time.now + 60
    this.tweens.timeScale = 0.05
    this.time.delayedCall(60, () => { this.tweens.timeScale = 1 })
    this.cameras.main.shake(70, 0.0045)

    const { x, y } = t.container
    const bubbleTint = t.bubble.tintTopLeft
    const dots = this.add.particles(0, 0, 'dot', {
      speed: { min: 70, max: 280 }, scale: { start: 0.85, end: 0 },
      lifespan: 480, tint: [bubbleTint, 0xffffff, this.heroColor], emitting: false,
    }).setDepth(55)
    dots.explode(20, x, y)
    const stars = this.add.particles(0, 0, 'star', {
      speed: { min: 60, max: 200 }, scale: { start: 0.9, end: 0 },
      angle: { min: 0, max: 360 }, rotate: { min: 0, max: 360 },
      lifespan: 600, tint: 0xffe066, emitting: false,
    }).setDepth(55)
    stars.explode(7, x, y)
    this.time.delayedCall(800, () => { dots.destroy(); stars.destroy() })

    const ring = this.add.image(x, y, 'ring').setDepth(55).setTint(0xffffff).setScale(0.4)
    this.tweens.add({
      targets: ring, scale: 2.6, alpha: 0, duration: 320, ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    })

    // シャボン玉が弾け、中からニコニコモンスターが空へ帰る
    t.alive = false
    this.tweens.add({
      targets: t.container, scale: t.baseScale * 1.35, alpha: 0, duration: 90,
      onComplete: () => t.container.destroy(),
    })
    this.targets = this.targets.filter(other => other !== t)
    const monster = this.add.image(x, y + 10, 'enemies', 1).setDepth(56).setScale(0.1)
    this.tweens.add({ targets: monster, scale: 0.3, duration: 250, ease: 'Back.easeOut' })
    this.tweens.add({
      targets: monster, y: y - 170, alpha: 0, duration: 950, delay: 300, ease: 'Sine.easeIn',
      onComplete: () => monster.destroy(),
    })
    this.time.delayedCall(150, () => sfx.purify())
    this.time.delayedCall(90, () => sfx.sparkle())

    // 正解の文字を大きく見せて読み上げる（音と形の結びつけ）
    this.showBigLetter(t.label)

    // コンボ
    this.combo++
    this.maxCombo = Math.max(this.maxCombo, this.combo)
    if (this.combo >= 2) {
      sfx.comboUp(this.combo)
      this.comboText.setText(`×${this.combo}`)
      this.comboBadge.setAlpha(1).setScale(0.6)
      this.tweens.add({ targets: this.comboBadge, scale: 1, duration: 220, ease: 'Back.easeOut' })
    }
    this.wrongTapStreak = 0

    // 学習記録
    recordAnswer(t.label, t.kind, true, reaction)

    // ラウンド進行
    this.struggledLastRound = this.wrongThisRound >= 2
    const dot = this.roundDots[this.roundIndex]
    if (dot) {
      dot.setFillStyle(0xffd94d, 1)
      this.tweens.add({ targets: dot, scale: 1.6, duration: 160, yoyo: true })
    }
    this.roundIndex++

    // 残りの誤答ターゲットは静かに片付ける
    this.clearRoundTargets()

    if (this.roundIndex >= this.stageData.rounds) {
      this.time.delayedCall(1100, () => this.endStage())
    } else {
      this.time.delayedCall(900, () => this.spawnRound())
    }
  }

  private showBigLetter(label: string): void {
    const glow = this.add.image(GAME_W / 2, GAME_H / 2 - 30, 'softglow')
      .setDepth(79).setScale(2.6).setAlpha(0.85).setTint(0xfff2c0)
    const big = this.add.text(GAME_W / 2, GAME_H / 2 - 30, label, {
      fontFamily: FONT, fontSize: '200px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(80).setStroke('#ff8fb0', 14)
    big.setShadow(0, 6, 'rgba(80,40,120,0.45)', 12)
    big.setScale(0)
    voice.speak(label, { rate: 0.75 })
    this.tweens.add({ targets: big, scale: 1, duration: 260, ease: 'Back.easeOut' })
    this.tweens.add({
      targets: [big, glow], alpha: 0, y: GAME_H / 2 - 90, duration: 340, delay: 800,
      ease: 'Cubic.easeIn',
      onComplete: () => { big.destroy(); glow.destroy() },
    })
  }

  // ------------------------------------------------------------------ wrong

  private resolveWrong(t: FloatingTarget): void {
    sfx.wrong()
    this.combo = 0
    this.tweens.add({ targets: this.comboBadge, alpha: 0, duration: 250 })
    this.wrongThisRound++
    this.wrongTapStreak++
    this.wrongTotal++

    // ぷるぷる揺れるだけ。罰しない
    this.tweens.add({ targets: t.container, angle: 10, duration: 60, yoyo: true, repeat: 3 })

    // 「これは「お」だよ」のやさしい提示
    this.showGentleFeedback(t)
    voice.speak(`これは、${t.label}、だよ`)

    // 出題文字に対する誤答として記録（後の再出題の材料）
    recordAnswer(this.stageData.correctAnswer, this.stageData.correctKind, false)

    // 2回間違えたら: 正解を大きく・全体をゆっくりに（このラウンド内で助ける）
    if (this.wrongThisRound === 2) this.easeCurrentRound()
    // 3回連続で間違えたら: 一度だけ正解を光らせる
    if (this.wrongTapStreak >= 3) {
      this.wrongTapStreak = 0
      this.glowCorrectTarget()
    }
  }

  private showGentleFeedback(t: FloatingTarget): void {
    const text = `これは「${t.label}」だよ`
    const label = this.add.text(0, 0, text, {
      fontFamily: FONT, fontSize: '27px', fontStyle: 'bold', color: '#3a3a70',
    }).setOrigin(0.5)
    const pad = 18
    const bg = this.add.graphics()
    bg.fillStyle(0xffffff, 0.95)
    bg.fillRoundedRect(-label.width / 2 - pad, -26, label.width + pad * 2, 52, 20)
    const x = Phaser.Math.Clamp(t.container.x, 150, GAME_W - 150)
    const y = Phaser.Math.Clamp(t.container.y - 85, 150, GAME_H - 100)
    const feedback = this.add.container(x, y, [bg, label]).setDepth(85).setScale(0)
    this.tweens.add({ targets: feedback, scale: 1, duration: 220, ease: 'Back.easeOut' })
    this.tweens.add({
      targets: feedback, alpha: 0, duration: 300, delay: 1400,
      onComplete: () => feedback.destroy(),
    })
  }

  private easeCurrentRound(): void {
    for (const t of this.targets) {
      if (!t.alive) continue
      t.vx *= 0.45
      t.vy *= 0.45
      if (t.isCorrect) {
        t.baseScale *= 1.3
        t.radius = 80 * t.baseScale
        this.tweens.add({ targets: t.container, scale: t.baseScale, duration: 350, ease: 'Back.easeOut' })
      }
    }
  }

  private glowCorrectTarget(): void {
    const correct = this.targets.find(t => t.alive && t.isCorrect)
    if (!correct) return
    const ring = this.add.image(correct.container.x, correct.container.y, 'ring')
      .setDepth(9).setTint(0xffe066).setScale(2.2).setAlpha(0)
    let pulses = 0
    const pulse = () => {
      if (!correct.alive || pulses >= 3) { ring.destroy(); return }
      pulses++
      ring.setPosition(correct.container.x, correct.container.y).setScale(1.6).setAlpha(0.95)
      this.tweens.add({
        targets: ring, scale: 2.8, alpha: 0, duration: 500, ease: 'Cubic.easeOut',
        onComplete: pulse,
      })
    }
    pulse()
  }

  // ------------------------------------------------------------------- end

  private endStage(): void {
    this.acceptInput = false
    this.clearRoundTargets()
    sfx.fanfare()
    voice.speak('すごーい！ ぜんぶ みつけたね！')

    // 紙吹雪
    const confetti = this.add.particles(0, 0, 'dot', {
      x: { min: 0, max: GAME_W }, y: -20,
      speedY: { min: 120, max: 300 }, speedX: { min: -40, max: 40 },
      scale: { start: 0.7, end: 0.2 },
      tint: [0xff4d4d, 0x3da9ff, 0xffd94d, 0x4ccb5a, 0xff6bb5],
      lifespan: 2400, quantity: 4, frequency: 40,
    }).setDepth(95)
    this.time.delayedCall(1800, () => confetti.stop())

    const stars: 1 | 2 | 3 = this.wrongTotal <= 1 ? 3 : this.wrongTotal <= 4 ? 2 : 1
    recordStageClear(stars)
    const result: StageResult = {
      stageId: this.stageData.id,
      rounds: this.stageData.rounds,
      wrongCount: this.wrongTotal,
      maxCombo: this.maxCombo,
      stars,
      playTimeMs: Math.round(this.time.now - this.stageStartAt),
    }
    this.time.delayedCall(1600, () => EventBus.emit('stage-clear', result))
  }

  // ----------------------------------------------------------------- update

  update(time: number, delta: number): void {
    if (time < this.freezeUntil) return
    const dt = delta / 1000

    for (const t of this.targets) {
      if (!t.alive) continue
      const c = t.container
      c.x += t.vx * dt
      c.y += t.vy * dt
      if (c.x < PLAY.left) { c.x = PLAY.left; t.vx = Math.abs(t.vx) }
      if (c.x > PLAY.right) { c.x = PLAY.right; t.vx = -Math.abs(t.vx) }
      if (c.y < PLAY.top) { c.y = PLAY.top; t.vy = Math.abs(t.vy) }
      if (c.y > PLAY.bottom) { c.y = PLAY.bottom; t.vy = -Math.abs(t.vy) }
      c.rotation = Math.sin(time * 0.0016 + t.swayPhase) * 0.09
    }

    // ターゲット同士のかんたんな分離（重なって読めなくなるのを防ぐ）
    for (let i = 0; i < this.targets.length; i++) {
      for (let j = i + 1; j < this.targets.length; j++) {
        const a = this.targets[i], b = this.targets[j]
        if (!a.alive || !b.alive) continue
        const dx = b.container.x - a.container.x
        const dy = b.container.y - a.container.y
        const dist = Math.hypot(dx, dy)
        const minDist = a.radius + b.radius + 6
        if (dist > 0 && dist < minDist) {
          const push = ((minDist - dist) / 2) * 0.5
          const ux = dx / dist, uy = dy / dist
          a.container.x -= ux * push
          a.container.y -= uy * push
          b.container.x += ux * push
          b.container.y += uy * push
          a.vx = -ux * Math.abs(a.vx || 20); a.vy = -uy * Math.abs(a.vy || 20)
          b.vx = ux * Math.abs(b.vx || 20); b.vy = uy * Math.abs(b.vy || 20)
        }
      }
    }

    // 長く迷っていたら、やさしくヒント
    if (this.roundActive) {
      const elapsed = time - this.roundStartAt
      if (elapsed > 12000 && !this.hintReplayDone) {
        this.hintReplayDone = true
        this.speakPrompt()
        this.tweens.add({ targets: this.missionBar, scale: 1.08, duration: 180, yoyo: true, repeat: 2 })
      }
      if (elapsed > 22000 && !this.hintGlowDone) {
        this.hintGlowDone = true
        this.glowCorrectTarget()
      }
    }
  }
}
