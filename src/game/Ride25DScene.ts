import Phaser from 'phaser'
import bgUrl from '../assets/bg.jpg'
import enemiesUrl from '../assets/enemies.png'
import { EventBus } from '../EventBus'
import { sfx } from '../audio/sfx'
import { voice } from '../audio/voice'
import { nextStageOf } from '../data/stages'
import { pickNextLetter } from '../learning/picker'
import { recordAnswer, recordSeen, recordStageClear } from '../store/progress'
import type { EncounterSpec, Stage, StageResult, TargetKind, TargetSpec } from '../types'

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

/**
 * 2.5D オンレール対峙シーン。
 * カメラが街を前進 → もやもやモンスターと対峙 → 選択肢を撃って浄化 → また前進。
 * パララックス＋ビルボード拡大の疑似3D（Three.js 不使用）。
 * 文字バブルはスクリーン空間の不透明最前面レイヤーで、奥行き縮小を適用しない（読みやすさ最優先）。
 */
export class Ride25DScene extends Phaser.Scene {
  private stageData: Stage

  // カメラリグ（進行・減速・対峙・再開）
  private progress = 0
  private speed = 0
  private targetSpeed = 0
  private cruiseSpeed = 150
  private phase: RidePhase = 'riding'
  private segIndex = 0
  private segmentEnd = 0 // 現在の ride 区間が終わる progress
  private bobY = 0

  // 世界
  private scenery: SceneryItem[] = []
  private groundG!: Phaser.GameObjects.Graphics

  // 一人称の手・照準
  private handR!: Phaser.GameObjects.Container
  private handL!: Phaser.GameObjects.Container
  private fingertip = { x: 0, y: 0 }
  private reticle!: Phaser.GameObjects.Container
  private aim = { x: GAME_W / 2, y: 330 }

  // 対峙
  private encounter: EncounterSpec | null = null
  private purifyStep = 0
  private currentTarget = ''
  private currentKind: TargetKind = 'hiragana'
  private bubbles: ChoiceBubble[] = []
  private monster: Phaser.GameObjects.Image | null = null
  private mistPuffs: Phaser.GameObjects.Image[] = []
  private meterCells: Phaser.GameObjects.Rectangle[] = []
  private meterBox: Phaser.GameObjects.Container | null = null
  private stepStartAt = 0
  private stepActive = false

  // UI・進行
  private missionLabel!: Phaser.GameObjects.Text
  private missionBar!: Phaser.GameObjects.Container
  private comboBadge!: Phaser.GameObjects.Container
  private comboText!: Phaser.GameObjects.Text
  private combo = 0
  private maxCombo = 0
  private wrongTotal = 0
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
    this.stageStartAt = this.time.now
    this.makeTextures()
    this.buildSky()
    this.groundG = this.add.graphics().setDepth(50)
    this.buildScenery()
    this.buildHands()
    this.buildReticle()
    this.buildMissionBar()
    this.buildComboBadge()

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

    // 出発！
    this.setMissionText('すすめー！')
    this.startNextSegment()
    this.time.delayedCall(500, () => voice.speak('もじシティを パトロールだ！ すすめー！'))
    this.updateDebugHook()
  }

  // ================================================================ textures

  private makeTextures(): void {
    // --- 既存シーンと共通のパーツ ---
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
    // --- 不透明バブル（2.5D 対峙用: 敵と重なっても文字がくっきり） ---
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
    // --- もやパフ（敵のまわりの晴れていく「もや」） ---
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
    // --- 街の置き物（ビル3種・木・街灯） ---
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
      // 屋上のネオンライン
      ctx.strokeStyle = neons[v]
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.roundRect(10, 24, w - 20, h - 28, 15)
      ctx.stroke()
      // 屋上ドーム
      ctx.fillStyle = neons[(v + 1) % 3]
      ctx.beginPath()
      ctx.arc(w / 2, 20, 14, Math.PI, 0)
      ctx.fill()
      // 窓
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
    // --- 一人称の手（右: 指さし / 左: ひらいた手） ---
    this.makeHandTexture('hand-r', false)
    this.makeHandTexture('hand-l', true)
  }

  /** かわいい手袋の手を描く。pointing=false は右手（人差し指でねらう） */
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
    // 腕（赤いスーツの袖）: 右下から左上へ
    ctx.strokeStyle = '#e04545'
    ctx.lineWidth = 92
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(196, 320)
    ctx.lineTo(120, 150)
    ctx.stroke()
    // 金のカフス
    ctx.save()
    ctx.translate(150, 210)
    ctx.rotate(-0.42)
    ctx.fillStyle = '#f2b632'
    ctx.beginPath()
    ctx.roundRect(-58, -26, 116, 52, 18)
    ctx.fill()
    // ウォッチ（光る画面）
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
    // 手袋（青）
    ctx.fillStyle = '#2f6fe0'
    ctx.beginPath()
    ctx.ellipse(104, 108, 46, 40, -0.35, 0, Math.PI * 2)
    ctx.fill()
    if (!mirror) {
      // 人差し指（ねらう指）
      ctx.strokeStyle = '#2f6fe0'
      ctx.lineWidth = 30
      ctx.beginPath()
      ctx.moveTo(88, 92)
      ctx.lineTo(52, 34)
      ctx.stroke()
      // にぎった指
      ctx.fillStyle = '#2758b8'
      for (const [fx, fy] of [[126, 78], [142, 96], [148, 118]] as const) {
        ctx.beginPath()
        ctx.ellipse(fx, fy, 17, 14, -0.3, 0, Math.PI * 2)
        ctx.fill()
      }
    } else {
      // ひらいた指
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
    const bg = this.add.image(GAME_W / 2, GAME_H / 2 - 40, 'bg').setDepth(0)
    const scale = Math.max(GAME_W / bg.width, GAME_H / bg.height) * 1.04
    bg.setScale(scale)
  }

  /** ルート全長に沿って街の置き物を先に生やしておく（毎フレームは投影のみ） */
  private buildScenery(): void {
    const totalDistance = this.totalRideDistance()
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

  private totalRideDistance(): number {
    return (this.stageData.segments ?? [])
      .filter(s => s.type === 'ride')
      .reduce((sum, s) => sum + (s.type === 'ride' ? s.distance : 0), 0)
  }

  private renderWorld(time: number): void {
    // 地面（消失点に収束するグリッド）。地平線側は透明に溶かして背景と馴染ませる
    const g = this.groundG
    g.clear()
    g.fillGradientStyle(0x241a4a, 0x241a4a, 0x241a4a, 0x241a4a, 0, 0, 0.95, 0.95)
    g.fillRect(0, VP.y + 6 + this.bobY, GAME_W, 130)
    g.fillStyle(0x241a4a, 0.95)
    g.fillRect(0, VP.y + 136 + this.bobY, GAME_W, GAME_H - VP.y - 136)
    // 横線（進行に合わせて流れる）
    const spacing = 130
    for (let k = 0; k < 16; k++) {
      const z = k * spacing - (this.progress % spacing)
      if (z < -60) continue
      const p = project(0, z)
      const alpha = Math.min(0.32, 0.05 + p.s * 0.3)
      g.lineStyle(Math.max(1.5, 3 * p.s), 0x8f7fd8, alpha)
      g.lineBetween(VP.x - 900 * p.s, p.y + this.bobY, VP.x + 900 * p.s, p.y + this.bobY)
    }
    // 縦線（道の端）
    for (const wx of [-430, -150, 150, 430]) {
      const far = project(wx, 1900)
      const near = project(wx, -60)
      g.lineStyle(2, 0x8f7fd8, 0.22)
      g.lineBetween(far.x, far.y + this.bobY, near.x, near.y + this.bobY)
    }

    // ビルボード
    for (const item of this.scenery) {
      const z = item.z0 - this.progress
      if (z < 30 || z > 1500) {
        item.sprite.setVisible(false)
        continue
      }
      const p = project(item.worldX, z)
      item.sprite
        .setVisible(true)
        .setPosition(p.x, p.y + this.bobY)
        .setScale(p.s * item.baseScale)
        .setDepth(60 + Math.round(1500 - z))
        .setAlpha(Math.min(1, (1500 - z) / 260))
      // 遠くはうっすら夜色に沈む
      const dim = Math.round(150 + 105 * Math.min(1, p.s * 1.4))
      item.sprite.setTint(Phaser.Display.Color.GetColor(dim, dim, Math.min(255, dim + 25)))
    }
    void time
  }

  // ================================================================== rig

  private startNextSegment(): void {
    const segments = this.stageData.segments ?? []
    if (this.segIndex >= segments.length) {
      this.finishStage()
      return
    }
    const seg = segments[this.segIndex]
    if (seg.type === 'ride') {
      this.segmentEnd = this.progress + seg.distance
      this.phase = 'riding'
      this.targetSpeed = this.cruiseSpeed
    } else {
      const enc = (this.stageData.encounters ?? []).find(e => e.id === seg.encounterId)
      this.segIndex++
      if (enc) {
        this.startEncounter(enc)
      } else {
        this.startNextSegment()
      }
    }
  }

  private updateRig(dt: number): void {
    if (this.phase === 'riding' || this.phase === 'slowing') {
      const remain = this.segmentEnd - this.progress
      if (remain < 170 && this.phase === 'riding') {
        this.phase = 'slowing'
        this.targetSpeed = 30
      }
      // なめらかな加減速（急変化は酔いのもと）
      this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * 2.2)
      this.progress += this.speed * dt
      if (this.progress >= this.segmentEnd) {
        this.progress = this.segmentEnd
        this.speed = 0
        this.segIndex++
        this.startNextSegment()
      }
    }
  }

  // ============================================================== encounter

  private startEncounter(enc: EncounterSpec): void {
    this.phase = 'encounter'
    this.encounter = enc
    this.purifyStep = 0

    // 敵の登場（奥からふわっと近づく）
    const mx = GAME_W / 2
    this.monster = this.add.image(mx, 330, 'enemies', 0)
      .setDepth(4000).setScale(0.08).setAlpha(0).setTint(0xcfcfe0)
    this.tweens.add({
      targets: this.monster, scale: 0.5, alpha: 1, y: 235,
      duration: 900, ease: 'Sine.easeOut',
    })
    // ゆったり呼吸
    this.tweens.add({
      targets: this.monster, y: 245, duration: 1900, delay: 950,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })

    // まわりの「もや」（正解ごとに晴れていく）
    this.mistPuffs = []
    const offsets: Array<[number, number, number]> = [
      [-115, -60, 1.0], [115, -55, 1.0], [-95, 45, 0.9], [95, 50, 0.9], [0, -105, 1.1], [0, 90, 0.85],
    ]
    offsets.forEach(([ox, oy, s], i) => {
      const puff = this.add.image(mx + ox, 235 + oy, 'mist')
        .setDepth(4010).setScale(0).setAlpha(0.9)
      this.mistPuffs.push(puff)
      this.tweens.add({ targets: puff, scale: s, duration: 700, delay: 350 + i * 70, ease: 'Sine.easeOut' })
      this.tweens.add({
        targets: puff, x: mx + ox * 1.12, y: 235 + oy * 1.12,
        duration: 2100 + i * 200, delay: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    })

    this.buildPurifyMeter(enc.purifySteps)
    sfx.wrong() // ぼわん、という気配（柔らかい音を流用）
    voice.speak('あっ！ もやもやモンスターだ！')

    this.time.delayedCall(1100, () => this.startPurifyStep())
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
    this.tweens.add({ targets: this.meterBox, scale: 1, duration: 320, delay: 500, ease: 'Back.easeOut' })
  }

  /** 1回分の出題（正解ごとにシャッフル＆学習システムが次の文字を選ぶ） */
  private startPurifyStep(): void {
    const enc = this.encounter!
    this.stepActive = true
    this.wrongThisStep = 0
    this.hintReplayDone = false
    this.hintGlowDone = false
    this.stepStartAt = this.time.now

    // 次に狙う文字は学習システムが選ぶ（間隔反復）
    this.currentTarget = pickNextLetter(enc.letterPool, this.stageData.correctKind)
    this.currentKind = this.stageData.correctKind

    const distractors = Phaser.Utils.Array.Shuffle(
      [...enc.distractorPool].filter(d => d.label !== this.currentTarget),
    ).slice(0, enc.choiceCount - 1)
    const specs: TargetSpec[] = Phaser.Utils.Array.Shuffle([
      { label: this.currentTarget, kind: this.currentKind },
      ...distractors,
    ])

    // 敵を囲むアーチ状の配置（参考画像のレイアウトA）
    const arc: Array<[number, number]> = [
      [-330, 300], [-185, 372], [0, 408], [185, 372], [330, 300],
    ]
    const positions = arc.slice(0, specs.length)
    specs.forEach((spec, i) => {
      const [ox, oy] = positions[i]
      this.createChoiceBubble(spec.label, spec.kind, GAME_W / 2 + ox, oy, i)
    })

    recordSeen(this.currentTarget, this.currentKind)
    this.setMissionText(`「${this.currentTarget}」を ねらって！`)
    this.speakPrompt()
    this.updateDebugHook()
  }

  private speakPrompt(): void {
    if (this.phase !== 'encounter' || !this.stepActive) return
    const templates = [
      `${this.currentTarget} を ねらって、ビーム！`,
      `${this.currentTarget} は どれかな？`,
      `${this.currentTarget} を うって、もやを はらそう！`,
    ]
    voice.speak(templates[this.purifyStep % templates.length])
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

  private clearBubbles(gentle = false): void {
    for (const b of this.bubbles) {
      b.alive = false
      this.tweens.add({
        targets: b.container, scale: 0, alpha: gentle ? 0 : 0, duration: gentle ? 380 : 200,
        ease: 'Back.easeIn',
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

    // 浄化が1段すすむ
    this.purifyStep++
    this.advancePurify()

    const enc = this.encounter!
    this.clearBubbles(true)
    if (this.purifyStep >= enc.purifySteps) {
      this.time.delayedCall(950, () => this.completePurify())
    } else {
      this.time.delayedCall(1150, () => this.startPurifyStep())
    }
    this.updateDebugHook()
  }

  /** もやが1段晴れる（メーター・もやパフ・明るさ） */
  private advancePurify(): void {
    const enc = this.encounter!
    const cell = this.meterCells[this.purifyStep - 1]
    if (cell) {
      cell.setAlpha(1)
      this.tweens.add({ targets: cell, scaleY: 1.7, duration: 150, yoyo: true })
      const glow = this.add.image(this.meterBox!.x - 150 + cell.x + 150, this.meterBox!.y, 'star')
        .setDepth(8001).setTint(0x9ff3ff).setScale(0.6)
      this.tweens.add({
        targets: glow, scale: 1.4, alpha: 0, duration: 450,
        onComplete: () => glow.destroy(),
      })
    }
    // もやパフが2つずつ晴れる
    const perStep = Math.ceil(this.mistPuffs.length / enc.purifySteps)
    const start = (this.purifyStep - 1) * perStep
    for (const puff of this.mistPuffs.slice(start, start + perStep)) {
      this.tweens.add({
        targets: puff, alpha: 0, scale: puff.scale * 1.5, duration: 600, ease: 'Sine.easeOut',
      })
    }
    // 敵が明るく・やわらかくなる
    if (this.monster) {
      const tints = [0xcfcfe0, 0xe2e2f0, 0xf3f3fa, 0xffffff]
      const tint = tints[Math.min(this.purifyStep, tints.length - 1)]
      this.monster.setTint(tint)
      this.tweens.add({
        targets: this.monster, scale: this.monster.scale * 1.06, duration: 180, yoyo: true, ease: 'Sine.easeOut',
      })
    }
  }

  /** 完全浄化 → ニコニコで空へ帰る → 前進再開 */
  private completePurify(): void {
    const m = this.monster
    if (!m) return
    voice.speak('じょうか、かんりょう！ ありがとう！')
    sfx.purify()
    this.time.delayedCall(500, () => sfx.fanfare())

    // 笑顔フレームへクロスフェード
    const happy = this.add.image(m.x, m.y, 'enemies', 1)
      .setDepth(4001).setScale(m.scale).setAlpha(0)
    this.tweens.add({ targets: happy, alpha: 1, duration: 450 })
    this.tweens.add({ targets: m, alpha: 0, duration: 450 })
    for (const puff of this.mistPuffs) {
      this.tweens.add({ targets: puff, alpha: 0, duration: 300 })
    }

    // キラキラ
    const sparkle = this.add.particles(0, 0, 'star', {
      speed: { min: 60, max: 220 }, scale: { start: 0.9, end: 0 },
      lifespan: 800, tint: [0xffe066, 0xffffff, 0xc7f0ff], emitting: false,
    }).setDepth(4100)
    sparkle.explode(22, m.x, m.y)
    this.time.delayedCall(1000, () => sparkle.destroy())

    // 空へ帰る
    this.tweens.add({
      targets: happy, y: m.y - 260, alpha: 0, scale: m.scale * 0.8,
      duration: 1200, delay: 900, ease: 'Sine.easeIn',
    })
    if (this.meterBox) {
      this.tweens.add({ targets: this.meterBox, alpha: 0, duration: 400, delay: 900 })
    }

    // 前進再開
    this.time.delayedCall(1900, () => {
      m.destroy()
      happy.destroy()
      this.mistPuffs.forEach(p => p.destroy())
      this.mistPuffs = []
      this.meterBox?.destroy()
      this.meterBox = null
      this.monster = null
      this.encounter = null
      this.setMissionText('すすめー！')
      voice.speak('すすめー！')
      this.startNextSegment()
      this.updateDebugHook()
    })
  }

  private resolveWrong(b: ChoiceBubble): void {
    sfx.wrong()
    this.combo = 0
    this.tweens.add({ targets: this.comboBadge, alpha: 0, duration: 250 })
    this.wrongThisStep++
    this.wrongTapStreak++
    this.wrongTotal++

    // ぷるぷる揺れるだけ。罰しない（浄化も進まない）
    this.tweens.add({ targets: b.container, angle: 10, duration: 60, yoyo: true, repeat: 3 })
    this.showGentleFeedback(b.container.x, b.container.y, `これは「${b.label}」だよ`)
    voice.speak(`これは、${b.label}、だよ`)

    // 知識の誤りなので統計に記録（撃ち逃しは記録しない）
    recordAnswer(this.currentTarget, this.currentKind, false)

    // 2回間違えたら: 正解バブルを大きく
    if (this.wrongThisStep === 2) {
      const correct = this.bubbles.find(x => x.alive && x.label === this.currentTarget)
      if (correct) {
        correct.baseScale *= 1.25
        correct.radius = 80 * correct.baseScale
        this.tweens.add({ targets: correct.container, scale: correct.baseScale, duration: 350, ease: 'Back.easeOut' })
      }
    }
    // 3回連続で間違えたら: 一度だけ正解を光らせる
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
    this.handL = this.add.container(150, GAME_H + 60, [left]).setDepth(7000)
    // ゆったり呼吸のスウェイ
    this.tweens.add({
      targets: this.handR, y: GAME_H + 30, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
    this.tweens.add({
      targets: this.handL, y: GAME_H + 66, duration: 1900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
    // 指先（ビーム発射点）: テクスチャ内 (52,34) → コンテナ原点(120,300)からのオフセット
    this.fingertip.x = this.handR.x + (52 - 120)
    this.fingertip.y = GAME_H + 24 - 300 + 34
    // 指先の常時グロー
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

    // 強めのオートエイム: タップ点の近くのバブルに吸い付く
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
      // 空撃ちは無罰。移動中の自由撃ちも楽しい
      this.fizzle(ix, iy)
      return
    }
    if (best.label === this.currentTarget) {
      this.resolveCorrect(best)
    } else {
      this.resolveWrong(best)
    }
  }

  /** 指先から奥へ向かう、先細りのビーム */
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
    // 手の反動（小さく）
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

  /** 着弾の juice（音・光・パーティクル・弱シェイク・ごく短いヒットストップ） */
  private hitJuiceAt(x: number, y: number, tint: number): void {
    sfx.pop()
    this.freezeUntil = this.time.now + 55
    this.tweens.timeScale = 0.05
    this.time.delayedCall(55, () => { this.tweens.timeScale = 1 })
    // 酔い防止のためシェイクは 2D 版より弱く
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
      rounds: this.stageData.rounds,
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
      w.__debugState = { phase: this.phase, purifyStep: this.purifyStep }
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

    // ゆるい上下バブ（対峙中はほぼ止める。酔い防止）
    const bobAmp = this.phase === 'riding' || this.phase === 'slowing' ? 3 : 0.8
    this.bobY = Math.sin(time * 0.0021) * bobAmp

    this.updateRig(dt)
    this.renderWorld(time)

    // 照準（なめらかに追従）
    this.reticle.x += (this.aim.x - this.reticle.x) * Math.min(1, dt * 14)
    this.reticle.y += (this.aim.y - this.reticle.y) * Math.min(1, dt * 14)

    // バブルはその場でふわふわ（スクリーン空間・拡縮なし＝常に読みやすい）
    for (const b of this.bubbles) {
      if (!b.alive) continue
      b.container.x = b.baseX + Math.sin(time * 0.0014 + b.bobPhase) * 7
      b.container.y = b.baseY + Math.sin(time * 0.0019 + b.bobPhase * 2) * 6
      b.container.rotation = Math.sin(time * 0.0013 + b.bobPhase) * 0.05
    }

    // 長く迷っていたら、やさしくヒント（対峙中のみ。時間切れは作らない）
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
