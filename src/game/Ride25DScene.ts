import Phaser from 'phaser'
import { EventBus } from '../EventBus'
import { sfx } from '../audio/sfx'
import { voice } from '../audio/voice'
import { assetUrl } from './assetManifest'
import { pickDistractors } from '../learning/distractors'
import { pickNextLetter, pickTargetLetter } from '../learning/picker'
import { recordAnswer, recordSeen, recordStageClear } from '../store/progress'
import type { DifficultyLevel, Stage, StageBattle, StageResult, TargetKind } from '../types'

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

/** 道の脇を流れていく光の粒（前進感を出すビルボード） */
interface SceneryItem {
  sprite: Phaser.GameObjects.Image
  worldX: number
  z0: number
  baseScale: number
  /** 地面からの浮遊高さ（ワールド単位） */
  floatY: number
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
  /**
   * 難易度 1〜3。
   *   1: 基本の識別（従来相当。似た文字は正答率>85%のときだけ）
   *   2: 似た文字を必ず混ぜる（letterStats の苦手ペア優先）＋プール広め
   *   3: 難易度2＋選択肢を1つ増やす＋テンポをわずかに上げる
   * 学習記録・オートエイム・撃ち逃し非記録などのルールは全難易度共通。
   */
  private level: DifficultyLevel
  private battle!: StageBattle

  // カメラリグ
  private progress = 0
  private speed = 0
  private targetSpeed = 0
  private cruiseSpeed = 175
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
  private bracelet = { x: 0, y: 0 } // ブレスレットの光（発射時に光らせる）
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

  constructor(stage: Stage, difficulty: DifficultyLevel = 1) {
    super('Game')
    this.stageData = stage
    this.level = difficulty
  }

  preload(): void {
    // 見た目素材は manifest 経由（public/assets/ 配下・丸ごと差し替え可能）
    this.load.image('img-bg', assetUrl('background'))
    this.load.image('img-bubble', assetUrl('bubble'))
    this.load.image('img-hand-l', assetUrl('leftHand'))
    this.load.image('img-hand-r', assetUrl('rightHand'))
    this.load.image('img-monster', assetUrl('monster'))
    this.load.image('img-boss', assetUrl('boss'))
  }

  create(): void {
    // battle 未定義の 2.5d ステージにも安全なデフォルトを与える
    const base = this.stageData.battle ?? {
      enemyCount: 3,
      purifyStepsPerEnemy: 1,
      bossPurifySteps: 3,
      choiceCount: 5,
      rideDistance: 480,
      letterPool: [this.stageData.correctAnswer ?? 'あ'],
      poolStart: 5,
    }
    // 難易度によるバトル定義の上書き（元データは変更しない）
    this.battle = {
      ...base,
      // Lv3: 選択肢を1つ増やす（最大6・アーチ配置は選択肢数に追従）
      choiceCount: this.level >= 3 ? Math.min(6, base.choiceCount + 1) : base.choiceCount,
      // Lv2以上: 出題プールを広めに開放（似た文字ペアに早く出会える）
      poolStart: this.level >= 2 ? Math.min(base.letterPool.length, base.poolStart + 3) : base.poolStart,
    }
    // Lv3: テンポをわずかに上げる（巡航速度 約15%アップ）
    if (this.level >= 3) this.cruiseSpeed = Math.round(this.cruiseSpeed * 1.15)

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
    // セリフは出題（文字の読み上げ）だけに絞る。移動中はミッションバーも出さない
    this.setMissionText('')
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
  }

  // ================================================================== world

  private buildSky(): void {
    // 描き込み背景（もじシティ夜景）。少し大きめに敷いて、進行に合わせた
    // 横スライド＋上下バウンドのパララックスの余白を確保する
    this.bgImage = this.add.image(GAME_W / 2, GAME_H / 2 - 20, 'img-bg').setDepth(0)
    const scale = Math.max(GAME_W / this.bgImage.width, GAME_H / this.bgImage.height) * 1.09
    this.bgImage.setScale(scale)
    this.bgBaseY = this.bgImage.y
  }

  private totalRouteDistance(): number {
    return this.battle.rideDistance * (this.battle.enemyCount + 2.5)
  }

  private buildScenery(): void {
    // 街や木は描き込み背景に任せ、コード側は「道の脇を流れる光の粒」だけを
    // 飛ばして前進スピード感を出す（加算合成のやわらかい光・お祭りの夜の雰囲気）
    const totalDistance = this.totalRouteDistance()
    const tints = [0x59e0f2, 0xff8fd0, 0xffe066, 0xc7f0ff]
    let i = 0
    for (let z0 = 160; z0 < totalDistance + 2000; z0 += 95, i++) {
      const side = i % 2 === 0 ? -1 : 1
      const worldX = side * (210 + ((i * 97) % 270))
      const baseScale = 0.14 + ((i * 31) % 20) / 100
      const floatY = 30 + ((i * 53) % 150)
      const sprite = this.add.image(0, 0, 'softglow')
        .setVisible(false)
        .setTint(tints[i % tints.length])
        .setBlendMode(Phaser.BlendModes.ADD)
      this.scenery.push({ sprite, worldX, z0, baseScale, floatY })
    }
  }

  private renderWorld(time: number): void {
    const yOff = this.bobY + this.lookUpY
    // 背景パララックス: バウンドに追従しつつ、進行距離に応じてゆっくり横に流す
    this.bgImage.y = this.bgBaseY + yOff * 0.55
    this.bgImage.x = GAME_W / 2 + Math.sin(this.progress * 0.0042) * 11

    // 地面は描き込み背景に任せ、コードは「光のレール」（グリッド線＋
    // シアン/ピンク交互の光る石が手前へ流れてくる）だけを重ねる
    const g = this.groundG
    g.clear()
    const spacing = 130
    for (let k = 0; k < 16; k++) {
      const z = k * spacing - (this.progress % spacing)
      if (z < -60) continue
      const p = project(0, z)
      const alpha = Math.min(0.22, 0.04 + p.s * 0.2)
      g.lineStyle(Math.max(1.5, 3 * p.s), 0x9b8ce0, alpha)
      g.lineBetween(VP.x - 900 * p.s, p.y + yOff, VP.x + 900 * p.s, p.y + yOff)
      const worldIndex = k + Math.floor(this.progress / spacing)
      for (const side of [-1, 1] as const) {
        const q = project(side * 168, z)
        const color = (worldIndex + (side === 1 ? 1 : 0)) % 2 === 0 ? 0x59e0f2 : 0xff8fd0
        g.fillStyle(color, Math.min(0.6, 0.12 + p.s * 0.5))
        g.fillCircle(q.x, q.y + yOff, Math.max(2, 5.5 * p.s))
        g.fillStyle(color, 0.15)
        g.fillCircle(q.x, q.y + yOff, Math.max(4, 12 * p.s))
      }
    }

    // 道の脇を流れる光の粒（ふわっと明滅しながら手前へ）
    for (const item of this.scenery) {
      const z = item.z0 - this.progress
      if (z < 20 || z > 1500) {
        item.sprite.setVisible(false)
        continue
      }
      const p = project(item.worldX, z)
      const twinkle = 0.72 + 0.28 * Math.sin(time * 0.004 + item.z0)
      item.sprite
        .setVisible(true)
        .setPosition(p.x, p.y - item.floatY * p.s + yOff)
        .setScale(p.s * item.baseScale)
        .setDepth(60 + Math.round(1500 - z))
        .setAlpha(Math.min(0.85, (1500 - z) / 300) * twinkle)
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

  /** モンスター画像の対峙時スケール（画像サイズに依存しないよう表示高さから逆算） */
  private monsterScale(isBoss: boolean): number {
    const tex = this.textures.get(isBoss ? 'img-boss' : 'img-monster').getSourceImage()
    return (isBoss ? 430 : 305) / tex.height
  }

  /** 次の敵を前方に出す（近づいてくるのが見える） */
  private spawnApproaching(isBoss: boolean): void {
    // もやに取り憑かれている間はくすんだ色（浄化で本来の色に戻る）
    const sprite = this.add.image(0, 0, isBoss ? 'img-boss' : 'img-monster')
      .setOrigin(0.5, 0.5).setDepth(3500).setVisible(false).setTint(0xb8b8cc)
    // 対峙位置（z≈90）でちょうど対峙サイズになる逆算スケール
    const meetScale = this.monsterScale(isBoss)
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
    // 対峙中も世界はゆっくり前へ流れ続ける（没入感。文字はスクリーン空間なので読みやすさに影響なし）
    if (this.phase === 'encounter') {
      this.progress += 12 * dt
      return
    }
    if (this.phase !== 'riding' && this.phase !== 'slowing') return
    const remain = this.nextEventAt - this.progress
    // 敵間距離が短いステージでも「進んでから減速」が成立するよう、減速開始は距離に比例
    const slowDist = Math.min(120, this.battle.rideDistance * 0.5)
    if (remain < slowDist && this.phase === 'riding' && this.pending !== 'goal') {
      this.phase = 'slowing'
      this.targetSpeed = 24
    }
    this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * 3)
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

    // 近づいてきたビルボードを対峙位置へなめらかに引き継ぐ（参考画像に合わせて大きめ）
    const targetScale = this.monsterScale(isBoss)
    const targetY = isBoss ? 218 : 235
    let m: Phaser.GameObjects.Image
    if (this.approach) {
      m = this.approach.sprite
      this.approach = null
      m.setDepth(4000)
    } else {
      m = this.add.image(GAME_W / 2, 330, isBoss ? 'img-boss' : 'img-monster')
        .setDepth(4000).setScale(0.1).setTint(0xb8b8cc)
    }
    this.monster = m
    this.tweens.add({
      targets: m, x: GAME_W / 2, y: targetY, scale: targetScale,
      duration: 420, ease: 'Sine.easeOut',
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

    // すぐに出題（待たせない）
    this.time.delayedCall(isBoss ? 900 : 180, () => this.startPurifyStep())
  }

  private buildPurifyMeter(steps: number): void {
    const width = 300
    const bg = this.add.graphics()
    bg.fillStyle(0x241a4a, 0.85)
    bg.fillRoundedRect(-width / 2 - 8, -17, width + 16, 34, 17)
    bg.lineStyle(3, 0xffd94d, 1)
    bg.strokeRoundedRect(-width / 2 - 8, -17, width + 16, 34, 17)
    this.meterCells = []
    const cellW = (width - (steps + 1) * 6) / steps
    const items: Phaser.GameObjects.GameObject[] = [bg]
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

    // 難易度調整: 正答率70〜85%帯を狙う（全難易度共通のセーフティ）
    const attempts = this.sessionCorrect + this.wrongTotal
    const accuracy = attempts > 0 ? this.sessionCorrect / attempts : 1
    let choiceCount = this.battle.choiceCount
    if (attempts >= 3 && accuracy < 0.7) choiceCount = Math.max(3, choiceCount - 1)
    // Lv2以上は似た文字を常に混ぜる。Lv1は従来どおり正答率が高いときだけ
    const useConfusables = this.level >= 2 || (attempts >= 3 && accuracy > 0.85)

    // 「今回狙う文字」は音だけで伝える（文字を見せると答えが分かってしまう）
    this.announceTarget(this.currentTarget)

    const distractors = pickDistractors(this.currentTarget, choiceCount - 1, {
      kind: this.currentKind,
      useConfusables,
      preferWeakPairs: this.level >= 2, // 苦手なペアを優先（固定羅列にしない）
    })
    const labels = Phaser.Utils.Array.Shuffle([this.currentTarget, ...distractors])
    // 敵を囲むアーチ配置（選択肢数に応じて等間隔に生成。5個なら従来とほぼ同じ）
    const n = labels.length
    const arc: Array<[number, number]> = labels.map((_, i) => {
      const u = n <= 1 ? 0 : (i / (n - 1)) * 2 - 1 // -1〜1
      return [u * 350, 350 - u * u * 105]
    })
    // 単調にならないよう、たまに左右反転
    const positions = (this.enemyIndex + this.purifyStep) % 2 === 1
      ? arc.map(([x, y]) => [-x, y] as [number, number])
      : arc

    this.time.delayedCall(this.level >= 3 ? 340 : 420, () => {
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

  /**
   * 狙う文字のアナウンス。
   * 音だけで「め」と言う（文字を画面に出すと、聞かなくても答えが分かってしまうため）。
   * TTS が使えない環境だけ、フォールバックとして文字を表示する。
   */
  private announceTarget(label: string): void {
    const spoke = voice.speak(`${label}！`, { rate: 0.7 })
    if (spoke && voice.available()) {
      this.setMissionText('おとを きいて ねらおう！')
      // 🔊 がふわっと光るだけ（答えは見せない）
      const glow = this.add.image(GAME_W / 2, 300, 'softglow')
        .setDepth(8390).setScale(1.3).setAlpha(0.7).setTint(0xfff2c0)
      const icon = this.add.text(GAME_W / 2, 300, '🔊', { fontSize: '90px' })
        .setOrigin(0.5).setDepth(8400).setScale(0)
      this.tweens.add({ targets: icon, scale: 1, duration: 220, ease: 'Back.easeOut' })
      this.tweens.add({ targets: icon, scale: 1.12, duration: 260, delay: 240, yoyo: true })
      this.tweens.add({
        targets: [icon, glow], alpha: 0, duration: 260, delay: 800,
        ease: 'Cubic.easeIn',
        onComplete: () => { icon.destroy(); glow.destroy() },
      })
      return
    }
    // フォールバック: 音が出ない環境では文字で伝える（従来表示）
    this.setMissionText(`「${label}」を ねらって！`)
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
    if (this.currentTarget) voice.speak(`${this.currentTarget}！`, { rate: 0.7 })
  }

  private createChoiceBubble(label: string, kind: TargetKind, x: number, y: number, index: number): void {
    // シャボン玉画像は「空のオーブ」。中が透けるので、文字の下に
    // パステルの半透明下敷き円をコードで描いて可読性を担保する
    const colorIndex = Phaser.Math.Between(0, BUBBLE_COLORS.length - 1)
    const tex = this.textures.get('img-bubble').getSourceImage()
    const imgScale = 160 / Math.max(tex.width, tex.height) // 直径160px 基準（radius 計算と一致）
    const backing = this.add.circle(0, 0, 66, BUBBLE_COLORS[colorIndex], 0.82)
    const bubble = this.add.image(0, 0, 'img-bubble').setScale(imgScale)
    const letter = this.add.text(0, 0, label, {
      fontFamily: FONT, fontSize: '62px', fontStyle: 'bold', color: '#33336b',
    }).setOrigin(0.5).setStroke('#ffffff', 8)
    // 文字バブルは常に不透明・最前面（敵と重なってもくっきり）
    const container = this.add.container(x, y, [backing, bubble, letter]).setDepth(6000)
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

    // Lv3 はテンポをわずかに上げる
    if (this.purifyStep >= this.purifyStepsNeeded) {
      this.time.delayedCall(this.level >= 3 ? 600 : 700, () => this.completePurify())
    } else {
      this.time.delayedCall(this.level >= 3 ? 850 : 1000, () => this.startPurifyStep())
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
    sfx.purify()
    if (isBoss) this.time.delayedCall(400, () => sfx.fanfare())

    // 浄化完了: くすみが取れて本来の色に戻り、明るい光に包まれ、
    // にっこり目のオーバーレイで「笑顔になった」ことを見せる（画像非依存の汎用演出）
    m.clearTint()
    const glow = this.add.image(m.x, m.y, 'softglow')
      .setDepth(3999).setScale((m.displayWidth / 256) * 2.1).setTint(0xfff2c0).setAlpha(0)
    this.tweens.add({ targets: glow, alpha: 0.9, duration: 350 })
    const happy = this.makeHappyOverlay(m)
    this.tweens.add({ targets: happy, alpha: 1, duration: 350 })
    for (const puff of this.mistPuffs) {
      this.tweens.add({ targets: puff, alpha: 0, duration: 250 })
    }
    const sparkle = this.add.particles(0, 0, 'star', {
      speed: { min: 60, max: isBoss ? 260 : 200 }, scale: { start: 0.9, end: 0 },
      lifespan: 800, tint: [0xffe066, 0xffffff, 0xc7f0ff], emitting: false,
    }).setDepth(4100)
    sparkle.explode(isBoss ? 30 : 16, m.x, m.y)
    this.time.delayedCall(1000, () => sparkle.destroy())

    const riseDelay = isBoss ? 800 : 350
    // 笑顔になったモンスターが光ごとふわっと空へ帰っていく
    this.tweens.add({
      targets: [m, happy, glow], y: `-=240`, alpha: 0,
      duration: 800, delay: riseDelay, ease: 'Sine.easeIn',
    })
    // オーバーレイは表示ピクセル座標で描いているためスケール基準が異なる
    this.tweens.add({ targets: m, scale: m.scale * 0.8, duration: 800, delay: riseDelay, ease: 'Sine.easeIn' })
    this.tweens.add({ targets: happy, scale: 0.8, duration: 800, delay: riseDelay, ease: 'Sine.easeIn' })
    if (this.meterBox) {
      this.tweens.add({ targets: this.meterBox, alpha: 0, duration: 300, delay: riseDelay })
    }

    // この対峙のオブジェクトをローカルに引き取り、フィールドは即リセット
    // （演出中に次の対峙が始まっても競合しない）
    const puffs = this.mistPuffs
    const meterBox = this.meterBox
    this.mistPuffs = []
    this.meterBox = null
    this.meterCells = []
    this.monster = null

    // 演出の途中で前進を再開する（笑顔が空へ帰るのを見ながら次へ＝待ち時間ゼロ）
    this.time.delayedCall(isBoss ? 1800 : 550, () => this.afterPurify(isBoss))
    this.time.delayedCall(isBoss ? 1900 : 1300, () => {
      m.destroy()
      happy.destroy()
      glow.destroy()
      puffs.forEach(p => p.destroy())
      meterBox?.destroy()
    })
  }

  /**
   * 「にっこり目＋ほっぺ」のオーバーレイ。
   * モンスター画像そのものは変えられないため、浄化完了の「笑顔」を
   * 画像非依存のステッカー的な描画で重ねる（本番イラスト差し替え後も機能する）。
   */
  private makeHappyOverlay(m: Phaser.GameObjects.Image): Phaser.GameObjects.Container {
    const w = m.displayWidth
    const g = this.add.graphics()
    // 閉じたにっこり目（∩）。元画像の目のあたりに重ねる
    for (const exr of [-0.10, 0.045]) {
      const ex = exr * w
      const ey = -0.05 * w
      g.fillStyle(0xe9f8d0, 1)
      g.fillEllipse(ex, ey, 0.125 * w, 0.105 * w)
      g.lineStyle(Math.max(4, 0.018 * w), 0x39511f, 1)
      g.beginPath()
      g.arc(ex, ey + 0.014 * w, 0.042 * w, Math.PI * 1.12, Math.PI * 1.88)
      g.strokePath()
    }
    // ほっぺ
    g.fillStyle(0xffb3c7, 0.55)
    g.fillEllipse(-0.165 * w, 0.015 * w, 0.075 * w, 0.05 * w)
    g.fillEllipse(0.11 * w, 0.015 * w, 0.075 * w, 0.05 * w)
    return this.add.container(m.x, m.y, [g]).setDepth(4001).setAlpha(0)
  }

  /** 浄化後の進行: 次の敵 → （規定体数で）ボス → ゴール */
  private afterPurify(wasBoss: boolean): void {
    if (wasBoss) {
      this.fillCounterCrown()
      this.pending = 'goal'
      this.nextEventAt = this.progress + this.battle.rideDistance * 0.9
      this.setMissionText('')
    } else {
      this.fillCounterDot(this.enemyIndex)
      this.enemyIndex++
      if (this.enemyIndex >= this.battle.enemyCount) {
        // ボス予兆: ゆっくり見上げる＋低い気配（効果音のみ）
        this.pending = 'boss'
        this.nextEventAt = this.progress + this.battle.rideDistance * 1.3
        this.spawnApproaching(true)
        this.setMissionText('')
        sfx.omen()
        this.tweens.add({ targets: this, lookUpY: 26, duration: 1400, ease: 'Sine.easeInOut' })
      } else {
        this.pending = 'enemy'
        this.nextEventAt = this.progress + this.battle.rideDistance
        this.spawnApproaching(false)
        this.setMissionText('')
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
    // 狙う音をもう一度（音だけの出題なので忘れさせない）
    this.time.delayedCall(1600, () => {
      if (this.stepActive) voice.speak(`${this.currentTarget}！`, { rate: 0.7 })
    })

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
      // 正解のオーブだけ金色のキラキラをまとわせる
      const twinkle = this.add.particles(0, 0, 'star', {
        speed: { min: 20, max: 80 }, scale: { start: 0.55, end: 0 }, lifespan: 550,
        tint: [0xffe066, 0xffd94d, 0xfff6c8], blendMode: 'ADD', emitting: false,
      }).setDepth(5991)
      twinkle.explode(6, correct.container.x, correct.container.y)
      this.time.delayedCall(700, () => twinkle.destroy())
      this.tweens.add({
        targets: ring, scale: 2.8, alpha: 0, duration: 500, ease: 'Cubic.easeOut',
        onComplete: pulse,
      })
    }
    pulse()
  }

  // ============================================================= 手・ビーム

  private buildHands(): void {
    // 用意した手のスプライト（右=発射ポーズ・左=ひらいた待機）。
    // 文字バブル(6000)より下の深度に置き、文字を絶対に隠さない
    const rTex = this.textures.get('img-hand-r').getSourceImage()
    const rScale = 465 / rTex.height
    const right = this.add.image(0, 0, 'img-hand-r').setOrigin(0.5, 1).setScale(rScale)
    const handRBaseY = GAME_H + 30
    this.handR = this.add.container(GAME_W - 168, handRBaseY, [right]).setDepth(5800)
    const lTex = this.textures.get('img-hand-l').getSourceImage()
    const left = this.add.image(0, 0, 'img-hand-l').setOrigin(0.5, 1).setScale(335 / lTex.height)
    const handL = this.add.container(140, GAME_H + 46, [left]).setDepth(5800)
    this.tweens.add({
      targets: this.handR, y: handRBaseY + 6, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
    this.tweens.add({
      targets: handL, y: GAME_H + 52, duration: 1900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
    // 指先（ビーム発射点）とブレスレット位置: righthand.png 内の比率で算出
    // （画像を差し替えたらここの比率だけ合わせる）
    const rw = rTex.width * rScale
    const rh = rTex.height * rScale
    this.fingertip.x = this.handR.x + (0.472 - 0.5) * rw
    this.fingertip.y = handRBaseY + (0.30 - 1) * rh
    this.bracelet.x = this.handR.x + (0.54 - 0.5) * rw
    this.bracelet.y = handRBaseY + (0.635 - 1) * rh
    // 指先はブレスレットの光と同じシアンでほんのり明滅
    const glow = this.add.image(this.fingertip.x, this.fingertip.y, 'softglow')
      .setDepth(5801).setScale(0.22).setTint(0x7fe8ff).setAlpha(0.45)
      .setBlendMode(Phaser.BlendModes.ADD)
    this.tweens.add({
      targets: glow, scale: 0.32, alpha: 0.7, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
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

  /**
   * ブレスレットの光と同じシアン系のビーム:
   * 白熱した芯＋外側グロー（加算合成）＋ライン上のキラキラ粒子＋着弾フレア
   */
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

    const g = this.add.graphics().setDepth(7500).setBlendMode(Phaser.BlendModes.ADD)
    const poly = (w1: number, w2: number, color: number, alpha: number) => {
      g.fillStyle(color, alpha)
      g.fillPoints([
        new Phaser.Math.Vector2(fx + px * w1, fy + py * w1),
        new Phaser.Math.Vector2(tx + px * w2, ty + py * w2),
        new Phaser.Math.Vector2(tx - px * w2, ty - py * w2),
        new Phaser.Math.Vector2(fx - px * w1, fy - py * w1),
      ], true)
    }
    poly(wide * 2.2, tip * 2.6, 0x59e0f2, 0.4) // 外側グロー
    poly(wide, tip * 1.5, 0x9ff3ff, 0.75)
    poly(wide * 0.45, tip, 0xffffff, 1) // 白熱した芯
    // 着弾フレア
    g.fillStyle(0xffffff, 0.95)
    g.fillCircle(tx, ty, 13)
    g.fillStyle(0x7fe8ff, 0.55)
    g.fillCircle(tx, ty, 27)
    this.tweens.add({ targets: g, alpha: 0, duration: 110, onComplete: () => g.destroy() })

    // ライン上を舞うキラキラ粒子
    const sparks = this.add.particles(0, 0, 'dot', {
      speed: { min: 10, max: 70 }, scale: { start: 0.5, end: 0 }, lifespan: 280,
      tint: [0xffffff, 0x9ff3ff, 0x59e0f2], blendMode: 'ADD', emitting: false,
      emitZone: { type: 'random', source: new Phaser.Geom.Line(fx, fy, tx, ty), quantity: 12 },
    }).setDepth(7501)
    sparks.explode(12)
    this.time.delayedCall(400, () => sparks.destroy())

    // 指先のマズルフラッシュ＋ブレスレットの発光
    const muzzle = this.add.image(fx, fy, 'star').setDepth(7501).setTint(0x9ff3ff).setScale(0.9)
      .setBlendMode(Phaser.BlendModes.ADD)
    this.tweens.add({
      targets: muzzle, scale: 0.2, alpha: 0, angle: 90, duration: 140,
      onComplete: () => muzzle.destroy(),
    })
    const braceletFlash = this.add.image(this.bracelet.x, this.bracelet.y, 'softglow')
      .setDepth(7502).setTint(0x7fe8ff).setScale(0.3).setAlpha(0.9)
      .setBlendMode(Phaser.BlendModes.ADD)
    this.tweens.add({
      targets: braceletFlash, scale: 0.75, alpha: 0, duration: 220,
      onComplete: () => braceletFlash.destroy(),
    })
    // 腕を軽く前へ押し出す（y は常時バウンド tween が使っているため x で表現）
    this.tweens.add({ targets: this.handR, x: GAME_W - 186, duration: 55, yoyo: true })
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
    // 出題インストラクション以外は表示しない（空文字でバーごと隠す）
    this.tweens.add({ targets: this.missionBar, alpha: text ? 1 : 0, duration: 200 })
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
    recordStageClear(this.stageData.id, stars, this.level)
    const result: StageResult = {
      stageId: this.stageData.id,
      difficulty: this.level,
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
