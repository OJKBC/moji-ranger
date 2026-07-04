import Phaser from 'phaser'
import bgUrl from '../assets/bg.jpg'
import enemiesUrl from '../assets/enemies.png'
import { EventBus } from '../EventBus'
import { sfx } from '../audio/sfx'
import { voice } from '../audio/voice'
import { nextStageOf } from '../data/stages'
import { pickDistractors } from '../learning/distractors'
import { pickNextLetter, pickTargetLetter } from '../learning/picker'
import { recordAnswer, recordSeen, recordStageClear } from '../store/progress'
import type { Stage, StageBattle, StageResult, TargetKind } from '../types'

export const GAME_W = 960
export const GAME_H = 640

const FONT = '"Hiragino Maru Gothic ProN", "BIZ UDPGothic", "Yu Gothic UI", "Meiryo", sans-serif'
const BUBBLE_COLORS = [0xffc2d4, 0xaddcff, 0xfff2ad, 0xc9f2b8, 0xe3ccff]
const SHOT_COOLDOWN_MS = 110
/** 強めのオートエイム（4〜6歳: 学習タスクは「正しい文字を選ぶ」こと） */
const AIM_ASSIST_RADIUS = 90

// ---- 疑似遠近投影 ----
const VP = { x: GAME_W / 2, y: 310 } // 消失点
const FOCAL = 300
const GROUND_BASE_Y = 700 // z=0 の地面の投影 y（画面外下）

function project(worldX: number, z: number): { x: number; y: number; s: number } {
  const s = FOCAL / (FOCAL + Math.max(z, -FOCAL * 0.7))
  return { x: VP.x + worldX * s, y: VP.y + (GROUND_BASE_Y - VP.y) * s, s }
}

/** 街の置き物（ビル・木・街灯）のビルボード */
interface SceneryItem {
  sprite: Phaser.GameObjects.Image
  worldX: number
  z0: number
  baseScale: number
}

/** 前方から近づいてくる敵ビルボード */
interface ApproachingEnemy {
  sprite: Phaser.GameObjects.Image
  z0: number
  baseScale: number
  isBoss: boolean
}

/** 対峙中の選択肢バブル（スクリーン空間固定・不透明最前面） */
interface ChoiceBubble {
  container: Phaser.GameObjects.Container
  label: string
  kind: TargetKind
  baseX: number
  baseY: number
  baseScale: number
  radius: number
  bobPhase: number
  alive: boolean
}

type RidePhase = 'riding' | 'slowing' | 'encounter' | 'finished'
type PendingEvent = 'enemy' | 'boss' | 'goal'

/**
 * 2.5D オンレール連戦シーン。
 * 前進中に敵が前方から近づいてくる → 1体ずつ対峙して浄化 → 規定体数でボス出現 → ゴール。
 * 出題は敵ごとに学習システム（間隔反復＋習得に応じたプール開放）が選び、
 * 正答率70〜85%帯を狙って選択肢数・類似文字を自動調整する。
 */
export class Ride25DScene extends Phaser.Scene {
  private stageData: Stage
  private battle!: StageBattle

  // カメラリグ
  private progress = 0
  private speed = 0
  private targetSpeed = 0
  private cruiseSpeed = 150
  private phase: RidePhase = 'riding'
  private pending: PendingEvent = 'enemy'
  private nextEventAt = 0
  private bobY = 0
  private lookUpY = 0 // ボス予兆でゆっくり見上げる

  // 世界
  private bgImage!: Phaser.GameObjects.Image
  private bgBaseY = 0
  private scenery: SceneryItem[] = []
  private groundG!: Phaser.GameObjects.Graphics
  private approach: ApproachingEnemy | null = null

  // 一人称の手・照準
  private handR!: Phaser.GameObjects.Container
  private fingertip = { x: 0, y: 0 }
  private reticle!: Phaser.GameObjects.Container
  private aim = { x: GAME_W / 2, y: 330 }

  // 連戦の進行
  private enemyIndex = 0
  private bossActive = false
  private practiced: string[] = []
  private counterDots: Phaser.GameObjects.Arc[] = []
  private counterCrown: Phaser.GameObjects.Text | null = null

  // 対峙
  private purifyStep = 0
  private purifyStepsNeeded = 1
  private currentTarget = ''
  private lastTarget = ''
  private currentKind: TargetKind = 'hiragana'
  private bubbles: ChoiceBubble[] = []
  private monster: Phaser.GameObjects.Image | null = null
  private mistPuffs: Phaser.GameObjects.Image[] = []
  private meterCells: Phaser.GameObjects.Rectangle[] = []
  private meterBox: Phaser.GameObjects.Container | null = null
  private stepStartAt = 0
  private stepActive = false

  // UI・統計
  private missionLabel!: Phaser.GameObjects.Text
  private missionBar!: Phaser.GameObjects.Container
  private comboBadge!: Phaser.GameObjects.Container
  private comboText!: Phaser.GameObjects.Text
  private combo = 0
  private maxCombo = 0
  private wrongTotal = 0
  private sessionCorrect = 0
  private wrongThisStep = 0
  private wrongTapStreak = 0
  private hintReplayDone = false
  private hintGlowDone = false
  private freezeUntil = 0
  private lastShotAt = -9999
  private acceptInput = true
  private stageStartAt = 0

  constructor(stage: Stage) {
    super('Game')
    this.stageData = stage
  }

  preload(): void {
    this.load.image('bg', bgUrl)
    this.load.spritesheet('enemies', enemiesUrl, { frameWidth: 350, frameHeight: 525 })
  }

  create(): void {
    // battle 未定義の 2.5d ステージにも安全なデフォルトを与える
    this.battle = this.stageData.battle ?? {
      enemyCount: 3,
      purifyStepsPerEnemy: 1,
      bossPurifySteps: 3,
      choiceCount: 5,
      rideDistance: 480,
      letterPool: [this.stageData.correctAnswer ?? 'あ'],
      poolStart: 5,
    }

    this.stageStartAt = this.time.now
    this.makeTextures()
    this.buildSky()
    this.groundG = this.add.graphics().setDepth(50)
    this.buildScenery()
    this.buildHands()
    this.buildReticle()
    this.buildMissionBar()
    this.buildComboBadge()
    this.buildBattleCounter()

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.aim.x = p.x
      this.aim.y = p.y
    })
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.aim.x = p.x
      this.aim.y = p.y
      this.shoot(p.x, p.y)
    })
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.removeAllListeners()
      voice.cancel()
    })

    // 出発！ 最初の敵がもう前方に見えている
    this.pending = 'enemy'
    this.nextEventAt = this.battle.rideDistance
    this.spawnApproaching(false)
    this.phase = 'riding'
    this.targetSpeed = this.cruiseSpeed
    this.setMissionText('もやもやを じょうかしよう！')
    this.time.delayedCall(500, () => voice.speak('もじシティを パトロールだ！ もやもやを じょうかしよう！'))
    this.updateDebugHook()
  }

  // ================================================================ textures

  private makeTextures(): void {
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
      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + (i * Math.PI) / 5
        const radius = i % 2 === 0 ? 14 : 6
        pts.push(new Phaser.Math.Vector2(15 + Math.cos(angle) * radius, 15 + Math.sin(angle) * radius))
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
    if (!this.textures.exists('bubble25')) {
      const size = 160
      const canvas = this.textures.createCanvas('bubble25', size, size)
      if (canvas) {
        const ctx = canvas.getContext()
        const r = size / 2
        const grad = ctx.createRadialGradient(r - 18, r - 22, 10, r, r, r)
        grad.addColorStop(0, 'rgba(255,255,255,1)')
        grad.addColorStop(0.7, 'rgba(252,250,255,0.98)')
        grad.addColorStop(1, 'rgba(240,238,252,0.98)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(r, r, r - 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,1)'
        ctx.lineWidth = 5
        ctx.beginPath()
        ctx.arc(r, r, r - 5, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.beginPath()
        ctx.ellipse(r - 26, r - 34, 20, 12, -0.6, 0, Math.PI * 2)
        ctx.fill()
        canvas.refresh()
      }
    }
    if (!this.textures.exists('mist')) {
      const size = 140
      const canvas = this.textures.createCanvas('mist', size, size)
      if (canvas) {
        const ctx = canvas.getContext()
        const grad = ctx.createRadialGradient(size / 2, size / 2, 6, size / 2, size / 2, size / 2)
        grad.addColorStop(0, 'rgba(52,38,84,0.92)')
        grad.addColorStop(0.7, 'rgba(52,38,84,0.6)')
        grad.addColorStop(1, 'rgba(52,38,84,0)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, size, size)
        canvas.refresh()
      }
    }
    for (let v = 0; v < 3; v++) {
      const key = `building${v}`
      if (this.textures.exists(key)) continue
      const w = 170 + v * 34
      const h = 280 + v * 46
      const canvas = this.textures.createCanvas(key, w, h)
      if (!canvas) continue
      const ctx = canvas.getContext()
      const bodies = ['#3d2f78', '#46337f', '#37296b']
      const neons = ['#ff6bb5', '#22d3ee', '#ffd94d']
      ctx.fillStyle = bodies[v]
      ctx.beginPath()
      ctx.roundRect(6, 20, w - 12, h - 20, 18)
      ctx.fill()
      ctx.strokeStyle = neons[v]
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.roundRect(10, 24, w - 20, h - 28, 15)
      ctx.stroke()
      ctx.fillStyle = neons[(v + 1) % 3]
      ctx.beginPath()
      ctx.arc(w / 2, 20, 14, Math.PI, 0)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,231,150,0.9)'
      for (let row = 0; row < Math.floor((h - 60) / 44); row++) {
        for (let col = 0; col < Math.floor((w - 40) / 40); col++) {
          if ((row * 3 + col + v) % 4 === 0) continue
          ctx.beginPath()
          ctx.roundRect(24 + col * 40, 44 + row * 44, 22, 26, 6)
          ctx.fill()
        }
      }
      canvas.refresh()
    }
    if (!this.textures.exists('tree')) {
      const canvas = this.textures.createCanvas('tree', 120, 150)
      if (canvas) {
        const ctx = canvas.getContext()
        ctx.fillStyle = '#7a5230'
        ctx.beginPath()
        ctx.roundRect(52, 90, 16, 60, 6)
        ctx.fill()
        ctx.fillStyle = '#3f9e52'
        for (const [cx, cy, r] of [[60, 55, 42], [34, 74, 28], [88, 72, 28]] as const) {
          ctx.beginPath()
          ctx.arc(cx, cy, r, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.fillStyle = 'rgba(120,220,140,0.55)'
        ctx.beginPath()
        ctx.arc(48, 46, 18, 0, Math.PI * 2)
        ctx.fill()
        canvas.refresh()
      }
    }
    if (!this.textures.exists('lamp')) {
      const canvas = this.textures.createCanvas('lamp', 60, 170)
      if (canvas) {
        const ctx = canvas.getContext()
        ctx.fillStyle = '#5a4a8f'
        ctx.beginPath()
        ctx.roundRect(26, 30, 8, 140, 4)
        ctx.fill()
        const grad = ctx.createRadialGradient(30, 24, 3, 30, 24, 22)
        grad.addColorStop(0, 'rgba(255,235,170,1)')
        grad.addColorStop(1, 'rgba(255,235,170,0)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, 60, 48)
        ctx.fillStyle = '#ffe9a8'
        ctx.beginPath()
        ctx.arc(30, 24, 9, 0, Math.PI * 2)
        ctx.fill()
        canvas.refresh()
      }
    }
    this.makeHandTexture('hand-r', false)
    this.makeHandTexture('hand-l', true)
  }

  /** かわいい手袋の手を描く。mirror=true は左手（ひらいた手） */
  private makeHandTexture(key: string, mirror: boolean): void {
    if (this.textures.exists(key)) return
    const w = 240, h = 300
    const canvas = this.textures.createCanvas(key, w, h)
    if (!canvas) return
    const ctx = canvas.getContext()
    ctx.save()
    if (mirror) {
      ctx.translate(w, 0)
      ctx.scale(-1, 1)
    }
    ctx.strokeStyle = '#e04545'
    ctx.lineWidth = 92
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(196, 320)
    ctx.lineTo(120, 150)
    ctx.stroke()
    ctx.save()
    ctx.translate(150, 210)
    ctx.rotate(-0.42)
    ctx.fillStyle = '#f2b632'
    ctx.beginPath()
    ctx.roundRect(-58, -26, 116, 52, 18)
    ctx.fill()
    ctx.fillStyle = '#ffd94d'
    ctx.beginPath()
    ctx.roundRect(-34, -46, 68, 40, 12)
    ctx.fill()
    const wg = ctx.createRadialGradient(0, -26, 2, 0, -26, 20)
    wg.addColorStop(0, '#d6fbff')
    wg.addColorStop(0.6, '#3fd9f2')
    wg.addColorStop(1, '#1893ad')
    ctx.fillStyle = wg
    ctx.beginPath()
    ctx.arc(0, -26, 15, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = '#2f6fe0'
    ctx.beginPath()
    ctx.ellipse(104, 108, 46, 40, -0.35, 0, Math.PI * 2)
    ctx.fill()
    if (!mirror) {
      ctx.strokeStyle = '#2f6fe0'
      ctx.lineWidth = 30
      ctx.beginPath()
      ctx.moveTo(88, 92)
      ctx.lineTo(52, 34)
      ctx.stroke()
      ctx.fillStyle = '#2758b8'
      for (const [fx, fy] of [[126, 78], [142, 96], [148, 118]] as const) {
        ctx.beginPath()
        ctx.ellipse(fx, fy, 17, 14, -0.3, 0, Math.PI * 2)
        ctx.fill()
      }
    } else {
      ctx.strokeStyle = '#2f6fe0'
      ctx.lineWidth = 24
      for (const [tx, ty] of [[52, 46], [82, 32], [116, 30], [146, 46]] as const) {
        ctx.beginPath()
        ctx.moveTo(100, 96)
        ctx.lineTo(tx, ty)
        ctx.stroke()
      }
    }
    ctx.restore()
    canvas.refresh()
  }

  // ================================================================== world

  private buildSky(): void {
    this.bgImage = this.add.image(GAME_W / 2, GAME_H / 2 - 40, 'bg').setDepth(0)
    const scale = Math.max(GAME_W / this.bgImage.width, GAME_H / this.bgImage.height) * 1.04
    this.bgImage.setScale(scale)
    this.bgBaseY = this.bgImage.y
  }

  private totalRouteDistance(): number {
    return this.battle.rideDistance * (this.battle.enemyCount + 2.5)
  }

  private buildScenery(): void {
    const totalDistance = this.totalRouteDistance()
    const kinds = ['building0', 'tree', 'building1', 'lamp', 'building2', 'tree', 'lamp']
    let i = 0
    for (let z0 = 260; z0 < totalDistance + 2000; z0 += 135, i++) {
      const side = i % 2 === 0 ? -1 : 1
      const key = kinds[i % kinds.length]
      const worldX = side * (340 + ((i * 137) % 240))
      const baseScale = key.startsWith('building') ? 0.95 + ((i * 53) % 45) / 100 : 0.9 + ((i * 31) % 30) / 100
      const sprite = this.add.image(0, 0, key).setOrigin(0.5, 1).setVisible(false)
      this.scenery.push({ sprite, worldX, z0, baseScale })
    }
  }

  private renderWorld(time: number): void {
    const yOff = this.bobY + this.lookUpY
    this.bgImage.y = this.bgBaseY + yOff * 0.55

    const g = this.groundG
    g.clear()
    g.fillGradientStyle(0x241a4a, 0x241a4a, 0x241a4a, 0x241a4a, 0, 0, 0.95, 0.95)
    g.fillRect(0, VP.y + 6 + yOff, GAME_W, 130)
    g.fillStyle(0x241a4a, 0.95)
    g.fillRect(0, VP.y + 136 + yOff, GAME_W, GAME_H - VP.y - 136)
    const spacing = 130
    for (let k = 0; k < 16; k++) {
      const z = k * spacing - (this.progress % spacing)
      if (z < -60) continue
      const p = project(0, z)
      const alpha = Math.min(0.32, 0.05 + p.s * 0.3)
      g.lineStyle(Math.max(1.5, 3 * p.s), 0x8f7fd8, alpha)
      g.lineBetween(VP.x - 900 * p.s, p.y + yOff, VP.x + 900 * p.s, p.y + yOff)
    }
    for (const wx of [-430, -150, 150, 430]) {
      const far = project(wx, 1900)
      const near = project(wx, -60)
      g.lineStyle(2, 0x8f7fd8, 0.22)
      g.lineBetween(far.x, far.y + yOff, near.x, near.y + yOff)
    }

    for (const item of this.scenery) {
      const z = item.z0 - this.progress
      if (z < 30 || z > 1500) {
        item.sprite.setVisible(false)
        continue
      }
      const p = project(item.worldX, z)
      item.sprite
        .setVisible(true)
        .setPosition(p.x, p.y + yOff)
        .setScale(p.s * item.baseScale)
        .setDepth(60 + Math.round(1500 - z))
        .setAlpha(Math.min(1, (1500 - z) / 260))
      const dim = Math.round(150 + 105 * Math.min(1, p.s * 1.4))
      item.sprite.setTint(Phaser.Display.Color.GetColor(dim, dim, Math.min(255, dim + 25)))
    }

    // 前方から近づいてくる敵
    if (this.approach) {
      const a = this.approach
      const z = a.z0 - this.progress
      if (z > 1600) {
        a.sprite.setVisible(false)
      } else {
        const sway = Math.sin(time * 0.0024) * 26
        const p = project(sway, z)
        a.sprite
          .setVisible(true)
          .setPosition(p.x, p.y - 460 * p.s + yOff)
          .setScale(p.s * a.baseScale)
          .setAlpha(Math.min(1, (1600 - z) / 300))
      }
    }
  }

  /** 次の敵を前方に出す（近づいてくるのが見える） */
  private spawnApproaching(isBoss: boolean): void {
    const sprite = this.add.image(0, 0, 'enemies', 0)
      .setOrigin(0.5, 0.5).setDepth(3500).setVisible(false).setTint(0xb8b8cc)
    // 対峙位置（z≈90）でちょうど対峙サイズになる逆算スケール
    const meetScale = isBoss ? 0.74 : 0.5
    const sAtMeet = FOCAL / (FOCAL + 90)
    this.approach = {
      sprite,
      z0: this.nextEventAt + 90,
      baseScale: meetScale / sAtMeet,
      isBoss,
    }
  }

  // ================================================================== rig

  private updateRig(dt: number): void {
    if (this.phase !== 'riding' && this.phase !== 'slowing') return
    const remain = this.nextEventAt - this.progress
    if (remain < 170 && this.phase === 'riding' && this.pending !== 'goal') {
      this.phase = 'slowing'
      this.targetSpeed = 30
    }
    this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * 2.2)
    this.progress += this.speed * dt
    if (this.progress >= this.nextEventAt) {
      this.progress = this.nextEventAt
      if (this.pending === 'goal') {
        this.finishStage()
      } else {
        this.speed = 0
        this.beginEncounter(this.pending === 'boss')
      }
    }
  }

  // ============================================================== encounter

  private beginEncounter(isBoss: boolean): void {
    this.phase = 'encounter'
    this.bossActive = isBoss
    this.purifyStep = 0
    this.purifyStepsNeeded = isBoss ? this.battle.bossPurifySteps : this.battle.purifyStepsPerEnemy

    // 近づいてきたビルボードを対峙位置へなめらかに引き継ぐ
    const targetScale = isBoss ? 0.72 : 0.5
    const targetY = isBoss ? 222 : 235
    let m: Phaser.GameObjects.Image
    if (this.approach) {
      m = this.approach.sprite
      this.approach = null
      m.setDepth(4000)
    } else {
      m = this.add.image(GAME_W / 2, 330, 'enemies', 0).setDepth(4000).setScale(0.1).setTint(0xb8b8cc)
    }
    this.monster = m
    this.tweens.add({
      targets: m, x: GAME_W / 2, y: targetY, scale: targetScale,
      duration: 550, ease: 'Sine.easeOut',
      onComplete: () => {
        m.setTint(0xcfcfe0)
        this.tweens.add({
          targets: m, y: targetY + 10, duration: 1900,
          yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        })
      },
    })

    // もやパフ（ボスは多め）
    this.mistPuffs = []
    const offsets: Array<[number, number, number]> = isBoss
      ? [[-135, -70, 1.2], [135, -65, 1.2], [-110, 55, 1.05], [110, 60, 1.05], [0, -125, 1.3], [0, 105, 1.0]]
      : [[-100, -50, 0.9], [100, -45, 0.9], [0, -90, 1.0], [0, 75, 0.8]]
    offsets.forEach(([ox, oy, s], i) => {
      const puff = this.add.image(GAME_W / 2 + ox, targetY + oy, 'mist')
        .setDepth(4010).setScale(0).setAlpha(0.9)
      this.mistPuffs.push(puff)
      this.tweens.add({ targets: puff, scale: s, duration: 600, delay: 250 + i * 60, ease: 'Sine.easeOut' })
      this.tweens.add({
        targets: puff, x: GAME_W / 2 + ox * 1.12, y: targetY + oy * 1.12,
        duration: 2100 + i * 200, delay: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    })

    // 浄化メーターは複数回のときだけ（ザコ1発はテンポ優先）
    if (this.purifyStepsNeeded > 1) {
      this.buildPurifyMeter(this.purifyStepsNeeded)
    }

    if (isBoss) {
      voice.speak('おおきな もやもや ボスだ！ がんばれ！')
    }
    this.time.delayedCall(isBoss ? 1000 : 650, () => this.startPurifyStep())
  }

  private buildPurifyMeter(steps: number): void {
    const width = 300
    const bg = this.add.graphics()
    bg.fillStyle(0x241a4a, 0.85)
    bg.fillRoundedRect(-width / 2 - 8, -17, width + 16, 34, 17)
    bg.lineStyle(3, 0xffd94d, 1)
    bg.strokeRoundedRect(-width / 2 - 8, -17, width + 16, 34, 17)
    const label = this.add.text(-width / 2 - 20, 0, 'じょうか', {
      fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#ffd94d',
    }).setOrigin(1, 0.5)
    this.meterCells = []
    const cellW = (width - (steps + 1) * 6) / steps
    const items: Phaser.GameObjects.GameObject[] = [bg, label]
    for (let i = 0; i < steps; i++) {
      const cell = this.add.rectangle(-width / 2 + 6 + i * (cellW + 6) + cellW / 2, 0, cellW, 20, 0x22d3ee)
        .setAlpha(0.16)
      this.meterCells.push(cell)
      items.push(cell)
    }
    this.meterBox = this.add.container(GAME_W / 2, 150, items).setDepth(8000).setScale(0)
    this.tweens.add({ targets: this.meterBox, scale: 1, duration: 320, delay: 400, ease: 'Back.easeOut' })
  }

  /** 1問分の出題。狙う文字は学習システムが選び、毎回明確に伝える */
  private startPurifyStep(): void {
    this.stepActive = false
    this.wrongThisStep = 0
    this.hintReplayDone = false
    this.hintGlowDone = false

    // 出題文字: ボスは直近で練習した文字、ザコは開放済みプールから間隔反復で
    this.currentKind = this.stageData.correctKind
    if (this.bossActive && this.practiced.length > 0) {
      const pool = [...new Set(this.practiced)]
      const candidates = pool.length > 1 ? pool.filter(l => l !== this.lastTarget) : pool
      this.currentTarget = pickNextLetter(candidates, this.currentKind)
    } else {
      this.currentTarget = pickTargetLetter(
        this.battle.letterPool, this.battle.poolStart, this.currentKind, this.lastTarget,
      )
    }
    this.lastTarget = this.currentTarget

    // 難易度調整: 正答率70〜85%帯を狙う
    const attempts = this.sessionCorrect + this.wrongTotal
    const accuracy = attempts > 0 ? this.sessionCorrect / attempts : 1
    let choiceCount = this.battle.choiceCount
    if (attempts >= 3 && accuracy < 0.7) choiceCount = Math.max(3, choiceCount - 1)
    const useConfusables = attempts >= 3 && accuracy > 0.85

    // 「今回狙う文字」を音声＋大きな表示で毎回明確に
    this.announceTarget(this.currentTarget)
    this.setMissionText(`「${this.currentTarget}」を ねらって！`)

    const distractors = pickDistractors(this.currentTarget, choiceCount - 1, useConfusables)
    const labels = Phaser.Utils.Array.Shuffle([this.currentTarget, ...distractors])
    const arc: Array<[number, number]> = [
      [-330, 300], [-185, 372], [0, 408], [185, 372], [330, 300],
    ]
    // 単調にならないよう、たまに左右反転
    const positions = (this.enemyIndex + this.purifyStep) % 2 === 1
      ? arc.map(([x, y]) => [-x, y] as [number, number])
      : arc

    this.time.delayedCall(650, () => {
      labels.forEach((label, i) => {
        const [ox, oy] = positions[i % positions.length]
        this.createChoiceBubble(label, this.currentKind, GAME_W / 2 + ox, oy, i)
      })
      recordSeen(this.currentTarget, this.currentKind)
      this.stepStartAt = this.time.now
      this.stepActive = true
      this.updateDebugHook()
    })
  }

  /** 狙う文字のアナウンス（中サイズのフラッシュ表示＋読み上げ） */
  private announceTarget(label: string): void {
    voice.speak(`${label} を ねらって！`)
    const glow = this.add.image(GAME_W / 2, 300, 'softglow')
      .setDepth(8390).setScale(1.7).setAlpha(0.8).setTint(0xfff2c0)
    const big = this.add.text(GAME_W / 2, 300, label, {
      fontFamily: FONT, fontSize: '130px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(8400).setStroke('#7a4dff', 12).setScale(0)
    big.setShadow(0, 5, 'rgba(80,40,120,0.45)', 10)
    this.tweens.add({ targets: big, scale: 1, duration: 240, ease: 'Back.easeOut' })
    this.tweens.add({
      targets: [big, glow], alpha: 0, y: 250, duration: 300, delay: 750,
      ease: 'Cubic.easeIn',
      onComplete: () => { big.destroy(); glow.destroy() },
    })
  }

  private speakPrompt(): void {
    if (this.currentTarget) voice.speak(`${this.currentTarget} を ねらって！`)
  }

  private createChoiceBubble(label: string, kind: TargetKind, x: number, y: number, index: number): void {
    const colorIndex = Phaser.Math.Between(0, BUBBLE_COLORS.length - 1)
    const bubble = this.add.image(0, 0, 'bubble25').setTint(BUBBLE_COLORS[colorIndex])
    const letter = this.add.text(0, 0, label, {
      fontFamily: FONT, fontSize: '62px', fontStyle: 'bold', color: '#33336b',
    }).setOrigin(0.5).setStroke('#ffffff', 8)
    // 文字バブルは常に不透明・最前面（敵と重なってもくっきり）
    const container = this.add.container(x, y, [bubble, letter]).setDepth(6000)
    const baseScale = 0.76
    const choice: ChoiceBubble = {
      container, label, kind,
      baseX: x, baseY: y, baseScale,
      radius: 80 * baseScale,
      bobPhase: index * 1.3,
      alive: true,
    }
    this.bubbles.push(choice)
    container.setScale(0)
    this.tweens.add({
      targets: container, scale: baseScale,
      duration: 300, delay: index * 60, ease: 'Back.easeOut',
    })
  }

  private clearBubbles(): void {
    for (const b of this.bubbles) {
      b.alive = false
      this.tweens.add({
        targets: b.container, scale: 0, alpha: 0, duration: 300, ease: 'Back.easeIn',
        onComplete: () => b.container.destroy(),
      })
    }
    this.bubbles = []
  }

  // ------------------------------------------------------------- 正解/誤答

  private resolveCorrect(b: ChoiceBubble): void {
    if (!this.stepActive) return
    this.stepActive = false
    const reaction = this.time.now - this.stepStartAt
    recordAnswer(this.currentTarget, this.currentKind, true, reaction)
    this.sessionCorrect++
    if (!this.practiced.includes(this.currentTarget)) this.practiced.push(this.currentTarget)

    this.hitJuiceAt(b.container.x, b.container.y, 0xffffff)
    b.alive = false
    this.tweens.add({
      targets: b.container, scale: b.baseScale * 1.35, alpha: 0, duration: 90,
      onComplete: () => b.container.destroy(),
    })
    this.bubbles = this.bubbles.filter(other => other !== b)

    this.bumpCombo()
    this.showBigLetter(b.label)
    this.wrongTapStreak = 0

    this.purifyStep++
    this.advancePurify()
    this.clearBubbles()

    if (this.purifyStep >= this.purifyStepsNeeded) {
      this.time.delayedCall(850, () => this.completePurify())
    } else {
      this.time.delayedCall(1250, () => this.startPurifyStep())
    }
    this.updateDebugHook()
  }

  private advancePurify(): void {
    const cell = this.meterCells[this.purifyStep - 1]
    if (cell && this.meterBox) {
      cell.setAlpha(1)
      this.tweens.add({ targets: cell, scaleY: 1.7, duration: 150, yoyo: true })
      const glow = this.add.image(this.meterBox.x + cell.x, this.meterBox.y, 'star')
        .setDepth(8001).setTint(0x9ff3ff).setScale(0.6)
      this.tweens.add({
        targets: glow, scale: 1.4, alpha: 0, duration: 450,
        onComplete: () => glow.destroy(),
      })
    }
    // もやが段階的に晴れる
    const perStep = Math.ceil(this.mistPuffs.length / this.purifyStepsNeeded)
    const start = (this.purifyStep - 1) * perStep
    for (const puff of this.mistPuffs.slice(start, start + perStep)) {
      this.tweens.add({
        targets: puff, alpha: 0, scale: puff.scale * 1.5, duration: 600, ease: 'Sine.easeOut',
      })
    }
    if (this.monster) {
      const t = this.purifyStep / this.purifyStepsNeeded
      const v = Math.round(0xcf + (0xff - 0xcf) * t)
      this.monster.setTint(Phaser.Display.Color.GetColor(v, v, Math.min(255, v + 8)))
      this.tweens.add({
        targets: this.monster, scale: this.monster.scale * 1.06, duration: 180, yoyo: true, ease: 'Sine.easeOut',
      })
    }
  }

  /** 完全浄化 → 笑顔で空へ → 進行再開（ボスは締めの演出強め） */
  private completePurify(): void {
    const m = this.monster
    if (!m) return
    const isBoss = this.bossActive
    const praises = ['やったー！', 'ピカピカ！', 'ありがとう！']
    voice.speak(isBoss ? 'ボスを じょうか！ きみは もじレンジャーだ！' : praises[this.enemyIndex % praises.length])
    sfx.purify()
    if (isBoss) this.time.delayedCall(400, () => sfx.fanfare())

    const happy = this.add.image(m.x, m.y, 'enemies', 1)
      .setDepth(4001).setScale(m.scale).setAlpha(0)
    this.tweens.add({ targets: happy, alpha: 1, duration: 350 })
    this.tweens.add({ targets: m, alpha: 0, duration: 350 })
    for (const puff of this.mistPuffs) {
      this.tweens.add({ targets: puff, alpha: 0, duration: 250 })
    }
    const sparkle = this.add.particles(0, 0, 'star', {
      speed: { min: 60, max: isBoss ? 260 : 200 }, scale: { start: 0.9, end: 0 },
      lifespan: 800, tint: [0xffe066, 0xffffff, 0xc7f0ff], emitting: false,
    }).setDepth(4100)
    sparkle.explode(isBoss ? 30 : 16, m.x, m.y)
    this.time.delayedCall(1000, () => sparkle.destroy())

    const riseDelay = isBoss ? 800 : 450
    this.tweens.add({
      targets: happy, y: m.y - 240, alpha: 0, scale: m.scale * 0.8,
      duration: 900, delay: riseDelay, ease: 'Sine.easeIn',
    })
    if (this.meterBox) {
      this.tweens.add({ targets: this.meterBox, alpha: 0, duration: 300, delay: riseDelay })
    }

    this.time.delayedCall(isBoss ? 1800 : 1150, () => {
      m.destroy()
      happy.destroy()
      this.mistPuffs.forEach(p => p.destroy())
      this.mistPuffs = []
      this.meterBox?.destroy()
      this.meterBox = null
      this.meterCells = []
      this.monster = null
      this.afterPurify(isBoss)
    })
  }

  /** 浄化後の進行: 次の敵 → （規定体数で）ボス → ゴール */
  private afterPurify(wasBoss: boolean): void {
    if (wasBoss) {
      this.fillCounterCrown()
      this.pending = 'goal'
      this.nextEventAt = this.progress + this.battle.rideDistance * 0.9
      this.setMissionText('ゴールへ すすめー！')
      voice.speak('ゴールへ すすめー！')
    } else {
      this.fillCounterDot(this.enemyIndex)
      this.enemyIndex++
      if (this.enemyIndex >= this.battle.enemyCount) {
        // ボス予兆: ゆっくり見上げる＋低い気配
        this.pending = 'boss'
        this.nextEventAt = this.progress + this.battle.rideDistance * 1.3
        this.spawnApproaching(true)
        this.setMissionText('おおきいのが くるぞ…！')
        sfx.omen()
        this.time.delayedCall(400, () => voice.speak('…おや？ おおきな もやもやが やってくる…！'))
        this.tweens.add({ targets: this, lookUpY: 26, duration: 1400, ease: 'Sine.easeInOut' })
      } else {
        this.pending = 'enemy'
        this.nextEventAt = this.progress + this.battle.rideDistance
        this.spawnApproaching(false)
        this.setMissionText('つぎの もやもやだ！')
      }
    }
    if (wasBoss) {
      this.tweens.add({ targets: this, lookUpY: 0, duration: 1000, ease: 'Sine.easeInOut' })
    }
    this.phase = 'riding'
    this.targetSpeed = this.cruiseSpeed
    this.bossActive = false
    this.updateDebugHook()
  }

  private resolveWrong(b: ChoiceBubble): void {
    sfx.wrong()
    this.combo = 0
    this.tweens.add({ targets: this.comboBadge, alpha: 0, duration: 250 })
    this.wrongThisStep++
    this.wrongTapStreak++
    this.wrongTotal++

    this.tweens.add({ targets: b.container, angle: 10, duration: 60, yoyo: true, repeat: 3 })
    this.showGentleFeedback(b.container.x, b.container.y, `これは「${b.label}」だよ`)
    voice.speak(`これは、${b.label}、だよ`)

    // 知識の誤りなので統計に記録（撃ち逃し・時間切れは記録しない）
    recordAnswer(this.currentTarget, this.currentKind, false)

    if (this.wrongThisStep === 2) {
      const correct = this.bubbles.find(x => x.alive && x.label === this.currentTarget)
      if (correct) {
        correct.baseScale *= 1.25
        correct.radius = 80 * correct.baseScale
        this.tweens.add({ targets: correct.container, scale: correct.baseScale, duration: 350, ease: 'Back.easeOut' })
      }
    }
    if (this.wrongTapStreak >= 3) {
      this.wrongTapStreak = 0
      this.glowCorrectBubble()
    }
  }

  private glowCorrectBubble(): void {
    const correct = this.bubbles.find(t => t.alive && t.label === this.currentTarget)
    if (!correct) return
    const ring = this.add.image(correct.container.x, correct.container.y, 'ring')
      .setDepth(5990).setTint(0xffe066).setScale(2.2).setAlpha(0)
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

  // ============================================================= 手・ビーム

  private buildHands(): void {
    const right = this.add.image(0, 0, 'hand-r').setOrigin(0.5, 1)
    this.handR = this.add.container(GAME_W - 175, GAME_H + 24, [right]).setDepth(7000)
    const left = this.add.image(0, 0, 'hand-l').setOrigin(0.5, 1).setScale(0.9)
    const handL = this.add.container(150, GAME_H + 60, [left]).setDepth(7000)
    this.tweens.add({
      targets: this.handR, y: GAME_H + 30, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
    this.tweens.add({
      targets: handL, y: GAME_H + 66, duration: 1900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
    this.fingertip.x = this.handR.x + (52 - 120)
    this.fingertip.y = GAME_H + 24 - 300 + 34
    const glow = this.add.image(this.fingertip.x, this.fingertip.y, 'softglow')
      .setDepth(7001).setScale(0.22).setTint(0xffe066).setAlpha(0.5)
    this.tweens.add({
      targets: glow, scale: 0.3, alpha: 0.7, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
  }

  private buildReticle(): void {
    const ring = this.add.image(0, 0, 'ring').setTint(0xffe066).setAlpha(0.85)
    const dotImg = this.add.image(0, 0, 'dot').setTint(0xffffff).setScale(0.4).setAlpha(0.9)
    // 文字バブル(6000)より下に置き、文字を絶対に隠さない
    this.reticle = this.add.container(this.aim.x, this.aim.y, [ring, dotImg]).setDepth(5900)
    this.tweens.add({
      targets: ring, scale: 1.25, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
  }

  private shoot(x: number, y: number): void {
    if (!this.acceptInput) return
    const now = this.time.now
    if (now - this.lastShotAt < SHOT_COOLDOWN_MS) return
    this.lastShotAt = now

    let best: ChoiceBubble | null = null
    let bestDist = Infinity
    for (const b of this.bubbles) {
      if (!b.alive) continue
      const d = Phaser.Math.Distance.Between(x, y, b.container.x, b.container.y)
      if (d < b.radius + AIM_ASSIST_RADIUS && d < bestDist) {
        best = b
        bestDist = d
      }
    }

    const ix = best ? best.container.x : x
    const iy = best ? best.container.y : y
    this.drawBeam(ix, iy)
    sfx.shoot()

    if (!best) {
      this.fizzle(ix, iy)
      return
    }
    if (best.label === this.currentTarget) {
      this.resolveCorrect(best)
    } else {
      this.resolveWrong(best)
    }
  }

  private drawBeam(tx: number, ty: number): void {
    const fx = this.fingertip.x
    const fy = this.fingertip.y
    const dx = tx - fx
    const dy = ty - fy
    const len = Math.hypot(dx, dy) || 1
    const px = -dy / len
    const py = dx / len
    const wide = 15
    const tip = 4

    const g = this.add.graphics().setDepth(7500)
    const poly = (w1: number, w2: number, color: number, alpha: number) => {
      g.fillStyle(color, alpha)
      g.fillPoints([
        new Phaser.Math.Vector2(fx + px * w1, fy + py * w1),
        new Phaser.Math.Vector2(tx + px * w2, ty + py * w2),
        new Phaser.Math.Vector2(tx - px * w2, ty - py * w2),
        new Phaser.Math.Vector2(fx - px * w1, fy - py * w1),
      ], true)
    }
    poly(wide * 1.8, tip * 2.4, 0xffd94d, 0.25)
    poly(wide, tip * 1.5, 0xfff3b0, 0.65)
    poly(wide * 0.45, tip, 0xffffff, 1)
    g.fillStyle(0xffffff, 0.95)
    g.fillCircle(tx, ty, 13)
    g.fillStyle(0xffe066, 0.45)
    g.fillCircle(tx, ty, 25)
    this.tweens.add({ targets: g, alpha: 0, duration: 110, onComplete: () => g.destroy() })

    const muzzle = this.add.image(fx, fy, 'star').setDepth(7501).setTint(0xffe066).setScale(0.9)
    this.tweens.add({
      targets: muzzle, scale: 0.2, alpha: 0, angle: 90, duration: 140,
      onComplete: () => muzzle.destroy(),
    })
    this.tweens.add({ targets: this.handR, x: GAME_W - 179, duration: 55, yoyo: true })
  }

  private fizzle(x: number, y: number): void {
    sfx.fizzle()
    const emitter = this.add.particles(0, 0, 'dot', {
      speed: { min: 30, max: 90 }, scale: { start: 0.4, end: 0 },
      lifespan: 300, tint: 0xffffff, emitting: false,
    }).setDepth(7600)
    emitter.explode(6, x, y)
    this.time.delayedCall(400, () => emitter.destroy())
  }

  private hitJuiceAt(x: number, y: number, tint: number): void {
    sfx.pop()
    this.freezeUntil = this.time.now + 55
    this.tweens.timeScale = 0.05
    this.time.delayedCall(55, () => { this.tweens.timeScale = 1 })
    this.cameras.main.shake(60, 0.003)

    const dots = this.add.particles(0, 0, 'dot', {
      speed: { min: 70, max: 260 }, scale: { start: 0.8, end: 0 },
      lifespan: 460, tint: [tint, 0xffffff, 0xffe066], emitting: false,
    }).setDepth(7600)
    dots.explode(18, x, y)
    const stars = this.add.particles(0, 0, 'star', {
      speed: { min: 60, max: 190 }, scale: { start: 0.85, end: 0 },
      rotate: { min: 0, max: 360 }, lifespan: 580, tint: 0xffe066, emitting: false,
    }).setDepth(7600)
    stars.explode(6, x, y)
    this.time.delayedCall(800, () => { dots.destroy(); stars.destroy() })

    const ring = this.add.image(x, y, 'ring').setDepth(7600).setScale(0.4)
    this.tweens.add({
      targets: ring, scale: 2.4, alpha: 0, duration: 300, ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    })
    this.time.delayedCall(90, () => sfx.sparkle())
  }

  // ================================================================== UI

  private buildMissionBar(): void {
    const width = 560
    const bg = this.add.graphics()
    bg.fillStyle(0xffffff, 0.94)
    bg.fillRoundedRect(-width / 2, -37, width, 74, 26)
    bg.lineStyle(4, 0xffc94d, 1)
    bg.strokeRoundedRect(-width / 2, -37, width, 74, 26)
    this.missionLabel = this.add.text(-24, 0, '', {
      fontFamily: FONT, fontSize: '32px', fontStyle: 'bold', color: '#3a3a70',
    }).setOrigin(0.5)
    const speakerBg = this.add.circle(width / 2 - 46, 0, 27, 0xffc94d)
    const speaker = this.add.text(width / 2 - 46, 1, '🔊', { fontSize: '28px' }).setOrigin(0.5)
    speakerBg.setInteractive({ useHandCursor: true })
    speakerBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation()
      sfx.uiTap()
      this.speakPrompt()
    })
    this.missionBar = this.add.container(GAME_W / 2, 52, [bg, this.missionLabel, speakerBg, speaker]).setDepth(8000)
    this.missionBar.setScale(0)
    this.tweens.add({ targets: this.missionBar, scale: 1, duration: 320, ease: 'Back.easeOut' })
  }

  private setMissionText(text: string): void {
    this.missionLabel.setText(text)
  }

  private buildComboBadge(): void {
    const star = this.add.image(-30, 0, 'star').setTint(0xffd94d).setScale(1.4)
    this.comboText = this.add.text(-8, 0, '', {
      fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0, 0.5).setStroke('#b8860b', 6)
    this.comboBadge = this.add.container(GAME_W - 150, 120, [star, this.comboText])
      .setDepth(8000).setAlpha(0)
  }

  /** ボスまでの進行カウンター（浄化した敵の数＋ボス王冠） */
  private buildBattleCounter(): void {
    const items: Phaser.GameObjects.GameObject[] = []
    for (let i = 0; i < this.battle.enemyCount; i++) {
      const dot = this.add.circle(i * 32, 0, 9, 0xffffff, 0.3).setStrokeStyle(2, 0xffffff, 0.7)
      this.counterDots.push(dot)
      items.push(dot)
    }
    this.counterCrown = this.add.text(this.battle.enemyCount * 32 + 4, 1, '👑', { fontSize: '24px' })
      .setOrigin(0.5).setAlpha(0.45)
    items.push(this.counterCrown)
    this.add.container(70, 120, items).setDepth(8000)
  }

  private fillCounterDot(index: number): void {
    const dot = this.counterDots[index]
    if (!dot) return
    dot.setFillStyle(0xffd94d, 1)
    this.tweens.add({ targets: dot, scale: 1.6, duration: 180, yoyo: true })
  }

  private fillCounterCrown(): void {
    if (!this.counterCrown) return
    this.counterCrown.setAlpha(1)
    this.tweens.add({ targets: this.counterCrown, scale: 1.7, duration: 250, yoyo: true })
  }

  private bumpCombo(): void {
    this.combo++
    this.maxCombo = Math.max(this.maxCombo, this.combo)
    if (this.combo >= 2) {
      sfx.comboUp(this.combo)
      this.comboText.setText(`×${this.combo}`)
      this.comboBadge.setAlpha(1).setScale(0.6)
      this.tweens.add({ targets: this.comboBadge, scale: 1, duration: 220, ease: 'Back.easeOut' })
    }
  }

  private showBigLetter(label: string): void {
    const glow = this.add.image(GAME_W / 2, GAME_H / 2 - 30, 'softglow')
      .setDepth(8490).setScale(2.6).setAlpha(0.85).setTint(0xfff2c0)
    const big = this.add.text(GAME_W / 2, GAME_H / 2 - 30, label, {
      fontFamily: FONT, fontSize: '200px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(8500).setStroke('#ff8fb0', 14)
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

  private showGentleFeedback(x: number, y: number, text: string): void {
    const label = this.add.text(0, 0, text, {
      fontFamily: FONT, fontSize: '27px', fontStyle: 'bold', color: '#3a3a70',
    }).setOrigin(0.5)
    const pad = 18
    const bg = this.add.graphics()
    bg.fillStyle(0xffffff, 0.95)
    bg.fillRoundedRect(-label.width / 2 - pad, -26, label.width + pad * 2, 52, 20)
    const fx = Phaser.Math.Clamp(x, 150, GAME_W - 150)
    const fy = Phaser.Math.Clamp(y - 85, 150, GAME_H - 100)
    const feedback = this.add.container(fx, fy, [bg, label]).setDepth(8300).setScale(0)
    this.tweens.add({ targets: feedback, scale: 1, duration: 220, ease: 'Back.easeOut' })
    this.tweens.add({
      targets: feedback, alpha: 0, duration: 300, delay: 1400,
      onComplete: () => feedback.destroy(),
    })
  }

  // ================================================================== end

  private finishStage(): void {
    if (this.phase === 'finished') return
    this.phase = 'finished'
    this.acceptInput = false
    this.speed = 0
    this.targetSpeed = 0
    sfx.fanfare()
    voice.speak('ゴール！ きょうの パトロール、だいせいこう！')

    const banner = this.add.text(GAME_W / 2, GAME_H / 2 - 40, 'ゴール！', {
      fontFamily: FONT, fontSize: '110px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(8600).setStroke('#7a4dff', 14).setScale(0)
    banner.setShadow(0, 6, 'rgba(80,40,120,0.45)', 12)
    this.tweens.add({ targets: banner, scale: 1, duration: 380, ease: 'Back.easeOut' })

    const confetti = this.add.particles(0, 0, 'dot', {
      x: { min: 0, max: GAME_W }, y: -20,
      speedY: { min: 120, max: 300 }, speedX: { min: -40, max: 40 },
      scale: { start: 0.7, end: 0.2 },
      tint: [0xff4d4d, 0x3da9ff, 0xffd94d, 0x4ccb5a, 0xff6bb5],
      lifespan: 2400, quantity: 4, frequency: 40,
    }).setDepth(8550)
    this.time.delayedCall(1800, () => confetti.stop())

    const stars: 1 | 2 | 3 = this.wrongTotal <= 1 ? 3 : this.wrongTotal <= 4 ? 2 : 1
    recordStageClear(this.stageData.id, stars, nextStageOf(this.stageData.id)?.id ?? null)
    const result: StageResult = {
      stageId: this.stageData.id,
      rounds: this.battle.enemyCount * this.battle.purifyStepsPerEnemy + this.battle.bossPurifySteps,
      wrongCount: this.wrongTotal,
      maxCombo: this.maxCombo,
      stars,
      playTimeMs: Math.round(this.time.now - this.stageStartAt),
    }
    this.time.delayedCall(1700, () => EventBus.emit('stage-clear', result))
    this.updateDebugHook()
  }

  private updateDebugHook(): void {
    if (import.meta.env.DEV) {
      // 自動テスト用フック（本番ビルドには含まれない）
      const w = window as unknown as Record<string, unknown>
      w.__debugState = {
        phase: this.phase,
        pending: this.pending,
        enemyIndex: this.enemyIndex,
        boss: this.bossActive,
        purifyStep: this.purifyStep,
        target: this.currentTarget,
      }
      w.__debugTargets = this.bubbles
        .filter(b => b.alive)
        .map(b => ({
          x: b.container.x, y: b.container.y, label: b.label, correct: b.label === this.currentTarget,
        }))
    }
  }

  // ================================================================ update

  update(time: number, delta: number): void {
    if (time < this.freezeUntil) return
    const dt = Math.min(delta / 1000, 0.05)

    const bobAmp = this.phase === 'riding' || this.phase === 'slowing' ? 3 : 0.8
    this.bobY = Math.sin(time * 0.0021) * bobAmp

    this.updateRig(dt)
    this.renderWorld(time)

    this.reticle.x += (this.aim.x - this.reticle.x) * Math.min(1, dt * 14)
    this.reticle.y += (this.aim.y - this.reticle.y) * Math.min(1, dt * 14)

    for (const b of this.bubbles) {
      if (!b.alive) continue
      b.container.x = b.baseX + Math.sin(time * 0.0014 + b.bobPhase) * 7
      b.container.y = b.baseY + Math.sin(time * 0.0019 + b.bobPhase * 2) * 6
      b.container.rotation = Math.sin(time * 0.0013 + b.bobPhase) * 0.05
    }

    // 長く迷っていたら、やさしくヒント（時間切れは作らない）
    if (this.phase === 'encounter' && this.stepActive) {
      const elapsed = time - this.stepStartAt
      if (elapsed > 12000 && !this.hintReplayDone) {
        this.hintReplayDone = true
        this.speakPrompt()
        this.tweens.add({ targets: this.missionBar, scale: 1.08, duration: 180, yoyo: true, repeat: 2 })
      }
      if (elapsed > 22000 && !this.hintGlowDone) {
        this.hintGlowDone = true
        this.glowCorrectBubble()
      }
    }
  }
}
