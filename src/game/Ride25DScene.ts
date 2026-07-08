import Phaser from 'phaser'
import { EventBus } from '../EventBus'
import { sfx } from '../audio/sfx'
import { voice } from '../audio/voice'
import { assetUrl } from './assetManifest'
import { MONSTER_FILES } from './monsterManifest'
import { MONSTER_TABLE } from '../data/monsters'
import { wordsForLevel } from '../data/words'
import type { WordSpec } from '../data/words'
import { ABC_CONFUSABLES, abcLetters, MEANING_WORDS, meaningDistractors, SPELL_WORDS } from '../data/english'
import type { MeaningSpec, SpellSpec } from '../data/english'
import { BALLS, PITY_FAILS, rollBall } from '../data/balls'
import type { BallSpec } from '../data/balls'
import { monsterName } from '../data/monsterNames'
import { pickDistractors } from '../learning/distractors'
import { pickNextLetter, pickTargetLetter } from '../learning/picker'
import {
  captureFailCount, isCaptured, loadProgress,
  recordAnswer, recordCaptureFail, recordCaptureSuccess, recordSeen, recordStageClear,
} from '../store/progress'
import type { DifficultyLevel, MathLevelSpec, MathProblem, Stage, StageBattle, StageResult, TargetKind } from '../types'

export const GAME_W = 960
export const GAME_H = 640

const FONT = '"Hiragino Maru Gothic ProN", "BIZ UDPGothic", "Yu Gothic UI", "Meiryo", sans-serif'
const BUBBLE_COLORS = [0xffc2d4, 0xaddcff, 0xfff2ad, 0xc9f2b8, 0xe3ccff]
/** 数字の読み（さんすうバトルの読み上げ用） */
const DIGIT_READING: Record<string, string> = {
  '1': 'いち', '2': 'に', '3': 'さん', '4': 'よん', '5': 'ご',
  '6': 'ろく', '7': 'なな', '8': 'はち', '9': 'きゅう', '10': 'じゅう',
}
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

  // 一人称の両手・照準（ビームは左右の指先から1点に収束する）
  private handR!: Phaser.GameObjects.Container
  private handL!: Phaser.GameObjects.Container
  private fingertipR = { x: 0, y: 0 }
  private fingertipL = { x: 0, y: 0 }
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
  /** 直近の出題（同じ文字の張り付き防止。learningConfig.recentWindow 分使う） */
  private recentTargets: string[] = []
  private currentKind: TargetKind = 'hiragana'

  // モード別の出題状態（⑭ 共通エンジン化: 差分は「出題内容」だけ）
  /** sequence: 今の単語（words.ts のプールから敵ごとに選ぶ） */
  private currentSeq: string[] = []
  private currentWord = ''
  private currentCelebration = '⭐'
  private wordQueue: WordSpec[] = []
  /** math: 現在の問題（mathLevels からランダム生成） */
  private currentProblem: MathProblem | null = null
  /** english: 今読み上げる英語トークン（アルファベット/単語）。統計キー・聞き直しにも使う */
  private currentEnWord = ''
  /** math: 直前に出した式（同じ式の連続を避ける） */
  private lastMathQuestion = ''

  // モンスターの抽選（グループ・浄化回数は data/monsters.ts のテーブルで決まる）
  private monsterKeys: { weak: string[]; strong: string[]; boss: string[] } = { weak: [], strong: [], boss: [] }
  private lastMonsterKey = ''
  /** 直前に出したボス（同じボスの連続出現を避けるため） */
  private lastBossKey = ''
  private approachGroup: 'weak' | 'strong' = 'weak'
  /** いま対峙しているボスのモンスターID（なかまボールの対象） */
  private bossMonsterId = ''
  /** なかまボール演出の進行状態（idle 以外は捕獲フロー中） */
  private captureState: 'idle' | 'roulette' | 'await-throw' | 'throwing' | 'shaking' | 'result' = 'idle'
  private bubbles: ChoiceBubble[] = []
  private monster: Phaser.GameObjects.Image | null = null
  private mistPuffs: Phaser.GameObjects.Image[] = []
  private meterCells: Phaser.GameObjects.Rectangle[] = []
  private meterBox: Phaser.GameObjects.Container | null = null
  private stepStartAt = 0
  private stepActive = false

  // ライフ制: 誤答（別の文字を撃った）でのみ1減。撃ち逃しでは減らない
  private lives = 3
  private heartIcons: Phaser.GameObjects.Text[] = []
  private failed = false

  // UI・統計
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
    this.load.image('img-monster', assetUrl('monster')) // マニフェストが空のときのフォールバック

    // モンスターはグループごとに毎プレイ数枚だけ抽選して読み込む
    // （全画像を読むと重い。プレイのたびに顔ぶれが変わる）
    const sample = (files: string[], n: number) =>
      Phaser.Utils.Array.Shuffle([...files]).slice(0, Math.max(0, n))
    const load = (files: string[]) => files.map(f => {
      const key = `mon-${f.replace(/\.[a-z]+$/i, '')}`
      this.load.image(key, `${import.meta.env.BASE_URL}assets/monsters/${f}`)
      return key
    })
    // ㉖ つよいの抽選は「未捕獲を優先」。今回読み込む顔ぶれ自体も未捕獲寄りに選び、
    //    まだ捕まえていないボスが実際に登場しやすくする（捕獲済みも低い重みで残す）
    const capturedSet = new Set(loadProgress().capturedMonsters)
    const strongWeight = (f: string) =>
      capturedSet.has(f.replace(/\.png$/, '')) ? 0.35 : 1
    this.monsterKeys.weak = load(sample(MONSTER_FILES.weak, MONSTER_TABLE.sampleSize.weak))
    this.monsterKeys.strong = load(
      this.weightedSample(MONSTER_FILES.strong, MONSTER_TABLE.sampleSize.strong, strongWeight),
    )
    this.monsterKeys.boss = load(sample(MONSTER_FILES.boss, 1))

    // なかまボール（ボス浄化後の捕獲演出用）
    for (const b of BALLS) {
      this.load.image(`ball-${b.id}`, `${import.meta.env.BASE_URL}assets/balls/${b.file}`)
    }
  }

  /** 出現テーブル（data/monsters.ts）に従ってモンスターを1体選ぶ */
  private pickMonster(isBoss: boolean): { key: string; group: 'weak' | 'strong' } {
    if (isBoss) {
      // ボスはつよいグループから（専用画像があればそちらを優先）
      const pool = this.monsterKeys.boss.length ? this.monsterKeys.boss
        : this.monsterKeys.strong.length ? this.monsterKeys.strong : this.monsterKeys.weak
      if (pool.length === 0) return { key: 'img-monster', group: 'weak' }
      const key = this.pickWeightedBoss(pool)
      this.lastMonsterKey = key
      this.lastBossKey = key
      // ボスは「なかまボール」の対象になるためモンスターIDを控える
      this.bossMonsterId = key.startsWith('mon-') ? key.slice(4) : 'monster1'
      return { key, group: 'strong' }
    }
    const w = MONSTER_TABLE.weights[this.level]
    const total = w.weak + w.strong
    let group: 'weak' | 'strong' = total > 0 && Math.random() < w.strong / total ? 'strong' : 'weak'
    let pool = this.monsterKeys[group]
    if (pool.length === 0) {
      group = group === 'strong' ? 'weak' : 'strong'
      pool = this.monsterKeys[group]
    }
    if (pool.length === 0) return { key: 'img-monster', group: 'weak' }
    // 同じ敵ばかりにならないよう、直前と同じ画像は避ける
    const candidates = pool.length > 1 ? pool.filter(k => k !== this.lastMonsterKey) : pool
    const key = candidates[Phaser.Math.Between(0, candidates.length - 1)]
    this.lastMonsterKey = key
    return { key, group }
  }

  /**
   * ㉖ ボスを重み付き抽選する。未捕獲＝高い重み / 捕獲済み＝低い重み（data/monsters.ts）。
   * 直前に出したボスはさらに出にくくする。全員captured済みなら全員同じ重み＝通常抽選になる。
   */
  private pickWeightedBoss(pool: string[]): string {
    if (pool.length === 1) return pool[0]
    const progress = loadProgress()
    const W = MONSTER_TABLE.bossWeights
    const weightOf = (key: string) => {
      const id = key.startsWith('mon-') ? key.slice(4) : key
      let w = isCaptured(progress, id) ? W.captured : W.uncaptured
      if (key === this.lastBossKey) w *= 0.15 // 連続回避
      return Math.max(w, 0.0001)
    }
    const total = pool.reduce((s, k) => s + weightOf(k), 0)
    let r = Math.random() * total
    for (const k of pool) {
      r -= weightOf(k)
      if (r <= 0) return k
    }
    return pool[pool.length - 1]
  }

  /** 重み付きの非復元抽選で n 個選ぶ（重みが高いものほど選ばれやすい） */
  private weightedSample(files: string[], n: number, weightOf: (f: string) => number): string[] {
    const pool = [...files]
    const out: string[] = []
    const count = Math.min(n, pool.length)
    for (let i = 0; i < count; i++) {
      const total = pool.reduce((s, f) => s + Math.max(weightOf(f), 0.0001), 0)
      let r = Math.random() * total
      let idx = pool.length - 1
      for (let j = 0; j < pool.length; j++) {
        r -= Math.max(weightOf(pool[j]), 0.0001)
        if (r <= 0) { idx = j; break }
      }
      out.push(pool[idx])
      pool.splice(idx, 1)
    }
    return out
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
    this.buildHearts()

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
  private monsterScaleFor(key: string, isBoss: boolean): number {
    const tex = this.textures.get(key).getSourceImage()
    return (isBoss ? 430 : 305) / tex.height
  }

  /** 次の敵を前方に出す（近づいてくるのが見える） */
  private spawnApproaching(isBoss: boolean): void {
    const { key, group } = this.pickMonster(isBoss)
    this.approachGroup = group
    // もやに取り憑かれている間はくすんだ色（浄化で本来の色に戻る）
    const sprite = this.add.image(0, 0, key)
      .setOrigin(0.5, 0.5).setDepth(3500).setVisible(false).setTint(0xb8b8cc)
    // 対峙位置（z≈90）でちょうど対峙サイズになる逆算スケール
    const meetScale = this.monsterScaleFor(key, isBoss)
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

    // 近づいてきたビルボードを対峙位置へなめらかに引き継ぐ（参考画像に合わせて大きめ）
    const targetY = isBoss ? 218 : 235
    let m: Phaser.GameObjects.Image
    if (this.approach) {
      m = this.approach.sprite
      this.approach = null
      m.setDepth(4000)
    } else {
      const { key, group } = this.pickMonster(isBoss)
      this.approachGroup = group
      m = this.add.image(GAME_W / 2, 330, key)
        .setDepth(4000).setScale(0.1).setTint(0xb8b8cc)
    }
    const targetScale = this.monsterScaleFor(m.texture.key, isBoss)

    // 浄化に必要な正解数（モード別。数値は data/monsters.ts・words.ts のデータで決まる）
    if (this.stageData.mode === 'sequence') {
      // 単語モード: 敵1体＝単語1つ。文字数がそのままステップ数（メーターのマス＝文字）
      this.setupNextWord()
      this.purifyStepsNeeded = this.currentSeq.length
    } else if (isBoss) {
      this.purifyStepsNeeded = this.battle.bossPurifySteps
    } else {
      const [min, max] = MONSTER_TABLE.purifySteps[this.approachGroup]
      this.purifyStepsNeeded = Phaser.Math.Between(min, max)
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

    // 黒いもやのパフは廃止（モンスターが隠れて見えないため）。
    // 「もやに取り憑かれている」表現は、くすんだ色（tint）→浄化で本来の色に戻る、で行う
    this.mistPuffs = []

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
    // モンスターに重ならないよう、画面下（両手の間）に置く
    this.meterBox = this.add.container(GAME_W / 2, 612, items).setDepth(8000).setScale(0)
    this.tweens.add({ targets: this.meterBox, scale: 1, duration: 320, delay: 400, ease: 'Back.easeOut' })
  }

  /** 単語モード: 次の単語をプールから選ぶ（難易度=文字数。words.ts のデータで決まる） */
  private setupNextWord(): void {
    if (this.wordQueue.length === 0) {
      const pool = wordsForLevel(this.level)
      this.wordQueue = Phaser.Utils.Array.Shuffle(
        pool.length > 0
          ? [...pool]
          : [{ word: this.stageData.word ?? 'ねこ', celebration: this.stageData.celebration ?? '⭐' }],
      )
    }
    const spec = this.wordQueue.shift()!
    this.currentWord = spec.word
    this.currentSeq = [...spec.word]
    this.currentCelebration = spec.celebration
  }

  /** 1問分の出題。差分は「出題内容」だけで、画面・進行は全モード共通 */
  private startPurifyStep(): void {
    this.stepActive = false
    this.wrongThisStep = 0
    this.hintReplayDone = false
    this.hintGlowDone = false
    this.currentKind = this.stageData.correctKind

    if (this.stageData.type === 'english') {
      this.startEnglishStep()
      return
    }
    if (this.stageData.mode === 'sequence') {
      this.startSequenceStep()
      return
    }
    if (this.stageData.mode === 'math') {
      this.startMathStep()
      return
    }
    this.startFindStep()
  }

  /** find モード: 音声のみで狙う文字を伝える（従来のひらがな/カタカナこうえん） */
  private startFindStep(): void {
    // 出題文字: ボスは直近で練習した文字、ザコは開放済みプールから
    // （復習比率・直近回避・まんべんなく露出は learningConfig で調整）
    if (this.bossActive && this.practiced.length > 0) {
      const pool = [...new Set(this.practiced)]
      // ボスの復習も直近に出した文字は避け、同じ文字への張り付きを防ぐ
      const recentSet = new Set(this.recentTargets.slice(-3))
      let candidates = pool.filter(l => !recentSet.has(l))
      if (candidates.length === 0) {
        const last = this.recentTargets[this.recentTargets.length - 1]
        candidates = pool.length > 1 ? pool.filter(l => l !== last) : pool
      }
      this.currentTarget = pickNextLetter(candidates, this.currentKind)
    } else {
      this.currentTarget = pickTargetLetter(
        this.battle.letterPool, this.battle.poolStart, this.currentKind, this.recentTargets,
      )
    }
    this.recentTargets.push(this.currentTarget)

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
    this.time.delayedCall(this.level >= 3 ? 340 : 420, () => {
      this.spawnBubbleArc(labels)
      recordSeen(this.currentTarget, this.currentKind)
      this.beginStepInput()
    })
  }

  /**
   * sequence モード（もじもじアトラクション）: 単語の文字を順番どおりに撃つ。
   * バブルは単語の開始時に一度だけ出し、正解した文字から消えていく。
   */
  private startSequenceStep(): void {
    const seq = this.currentSeq
    this.currentTarget = seq[this.purifyStep]
    // 出題は単語をそのまま読むだけ（「しか」）。テンポ最優先で説明セリフは入れない。
    // どの文字を撃つかは音だけで伝える（文字を見せると同じ形を選ぶだけになってしまう）
    if (this.purifyStep === 0) {
      // 単語の開始: 全文字＋まぎらわしい文字を一度に出す
      const choiceCount = Math.max(seq.length + 1, this.battle.choiceCount)
      const distractors = pickDistractors(seq[0], choiceCount - seq.length, {
        kind: this.currentKind,
        useConfusables: this.level >= 2,
        preferWeakPairs: this.level >= 2,
        exclude: seq,
      })
      const labels = Phaser.Utils.Array.Shuffle([...seq, ...distractors])
      voice.speak(`${this.currentWord}！`)
      this.time.delayedCall(this.level >= 3 ? 340 : 420, () => {
        this.spawnBubbleArc(labels)
        for (const s of seq) recordSeen(s, this.currentKind)
        this.beginStepInput()
      })
    } else {
      // 2文字目以降: バブルはそのまま、すぐ次の入力を受け付ける（声は出さない）
      this.beginStepInput()
    }
  }

  /** math モード（さんすうバトル）: 問題を表示・読み上げ、答えの候補数字を撃つ */
  private startMathStep(): void {
    const spec = this.stageData.mathLevels?.[this.level]
    if (spec) {
      // 直前と同じ式が続かないよう、数問ぶんは引き直す（範囲が狭い難易度でも極力ばらす）
      let prob = this.makeMathProblem(spec)
      for (let i = 0; i < 6 && prob.question === this.lastMathQuestion; i++) {
        prob = this.makeMathProblem(spec)
      }
      this.currentProblem = prob
      this.lastMathQuestion = prob.question
    } else {
      this.currentProblem = this.stageData.problems![Phaser.Math.Between(0, this.stageData.problems!.length - 1)]
    }
    this.currentTarget = this.currentProblem.answer
    voice.speak(this.currentProblem.voicePrompt)
    const labels = Phaser.Utils.Array.Shuffle([...this.currentProblem.choices])
    this.time.delayedCall(this.level >= 3 ? 340 : 420, () => {
      this.spawnBubbleArc(labels)
      recordSeen(this.currentProblem!.question, 'math')
      this.beginStepInput()
    })
  }

  /**
   * 難易度パラメータ（演算種別・答えの最大値）から1問をランダム生成する。
   * 引き算は答えが必ず1以上（0以下になる問題は作らない）。
   */
  private makeMathProblem(spec: MathLevelSpec): MathProblem {
    const op = spec.ops[Phaser.Math.Between(0, spec.ops.length - 1)]
    let a: number, b: number, answer: number
    if (op === '+') {
      answer = Phaser.Math.Between(2, spec.maxAnswer)
      a = Phaser.Math.Between(1, answer - 1)
      b = answer - a
    } else {
      a = Phaser.Math.Between(2, spec.maxAnswer)
      b = Phaser.Math.Between(1, a - 1)
      answer = a - b
    }
    const read = (n: number) => DIGIT_READING[String(n)] ?? String(n)
    const choices = new Set<string>([String(answer)])
    const maxChoice = Math.max(9, spec.maxAnswer) // 答えが10まであるとき10も誤答に出す（10=必ず正解のヒントを防ぐ）
    for (let guard = 0; guard < 30 && choices.size < 3; guard++) {
      const near = answer + Phaser.Math.Between(-2, 2)
      if (near >= 1 && near <= maxChoice) choices.add(String(near))
    }
    return {
      question: `${a}${op}${b}`,
      // 「は？」は音声クリップで「ha」と読まれてしまうため「いくつ？」形式にする
      voicePrompt: `${read(a)} ${op === '+' ? 'たす' : 'ひく'} ${read(b)}、いくつ？`,
      answer: String(answer),
      choices: [...choices],
    }
  }

  // ------------------------------------------------------- english（㉔ 英語ステージ）

  /**
   * 英語ステージの出題。共通エンジン（対峙・バブル・浄化メーター・ライフ・読み上げ）は
   * そのまま使い、差分は「出題内容と読み上げ言語（en-US）」だけ。
   * 読み上げは voice.speakEn（英語クリップ→無ければ en-US 音声合成→無ければ視覚フォールバック）。
   */
  private startEnglishStep(): void {
    const attempts = this.sessionCorrect + this.wrongTotal
    const accuracy = attempts > 0 ? this.sessionCorrect / attempts : 1
    let choiceCount = this.battle.choiceCount
    if (attempts >= 3 && accuracy < 0.7) choiceCount = Math.max(3, choiceCount - 1)

    if (this.stageData.enMode === 'spell') { this.startEnSpellStep(choiceCount); return }
    if (this.stageData.enMode === 'meaning') { this.startEnMeaningStep(choiceCount); return }
    this.startEnLetterStep(choiceCount)
  }

  /** ① abc: 読み上げたアルファベットを選択肢から選ぶ（出題は英語のみ） */
  private startEnLetterStep(choiceCount: number): void {
    const pool = abcLetters(this.level)
    const target = this.bossActive && this.practiced.length
      ? this.pickEnglishFrom(this.practiced)
      : this.pickEnglishFrom(pool)
    this.currentTarget = target
    this.currentKind = 'english'
    this.currentEnWord = target
    this.recentTargets.push(target)

    const labels = Phaser.Utils.Array.Shuffle([target, ...this.pickAbcDistractors(target, choiceCount - 1)])
    this.announceEnglish(target, target)
    this.time.delayedCall(this.level >= 3 ? 340 : 420, () => {
      this.spawnBubbleArc(labels)
      recordSeen(target, 'english')
      this.beginStepInput()
    })
  }

  /** ② words: 単語を読み上げ、正しいスペルのバブルを選ぶ（誤答スペルはデータで用意） */
  private startEnSpellStep(choiceCount: number): void {
    const pool = SPELL_WORDS[this.level] ?? SPELL_WORDS[1]
    let spec: SpellSpec
    if (this.bossActive && this.practiced.length) {
      const word = this.pickEnglishFrom(this.practiced)
      spec = pool.find(s => s.word === word) ?? pool[Phaser.Math.Between(0, pool.length - 1)]
    } else {
      const recent = new Set(this.recentTargets.slice(-3))
      const avail = pool.filter(s => !recent.has(s.word))
      const src = avail.length ? avail : pool
      spec = src[Phaser.Math.Between(0, src.length - 1)]
    }
    this.currentTarget = spec.word
    this.currentKind = 'english'
    this.currentEnWord = spec.word
    this.recentTargets.push(spec.word)

    const wrongs = Phaser.Utils.Array.Shuffle([...spec.wrong]).slice(0, choiceCount - 1)
    const labels = Phaser.Utils.Array.Shuffle([spec.word, ...wrongs])
    this.announceEnglish(spec.word, spec.word)
    this.time.delayedCall(this.level >= 3 ? 340 : 420, () => {
      this.spawnBubbleArc(labels)
      recordSeen(spec.word, 'english')
      this.beginStepInput()
    })
  }

  /** ③ meaning: 英単語を読み上げ、その意味（ひらがな）を選ぶ。誤答は同じジャンルで揃える */
  private startEnMeaningStep(choiceCount: number): void {
    const pool = MEANING_WORDS[this.level] ?? MEANING_WORDS[1]
    let spec: MeaningSpec
    if (this.bossActive && this.practiced.length) {
      const meaning = this.pickEnglishFrom(this.practiced)
      spec = pool.find(m => m.meaning === meaning) ?? pool[Phaser.Math.Between(0, pool.length - 1)]
    } else {
      const recent = new Set(this.recentTargets.slice(-3))
      const avail = pool.filter(m => !recent.has(m.meaning))
      const src = avail.length ? avail : pool
      spec = src[Phaser.Math.Between(0, src.length - 1)]
    }
    this.currentTarget = spec.meaning // バブルはひらがなの意味
    this.currentKind = 'hiragana'
    this.currentEnWord = spec.word
    this.recentTargets.push(spec.meaning)

    const labels = Phaser.Utils.Array.Shuffle([spec.meaning, ...meaningDistractors(spec, this.level, choiceCount - 1)])
    this.announceEnglish(spec.word, spec.word)
    this.time.delayedCall(this.level >= 3 ? 340 : 420, () => {
      this.spawnBubbleArc(labels)
      recordSeen(spec.word, 'english')
      this.beginStepInput()
    })
  }

  /**
   * 英語ターゲットを選ぶ簡易ピッカー（englishStats を使った間隔反復）。
   * 未出題・苦手を優先し、直近に出したものは避ける。ボス復習にも同じ関数を使う。
   */
  private pickEnglishFrom(pool: string[]): string {
    const uniq = [...new Set(pool)]
    if (uniq.length === 1) return uniq[0]
    const stats = loadProgress().englishStats
    const recentSet = new Set(this.recentTargets.slice(-3))
    let candidates = uniq.filter(l => !recentSet.has(l))
    if (candidates.length === 0) candidates = uniq
    let best = candidates[0]
    let bestScore = -Infinity
    for (const label of candidates) {
      const s = stats[label]
      const seen = s?.seen ?? 0
      let score = Math.random() * 2
      if (seen === 0) score += 3
      score -= Math.min(seen, 12) * 0.4
      score += (s?.wrong ?? 0) * 1.5
      if (score > bestScore) { bestScore = score; best = label }
    }
    return best
  }

  /**
   * abc の選択肢を選ぶ。形が紛らわしい文字（b/d・p/q 等）を優先し、
   * 難易度3では大文字小文字の対応（例: b と B）も混ぜる。
   */
  private pickAbcDistractors(target: string, count: number): string[] {
    const pool = abcLetters(this.level)
    const excluded = new Set([target])
    const picked: string[] = []
    for (const c of ABC_CONFUSABLES[target] ?? []) {
      if (picked.length >= Math.min(2, count)) break
      if (pool.includes(c) && !excluded.has(c)) { picked.push(c); excluded.add(c) }
    }
    if (this.level >= 3 && picked.length < count) {
      const opp = target === target.toLowerCase() ? target.toUpperCase() : target.toLowerCase()
      if (opp !== target && pool.includes(opp) && !excluded.has(opp)) { picked.push(opp); excluded.add(opp) }
    }
    const rest = Phaser.Utils.Array.Shuffle(pool.filter(l => !excluded.has(l)))
    while (picked.length < count && rest.length) picked.push(rest.pop()!)
    return picked
  }

  /**
   * 英語の読み上げ＋「音が鳴った」合図。音が出せない端末では対象を大きく表示する
   * （フォールバック。abc/words は文字そのもの、meaning は英単語を出す）。
   */
  private announceEnglish(display: string, enWord: string): void {
    if (voice.speakEn(enWord)) {
      this.tweens.add({ targets: this.missionBar, scale: 1.07, duration: 200, yoyo: true, repeat: 1 })
      return
    }
    sfx.pop()
    const size = display.length >= 5 ? '68px' : display.length >= 4 ? '84px' : display.length >= 2 ? '96px' : '120px'
    const glow = this.add.image(GAME_W / 2, 470, 'softglow')
      .setDepth(8390).setScale(1.6).setAlpha(0.8).setTint(0xfff2c0)
    const big = this.add.text(GAME_W / 2, 470, display, {
      fontFamily: FONT, fontSize: size, fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(8400).setStroke('#7a4dff', 12).setScale(0)
    big.setShadow(0, 5, 'rgba(80,40,120,0.45)', 10)
    this.tweens.add({ targets: big, scale: 1, duration: 240, ease: 'Back.easeOut' })
    this.tweens.add({
      targets: [big, glow], alpha: 0, y: 430, duration: 300, delay: 900, ease: 'Cubic.easeIn',
      onComplete: () => { big.destroy(); glow.destroy() },
    })
  }

  /** 英語正解時の演出: 大きく表示＋英語で読み上げ（meaning は「英語→意味」の順で読む） */
  private showEnglishReward(label: string, enWord: string): void {
    const size = label.length >= 5 ? '96px' : label.length >= 4 ? '112px' : label.length >= 2 ? '130px' : '150px'
    const glow = this.add.image(GAME_W / 2, 455, 'softglow')
      .setDepth(8490).setScale(2.2).setAlpha(0.85).setTint(0xfff2c0)
    const big = this.add.text(GAME_W / 2, 455, label, {
      fontFamily: FONT, fontSize: size, fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(8500).setStroke('#ff8fb0', 12).setScale(0)
    big.setShadow(0, 6, 'rgba(80,40,120,0.45)', 12)
    this.tweens.add({ targets: big, scale: 1, duration: 260, ease: 'Back.easeOut' })
    this.tweens.add({
      targets: [big, glow], alpha: 0, y: 405, duration: 340, delay: 800, ease: 'Cubic.easeIn',
      onComplete: () => { big.destroy(); glow.destroy() },
    })
    voice.speakEn(enWord)
    if (this.stageData.enMode === 'meaning') {
      // 「cat は ねこ！」= 英語のあとに意味（ひらがな）も読むと学習効果が高い
      this.time.delayedCall(720, () => voice.speak(`${this.currentTarget}！`))
    }
  }

  /**
   * 選択肢バブルを敵を囲むリング状に出す。
   * 中央の敵エリア（ボスの体格ぶん）を空け、モンスターに重ならない配置。
   */
  private spawnBubbleArc(labels: string[]): void {
    const RING: Record<number, Array<[number, number]>> = {
      2: [[-330, 260], [330, 260]],
      3: [[-335, 280], [335, 280], [0, 480]],
      4: [[-345, 245], [345, 245], [-235, 460], [235, 460]],
      5: [[-350, 235], [350, 235], [-270, 445], [270, 445], [0, 490]],
      6: [[-360, 225], [360, 225], [-295, 425], [295, 425], [-115, 490], [115, 490]],
    }
    const ring = RING[labels.length] ?? RING[5]
    // 単調にならないよう、たまに左右反転（配置は対称なので順序だけ変わる）
    const positions = (this.enemyIndex + this.purifyStep) % 2 === 1
      ? ring.map(([x, y]) => [-x, y] as [number, number])
      : ring
    labels.forEach((label, i) => {
      const [ox, oy] = positions[i % positions.length]
      this.createChoiceBubble(label, this.currentKind, GAME_W / 2 + ox, oy, i)
    })
  }

  /** 出題の入力受付を開始する共通処理 */
  private beginStepInput(): void {
    this.stepStartAt = this.time.now
    this.stepActive = true
    this.updateDebugHook()
  }

  /**
   * 狙う文字のアナウンス。
   * 音だけで「め」と言う（文字を画面に出すと、聞かなくても答えが分かってしまうため）。
   * TTS が使えない環境だけ、フォールバックとして文字を表示する。
   */
  private announceTarget(label: string): void {
    const spoke = voice.speak(`${label}！`, { rate: 0.7 })
    if (spoke && voice.available()) {
      // ミッションバーをふわっとパルスさせて「音が鳴った」ことを伝える
      // （中央に大きな🔊を出すとモンスターが隠れるためバー側で表現）
      this.tweens.add({ targets: this.missionBar, scale: 1.07, duration: 200, yoyo: true, repeat: 1 })
      return
    }
    // フォールバック: 音が出ない環境では文字で伝える（モンスターを隠さない下側に表示）
    const glow = this.add.image(GAME_W / 2, 470, 'softglow')
      .setDepth(8390).setScale(1.5).setAlpha(0.8).setTint(0xfff2c0)
    const big = this.add.text(GAME_W / 2, 470, label, {
      fontFamily: FONT, fontSize: '110px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(8400).setStroke('#7a4dff', 12).setScale(0)
    big.setShadow(0, 5, 'rgba(80,40,120,0.45)', 10)
    this.tweens.add({ targets: big, scale: 1, duration: 240, ease: 'Back.easeOut' })
    this.tweens.add({
      targets: [big, glow], alpha: 0, y: 430, duration: 300, delay: 750,
      ease: 'Cubic.easeIn',
      onComplete: () => { big.destroy(); glow.destroy() },
    })
  }

  private speakPrompt(): void {
    if (this.stageData.type === 'english') {
      if (this.currentEnWord) this.announceEnglish(this.currentEnWord, this.currentEnWord)
      return
    }
    if (this.stageData.mode === 'math') {
      if (this.currentProblem) voice.speak(this.currentProblem.voicePrompt)
      return
    }
    if (this.stageData.mode === 'sequence') {
      // 単語モードの聞き直しは単語そのもの（「しか！」）
      if (this.currentWord) voice.speak(`${this.currentWord}！`)
      return
    }
    if (this.currentTarget) voice.speak(`${this.currentTarget}！`, { rate: 0.7 })
  }

  /** 学習統計への記録（math は問題キー・english は英語トークン・それ以外は文字） */
  private recordStat(correct: boolean, reactionMs?: number): void {
    if (this.stageData.type === 'english') {
      recordAnswer(this.currentEnWord, 'english', correct, reactionMs)
    } else if (this.stageData.mode === 'math' && this.currentProblem) {
      recordAnswer(this.currentProblem.question, 'math', correct, reactionMs)
    } else {
      recordAnswer(this.currentTarget, this.currentKind, correct, reactionMs)
    }
  }

  private createChoiceBubble(label: string, kind: TargetKind, x: number, y: number, index: number): void {
    // シャボン玉画像は「空のオーブ」。中が透けるので、文字の下に
    // パステルの半透明下敷き円をコードで描いて可読性を担保する
    const colorIndex = Phaser.Math.Between(0, BUBBLE_COLORS.length - 1)
    const tex = this.textures.get('img-bubble').getSourceImage()
    const imgScale = 160 / Math.max(tex.width, tex.height) // 直径160px 基準（radius 計算と一致）
    const backing = this.add.circle(0, 0, 66, BUBBLE_COLORS[colorIndex], 0.82)
    const bubble = this.add.image(0, 0, 'img-bubble').setScale(imgScale)
    // 複数文字（英単語スペル・ひらがなの意味など）は円に収まるよう文字を小さくする
    const n = [...label].length
    const fontSize = n >= 5 ? '30px' : n >= 4 ? '36px' : n >= 3 ? '44px' : n >= 2 ? '52px' : '62px'
    const letter = this.add.text(0, 0, label, {
      fontFamily: FONT, fontSize, fontStyle: 'bold', color: '#33336b',
    }).setOrigin(0.5).setStroke('#ffffff', n >= 4 ? 6 : 8)
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
    this.recordStat(true, reaction)
    this.sessionCorrect++
    if (this.stageData.mode === 'find' && !this.practiced.includes(this.currentTarget)) {
      this.practiced.push(this.currentTarget)
    }

    this.hitJuiceAt(b.container.x, b.container.y, 0xffffff)
    b.alive = false
    this.tweens.add({
      targets: b.container, scale: b.baseScale * 1.35, alpha: 0, duration: 90,
      onComplete: () => b.container.destroy(),
    })
    this.bubbles = this.bubbles.filter(other => other !== b)

    this.bumpCombo()
    this.wrongTapStreak = 0
    this.purifyStep++
    this.advancePurify()

    const isSequence = this.stageData.mode === 'sequence'
    const wordDone = this.purifyStep >= this.purifyStepsNeeded
    if (isSequence) {
      // 単語モード: 次の文字へ「即」進める（テンポ最優先。
      // 「し」→「か」と連打してもそのまま正解になる。読み上げも挟まない）
      if (!wordDone) {
        this.currentTarget = this.currentSeq[this.purifyStep]
        this.wrongThisStep = 0
        this.stepStartAt = this.time.now
        this.stepActive = true
        this.updateDebugHook()
        return
      }
      // 単語完成！ 読み上げ＋おおきな称賛演出
      this.clearBubbles()
      this.celebrateWord(this.currentWord, this.currentCelebration)
      this.time.delayedCall(1200, () => this.completePurify())
      this.updateDebugHook()
      return
    }

    if (this.stageData.type === 'english') {
      this.showEnglishReward(b.label, this.currentEnWord)
    } else {
      this.showBigLetter(b.label)
    }
    this.clearBubbles()
    // Lv3 はテンポをわずかに上げる
    if (wordDone) {
      this.time.delayedCall(this.level >= 3 ? 600 : 700, () => this.completePurify())
    } else {
      this.time.delayedCall(this.level >= 3 ? 850 : 1000, () => this.startPurifyStep())
    }
    this.updateDebugHook()
  }

  /** 単語完成のお祝い（読み上げ＋大きな表示＋星バースト＋なかまの絵文字） */
  private celebrateWord(word: string, emoji: string): void {
    // モンスター（笑顔になって浄化中）が隠れないよう、画面下側に出す
    const glow = this.add.image(GAME_W / 2, 460, 'softglow')
      .setDepth(8480).setScale(2.6).setAlpha(0.9).setTint(0xffe9f5)
    const big = this.add.text(GAME_W / 2, 455, word, {
      fontFamily: FONT, fontSize: '120px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(8500).setStroke('#ff8fb0', 14).setScale(0)
    big.setShadow(0, 6, 'rgba(80,40,120,0.45)', 12)
    voice.speak(`${word}！`, { rate: 0.85 })
    this.tweens.add({ targets: big, scale: 1, duration: 300, ease: 'Back.easeOut' })
    const burst = this.add.particles(0, 0, 'star', {
      speed: { min: 90, max: 300 }, scale: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 }, lifespan: 900,
      tint: [0xffe066, 0xffffff, 0xff8fd0, 0x9ff3ff], emitting: false,
    }).setDepth(8490)
    burst.explode(24, GAME_W / 2, 455)
    const friends: Phaser.GameObjects.Text[] = []
    for (let i = 0; i < 3; i++) {
      const friend = this.add.text(GAME_W / 2 + (i - 1) * 170, 560, emoji, { fontSize: '58px' })
        .setOrigin(0.5).setDepth(8500).setScale(0)
      friends.push(friend)
      this.tweens.add({ targets: friend, scale: 1, duration: 260, delay: 150 + i * 110, ease: 'Back.easeOut' })
      this.tweens.add({
        targets: friend, y: 525, duration: 320, delay: 150 + i * 110,
        yoyo: true, repeat: 2, ease: 'Sine.easeOut',
      })
    }
    this.tweens.add({
      targets: [big, glow, ...friends], alpha: 0, duration: 320, delay: 1400,
      ease: 'Cubic.easeIn',
      onComplete: () => { big.destroy(); glow.destroy(); friends.forEach(f => f.destroy()); burst.destroy() },
    })
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

    // 浄化完了: くすみが取れて本来の色に戻り、明るい光に包まれて空へ帰る
    // （モンスターの顔はいじらない＝オーバーレイなし）
    m.clearTint()
    const glow = this.add.image(m.x, m.y, 'softglow')
      .setDepth(3999).setScale((m.displayWidth / 256) * 2.1).setTint(0xfff2c0).setAlpha(0)
    this.tweens.add({ targets: glow, alpha: 0.9, duration: 350 })
    for (const puff of this.mistPuffs) {
      this.tweens.add({ targets: puff, alpha: 0, duration: 250 })
    }
    const sparkle = this.add.particles(0, 0, 'star', {
      speed: { min: 60, max: isBoss ? 260 : 200 }, scale: { start: 0.9, end: 0 },
      lifespan: 800, tint: [0xffe066, 0xffffff, 0xc7f0ff], emitting: false,
    }).setDepth(4100)
    sparkle.explode(isBoss ? 30 : 16, m.x, m.y)
    this.time.delayedCall(1000, () => sparkle.destroy())

    // この対峙のオブジェクトをローカルに引き取り、フィールドは即リセット
    // （演出中に次の対峙が始まっても競合しない）
    const puffs = this.mistPuffs
    const meterBox = this.meterBox
    this.mistPuffs = []
    this.meterBox = null
    this.meterCells = []
    this.monster = null
    if (meterBox) {
      this.tweens.add({ targets: meterBox, alpha: 0, duration: 300, delay: 350 })
    }

    // ボス（未なかま）は浄化後に「なかまボール」のチャンス！
    if (isBoss && this.bossMonsterId && !isCaptured(loadProgress(), this.bossMonsterId)) {
      this.acceptInput = false
      this.time.delayedCall(1100, () => this.startCaptureFlow(m, glow, this.bossMonsterId))
      this.time.delayedCall(1300, () => {
        puffs.forEach(p => p.destroy())
        meterBox?.destroy()
      })
      return
    }

    // すでになかまのボスは軽いあいさつだけ（二重捕獲はしない）
    if (isBoss && this.bossMonsterId) {
      this.time.delayedCall(700, () => voice.speak('もうなかまだよ！'))
    }

    const riseDelay = isBoss ? 800 : 350
    // 元気になったモンスターが光ごとふわっと空へ帰っていく
    this.tweens.add({
      targets: [m, glow], y: `-=240`, alpha: 0,
      duration: 800, delay: riseDelay, ease: 'Sine.easeIn',
    })
    this.tweens.add({ targets: m, scale: m.scale * 0.8, duration: 800, delay: riseDelay, ease: 'Sine.easeIn' })

    // 演出の途中で前進を再開する（笑顔が空へ帰るのを見ながら次へ＝待ち時間ゼロ）
    this.time.delayedCall(isBoss ? 1800 : 550, () => this.afterPurify(isBoss))
    this.time.delayedCall(isBoss ? 1900 : 1300, () => {
      m.destroy()
      glow.destroy()
      puffs.forEach(p => p.destroy())
      meterBox?.destroy()
    })
  }

  // ======================================================== なかまボール（捕獲）

  private updateCaptureHook(ball?: BallSpec): void {
    if (import.meta.env.DEV) {
      const w = window as unknown as Record<string, unknown>
      w.__captureState = this.captureState
      if (ball) w.__captureBall = ball.id
    }
  }

  /**
   * ボス浄化後の「なかまボール」フロー:
   * ルーレット → タップで投げる → 吸い込み → 3回揺れ → 判定 → 進行再開。
   * 出現重み・成功率・pity は data/balls.ts と progress の失敗カウントで決まる。
   */
  private startCaptureFlow(m: Phaser.GameObjects.Image, glow: Phaser.GameObjects.Image, monsterId: string): void {
    this.captureState = 'roulette'
    this.tweens.killTweensOf(m) // 浮遊バウンドを止める（吸い込み移動と競合させない）
    // ルーレットの結果を先に決める（pity: 2回失敗していたら必ず紫＝実質確定）
    const pity = captureFailCount(loadProgress(), monsterId) >= PITY_FAILS
    let chosen = rollBall(pity)
    if (import.meta.env.DEV) {
      const force = (window as unknown as Record<string, unknown>).__forceBall
      const forced = BALLS.find(b => b.id === force)
      if (forced) chosen = forced
    }
    this.updateCaptureHook(chosen)

    // 4つのボールを並べてハイライトが巡回（加速→減速して chosen に止まる）
    const rowY = 470
    const spacing = 150
    const sprites = BALLS.map((b, i) => {
      const s = this.add.image(GAME_W / 2 + (i - (BALLS.length - 1) / 2) * spacing, rowY, `ball-${b.id}`)
        .setDepth(8200).setScale(0)
      this.tweens.add({ targets: s, scale: 0.42, duration: 220, delay: i * 60, ease: 'Back.easeOut' })
      return s
    })
    const hl = this.add.image(sprites[0].x, rowY, 'softglow')
      .setDepth(8190).setScale(1).setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.9)

    const chosenIndex = BALLS.findIndex(b => b.id === chosen.id)
    // 巡回ステップ列: 最後が chosenIndex で終わるよう回数を調整（計 ~2.5秒）
    const totalSteps = 12 + ((chosenIndex - 12 % BALLS.length) + BALLS.length) % BALLS.length
    let step = 0
    const tick = () => {
      const i = step % BALLS.length
      hl.setPosition(sprites[i].x, rowY)
      sprites.forEach((s, j) => s.setScale(j === i ? 0.5 : 0.42))
      sfx.rouletteTick(step)
      step++
      if (step <= totalSteps) {
        // 前半は速く、終盤にかけてゆっくり
        const progress = step / totalSteps
        const delay = 70 + Math.pow(progress, 2.2) * 300
        this.time.delayedCall(delay, tick)
      } else {
        this.onRouletteStop(sprites, hl, chosen, chosenIndex, m, glow, monsterId)
      }
    }
    this.time.delayedCall(500, tick)
  }

  /** ルーレット停止 → ボール名の発表 → 画面下に登場してタップ待ち */
  private onRouletteStop(
    sprites: Phaser.GameObjects.Image[], hl: Phaser.GameObjects.Image,
    chosen: BallSpec, chosenIndex: number,
    m: Phaser.GameObjects.Image, glow: Phaser.GameObjects.Image, monsterId: string,
  ): void {
    sfx.rouletteStop()
    voice.speak(`${chosen.name}だ！`)
    const winner = sprites[chosenIndex]
    // 止まった瞬間のフラッシュ
    const flash = this.add.image(winner.x, winner.y, 'softglow')
      .setDepth(8210).setScale(0.6).setTint(chosen.trailColor).setBlendMode(Phaser.BlendModes.ADD)
    this.tweens.add({ targets: flash, scale: 2.2, alpha: 0, duration: 450, onComplete: () => flash.destroy() })
    if (chosen.rainbow) {
      // 紫は特別！ 虹の星バースト＋豪華ファンファーレ
      sfx.specialFanfare()
      const rainbow = this.add.particles(0, 0, 'star', {
        speed: { min: 120, max: 340 }, scale: { start: 1.1, end: 0 },
        rotate: { min: 0, max: 360 }, lifespan: 1000,
        tint: [0xff5a5a, 0xffb347, 0xffe066, 0x7ddf7d, 0x4db2ff, 0xc07bff], emitting: false,
      }).setDepth(8210)
      rainbow.explode(36, winner.x, winner.y)
      this.time.delayedCall(1200, () => rainbow.destroy())
    }
    // 外れたボールは退場、当たりは画面下中央へ（軽くバウンドして注目）
    sprites.forEach((s, i) => {
      if (i !== chosenIndex) this.tweens.add({ targets: s, alpha: 0, scale: 0.2, duration: 300, onComplete: () => s.destroy() })
    })
    this.tweens.add({ targets: hl, alpha: 0, duration: 300, onComplete: () => hl.destroy() })
    this.tweens.add({
      targets: winner, x: GAME_W / 2, y: 560, scale: 0.55, duration: 500, delay: 600, ease: 'Sine.easeInOut',
      onComplete: () => {
        this.tweens.add({ targets: winner, y: 548, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
        this.captureState = 'await-throw'
        this.updateCaptureHook(chosen)
        // ボールでも画面のどこでも、タップで投げられる
        winner.setInteractive({ useHandCursor: true })
        const throwNow = () => {
          if (this.captureState !== 'await-throw') return
          this.captureState = 'throwing'
          this.updateCaptureHook(chosen)
          this.input.off('pointerdown', throwNow)
          this.throwCaptureBall(winner, chosen, m, glow, monsterId)
        }
        winner.on('pointerdown', throwNow)
        this.input.on('pointerdown', throwNow)
      },
    })
  }

  /** ボールを放物線で投げる → モンスターが光になって吸い込まれる → 3回揺れ → 判定 */
  private throwCaptureBall(
    ball: Phaser.GameObjects.Image, chosen: BallSpec,
    m: Phaser.GameObjects.Image, glow: Phaser.GameObjects.Image, monsterId: string,
  ): void {
    sfx.throwBall()
    this.tweens.killTweensOf(ball)
    const sx = ball.x, sy = ball.y
    const tx = m.x, ty = m.y
    // 軌跡の光（ボールの色。紫は虹色）
    const trail = this.add.particles(0, 0, 'dot', {
      speed: { min: 8, max: 40 }, scale: { start: 0.55, end: 0 }, lifespan: 420,
      tint: chosen.rainbow
        ? [0xff5a5a, 0xffe066, 0x7ddf7d, 0x4db2ff, 0xc07bff]
        : [chosen.trailColor, 0xffffff],
      blendMode: 'ADD', frequency: 18,
    }).setDepth(8195).startFollow(ball)
    const flight = { t: 0 }
    this.tweens.add({
      targets: flight, t: 1, duration: 650, ease: 'Sine.easeOut',
      onUpdate: () => {
        ball.x = sx + (tx - sx) * flight.t
        ball.y = sy + (ty - sy) * flight.t - Math.sin(Math.PI * flight.t) * 200
        ball.angle += 9
      },
      onComplete: () => {
        trail.stop()
        this.time.delayedCall(500, () => trail.destroy())
        // モンスターが光になってボールに吸い込まれる
        sfx.suck()
        m.setTintFill() // 引数なし=白（光のシルエットになる）
        this.tweens.add({ targets: m, scale: 0.02, x: ball.x, y: ball.y, alpha: 0.9, duration: 520, ease: 'Cubic.easeIn' })
        this.tweens.add({ targets: glow, alpha: 0, scale: 0.4, duration: 500 })
        this.time.delayedCall(560, () => {
          m.setVisible(false)
          const pop = this.add.image(ball.x, ball.y, 'softglow')
            .setDepth(8210).setScale(0.4).setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD)
          this.tweens.add({ targets: pop, scale: 1.4, alpha: 0, duration: 350, onComplete: () => pop.destroy() })
          this.shakeCaptureBall(ball, chosen, m, glow, monsterId)
        })
      },
    })
  }

  /** ボールが3回揺れる（1回ごとに間を置き、音程が上がってドキドキ感） */
  private shakeCaptureBall(
    ball: Phaser.GameObjects.Image, chosen: BallSpec,
    m: Phaser.GameObjects.Image, glow: Phaser.GameObjects.Image, monsterId: string,
  ): void {
    this.captureState = 'shaking'
    this.updateCaptureHook(chosen)
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(500 + i * 850, () => {
        sfx.ballShake(i)
        this.tweens.add({ targets: ball, angle: -16, duration: 90, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' })
      })
    }
    this.time.delayedCall(500 + 3 * 850, () => {
      // 判定（pity 中は紫が選ばれているので successRate=1.0 で必ず成功）
      let success = Math.random() < chosen.successRate
      if (import.meta.env.DEV) {
        const force = (window as unknown as Record<string, unknown>).__forceCapture
        if (typeof force === 'boolean') success = force
      }
      if (success) {
        this.captureSucceeded(ball, monsterId, m, glow)
      } else {
        this.captureFailed(ball, monsterId, m, glow)
      }
    })
  }

  /** 成功: キラーン＋ロック＋星の紙吹雪＋名前の読み上げ */
  private captureSucceeded(
    ball: Phaser.GameObjects.Image, monsterId: string,
    m: Phaser.GameObjects.Image, glow: Phaser.GameObjects.Image,
  ): void {
    this.captureState = 'result'
    this.updateCaptureHook()
    recordCaptureSuccess(monsterId)
    EventBus.emit('monster-captured', { monsterId })
    sfx.captureSuccess()
    const lockRing = this.add.image(ball.x, ball.y, 'ring')
      .setDepth(8210).setTint(0xffe066).setScale(0.6)
    this.tweens.add({ targets: lockRing, scale: 2.4, alpha: 0, duration: 600, onComplete: () => lockRing.destroy() })
    this.tweens.add({ targets: ball, scale: ball.scale * 1.2, duration: 160, yoyo: true })
    const confetti = this.add.particles(0, 0, 'star', {
      speed: { min: 100, max: 320 }, scale: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 }, lifespan: 1000,
      tint: [0xffe066, 0xffffff, 0xff8fd0, 0x9ff3ff], emitting: false,
    }).setDepth(8210)
    confetti.explode(30, ball.x, ball.y)

    // なかまになったモンスターの画像＋なまえを大きく表示（ずかんと同じデータソース）
    const texH = this.textures.get(m.texture.key).getSourceImage().height
    const pScale = 250 / texH
    const portraitGlow = this.add.image(GAME_W / 2, 235, 'softglow')
      .setDepth(8490).setScale(2.4).setTint(0xfff2c0).setAlpha(0)
    const portrait = this.add.image(GAME_W / 2, 235, m.texture.key)
      .setDepth(8500).setScale(pScale * 0.6).setAlpha(0)
    this.tweens.add({ targets: portrait, alpha: 1, scale: pScale, duration: 380, ease: 'Back.easeOut' })
    this.tweens.add({ targets: portraitGlow, alpha: 0.9, duration: 380 })
    const nameLabel = this.add.text(GAME_W / 2, 388, monsterName(monsterId), {
      fontFamily: FONT, fontSize: '52px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(8500).setStroke('#7a4dff', 12).setScale(0)
    nameLabel.setShadow(0, 5, 'rgba(80,40,120,0.45)', 10)
    this.tweens.add({ targets: nameLabel, scale: 1, duration: 300, delay: 200, ease: 'Back.easeOut' })

    const label = this.showCaptureText('なかまになった！', 0xffe066, 462)
    voice.speak(`${monsterName(monsterId)}、なかまになった！`)
    this.time.delayedCall(2200, () => {
      confetti.destroy()
      label.destroy()
      portrait.destroy()
      portraitGlow.destroy()
      nameLabel.destroy()
      this.finishCaptureFlow([ball, m, glow])
    })
  }

  /** 失敗: ボールがポンと開き、にこにこ手を振りながら空へ帰る（やさしい表現） */
  private captureFailed(
    ball: Phaser.GameObjects.Image, monsterId: string,
    m: Phaser.GameObjects.Image, glow: Phaser.GameObjects.Image,
  ): void {
    this.captureState = 'result'
    this.updateCaptureHook()
    recordCaptureFail(monsterId)
    sfx.escapePop()
    const pop = this.add.image(ball.x, ball.y, 'softglow')
      .setDepth(8210).setScale(0.5).setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD)
    this.tweens.add({ targets: pop, scale: 1.8, alpha: 0, duration: 400, onComplete: () => pop.destroy() })
    this.tweens.add({ targets: ball, alpha: 0, scale: 0.3, duration: 350 })
    // モンスターが元気に出てきて、手を振りながら（左右にゆれながら）空へ帰る
    m.setVisible(true).setAlpha(1).clearTint()
    const outScale = this.monsterScaleFor(m.texture.key, true) * 0.8
    this.tweens.add({ targets: m, scale: outScale, x: GAME_W / 2, y: 240, duration: 450, ease: 'Back.easeOut' })
    this.tweens.add({ targets: m, angle: -8, duration: 260, delay: 500, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' })
    this.tweens.add({ targets: m, y: -180, alpha: 0, duration: 1000, delay: 1600, ease: 'Sine.easeIn' })
    const label = this.showCaptureText('にげられちゃった！ また あそぼうね', 0x9ff3ff)
    voice.speak('にげられちゃった！またあそぼうね')
    this.time.delayedCall(2600, () => {
      label.destroy()
      this.finishCaptureFlow([ball, m, glow])
    })
  }

  /** 捕獲フローの後片付け → 進行再開（ゴールへ） */
  private finishCaptureFlow(objects: Phaser.GameObjects.GameObject[]): void {
    this.captureState = 'idle'
    this.updateCaptureHook()
    this.acceptInput = true
    for (const o of objects) o.destroy()
    this.afterPurify(true)
  }

  /** 捕獲結果のテキスト表示（画面中央下・モンスターを隠さない） */
  private showCaptureText(text: string, tint: number, y = 430): Phaser.GameObjects.Text {
    const label = this.add.text(GAME_W / 2, y, text, {
      fontFamily: FONT, fontSize: '46px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(8500).setStroke('#3a3a70', 10).setScale(0)
    label.setTint(tint)
    label.setShadow(0, 4, 'rgba(40,20,80,0.5)', 8)
    this.tweens.add({ targets: label, scale: 1, duration: 280, ease: 'Back.easeOut' })
    return label
  }

  /** 浄化後の進行: 次の敵 → （規定体数で）ボス → ゴール */
  private afterPurify(wasBoss: boolean): void {
    if (wasBoss) {
      this.fillCounterCrown()
      this.pending = 'goal'
      this.nextEventAt = this.progress + this.battle.rideDistance * 0.9
    } else {
      this.fillCounterDot(this.enemyIndex)
      this.enemyIndex++
      if (this.enemyIndex >= this.battle.enemyCount) {
        // ボス予兆: ゆっくり見上げる＋低い気配（効果音のみ）
        this.pending = 'boss'
        this.nextEventAt = this.progress + this.battle.rideDistance * 1.3
        this.spawnApproaching(true)
        sfx.omen()
        this.tweens.add({ targets: this, lookUpY: 26, duration: 1400, ease: 'Sine.easeInOut' })
      } else {
        this.pending = 'enemy'
        this.nextEventAt = this.progress + this.battle.rideDistance
        this.spawnApproaching(false)
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

    // 知識の誤りなので統計に記録（撃ち逃し・時間切れは記録しない。失敗になってもここまでの記録は残る）
    this.recordStat(false)

    // 流れ: モンスターの反撃（もやもや玉・かわいく短く）→ やさしいフィードバック → ライフ減
    this.monsterAttack()

    this.time.delayedCall(400, () => {
      // やさしい誤答フィードバック（モード別。叱らない）
      const seqLater = this.stageData.mode === 'sequence'
        && this.currentSeq.slice(this.purifyStep + 1).includes(b.label)
      if (seqLater) {
        // 順番ちがい: 「さきに ね だよ」
        this.showGentleFeedback(b.container.x, b.container.y, `さきに「${this.currentTarget}」だよ！`)
        voice.speak(`さきに、${this.currentTarget}、だよ！`)
      } else if (this.stageData.mode === 'math') {
        this.showGentleFeedback(b.container.x, b.container.y, 'うーん、ちがうみたい！')
        if (this.currentProblem) voice.speak(this.currentProblem.voicePrompt)
      } else if (this.stageData.type === 'english') {
        // 誤答スペル/文字は読まず、正解の英語をもう一度きかせる（叱らない）
        this.showGentleFeedback(b.container.x, b.container.y, 'ちがうみたい！ もういちど きいてね')
        voice.speakEn(this.currentEnWord)
      } else {
        this.showGentleFeedback(b.container.x, b.container.y, `これは「${b.label}」だよ`)
        voice.speak(`これは、${b.label}、だよ`)
      }
    })
    // 狙いをもう一度伝える（忘れさせない）。
    // フィードバック（これは、く、だよ ≈2秒）を言い終えてから＝途中で遮らない
    this.time.delayedCall(2900, () => {
      if (this.stepActive) this.speakPrompt()
    })

    // ライフも同じ思想: 誤答ショットのときだけ減る（もや玉が届いたタイミングで）
    this.time.delayedCall(650, () => {
      this.loseLife()
      if (this.failed) return

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
    })
  }

  /**
   * 誤答時のモンスターの反撃（非暴力・罰しない）:
   * ぷくっと膨れて、もやもや玉をポンっと1つ投げてくる。手元が軽く押されるだけで
   * 暗転・大きなショック演出はしない。撃ち逃し・時間切れでは呼ばれない。
   */
  private monsterAttack(): void {
    const m = this.monster
    if (!m) return
    // ぷくっと膨れる
    this.tweens.add({
      targets: m, scaleX: m.scaleX * 1.1, scaleY: m.scaleY * 0.92,
      duration: 130, yoyo: true, ease: 'Sine.easeInOut',
    })
    // もやもや玉（文字バブルより下の深度＝文字は隠さない）
    const puff = this.add.image(m.x, m.y + 40, 'mist').setDepth(5850).setScale(0.4).setAlpha(0.95)
    const tx = GAME_W / 2 + Phaser.Math.Between(-70, 70)
    this.tweens.add({
      targets: puff, x: tx, y: GAME_H - 140, scale: 1.05, duration: 430, ease: 'Sine.easeIn',
      onComplete: () => {
        // ふわっと弾けて消える＋両手が軽くもやに押される
        this.tweens.add({ targets: puff, scale: 1.5, alpha: 0, duration: 220, onComplete: () => puff.destroy() })
        this.tweens.add({ targets: this.handR, x: GAME_W - 158, duration: 90, yoyo: true })
        this.tweens.add({ targets: this.handL, x: 158, duration: 90, yoyo: true })
      },
    })
  }

  // ------------------------------------------------------------------ ライフ

  /** ライフ表示（ハート3つ・右上の HUD 内） */
  private buildHearts(): void {
    this.heartIcons = []
    for (let i = 0; i < this.lives; i++) {
      const heart = this.add.text(GAME_W - 130 + i * 38, 52, '💖', { fontSize: '27px' })
        .setOrigin(0.5).setDepth(8000)
      this.heartIcons.push(heart)
    }
  }

  /**
   * ライフを1減らす。ハートは割れずに「もやもや」に包まれる見せ方。
   * 残り1（=2回ミス）になった時点で必ず正解を光らせ、負ける前に助け舟を出す。
   */
  private loseLife(): void {
    if (this.failed) return
    this.lives--
    sfx.lifeLose()
    const heart = this.heartIcons[this.lives]
    if (heart) {
      heart.setText('🌫️').setAlpha(0.9)
      this.tweens.add({ targets: heart, scale: 1.3, duration: 140, yoyo: true })
    }
    if (this.lives === 1) {
      this.glowCorrectBubble()
    } else if (this.lives <= 0) {
      this.failStage()
    }
  }

  /** ステージ失敗。演出はやさしく（暗転なし・React 側のオーバーレイで即再挑戦へ） */
  private failStage(): void {
    this.failed = true
    this.stepActive = false
    this.acceptInput = false
    this.phase = 'finished'
    voice.cancel()
    this.clearBubbles()
    this.time.delayedCall(600, () => EventBus.emit('stage-failed', {
      stageId: this.stageData.id,
      difficulty: this.level,
    }))
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
    // hands.png を左右に分割した両手スプライト（どちらも前へかざした開いた手）。
    // 文字バブル(6000)より下の深度に置き、文字を絶対に隠さない
    const buildHand = (key: string, x: number, baseY: number, height: number) => {
      const tex = this.textures.get(key).getSourceImage()
      const scale = height / tex.height
      const img = this.add.image(0, 0, key).setOrigin(0.5, 1).setScale(scale)
      const container = this.add.container(x, baseY, [img]).setDepth(5800)
      return { container, w: tex.width * scale, h: tex.height * scale }
    }
    const rBase = GAME_H + 34
    const lBase = GAME_H + 42
    const r = buildHand('img-hand-r', GAME_W - 172, rBase, 400)
    const l = buildHand('img-hand-l', 172, lBase, 400)
    this.handR = r.container
    this.handL = l.container
    this.tweens.add({
      targets: this.handR, y: rBase + 6, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
    this.tweens.add({
      targets: this.handL, y: lBase + 6, duration: 1900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
    // ビーム発射点＝両手の指先（hand-left/right.png 内の比率で算出。
    // 画像を差し替えたらここの比率だけ合わせる）
    this.fingertipR.x = this.handR.x + (0.38 - 0.5) * r.w
    this.fingertipR.y = rBase + (0.13 - 1) * r.h
    this.fingertipL.x = this.handL.x + (0.62 - 0.5) * l.w
    this.fingertipL.y = lBase + (0.13 - 1) * l.h
    // 指先はビームと同じシアンでほんのり明滅（両手）
    for (const p of [this.fingertipL, this.fingertipR]) {
      const glow = this.add.image(p.x, p.y, 'softglow')
        .setDepth(5801).setScale(0.2).setTint(0x7fe8ff).setAlpha(0.4)
        .setBlendMode(Phaser.BlendModes.ADD)
      this.tweens.add({
        targets: glow, scale: 0.3, alpha: 0.65, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    }
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
    // 出題の切り替わり中（演出待ち等）に撃ったバブルは、誤答扱いにしない
    // （「し」正解直後に「か」を連打しても不利にならない）
    if (!this.stepActive) {
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
   * 両手ビーム: 左右の指先から2本のビームが照準の1点に収束する。
   * 白熱した芯＋太い外側グロー（加算合成）＋ライン上のキラキラ粒子＋大きめの着弾フレア。
   * 深度は文字バブル(6000)より下＝文字は絶対に隠れない（照準・判定・オートエイムは不変更）。
   */
  private drawBeam(tx: number, ty: number): void {
    const g = this.add.graphics().setDepth(5950).setBlendMode(Phaser.BlendModes.ADD)
    const beamFrom = (fx: number, fy: number) => {
      const dx = tx - fx
      const dy = ty - fy
      const len = Math.hypot(dx, dy) || 1
      const px = -dy / len
      const py = dx / len
      const wide = 24 // 従来15 → 太く
      const tip = 7
      const poly = (w1: number, w2: number, color: number, alpha: number) => {
        g.fillStyle(color, alpha)
        g.fillPoints([
          new Phaser.Math.Vector2(fx + px * w1, fy + py * w1),
          new Phaser.Math.Vector2(tx + px * w2, ty + py * w2),
          new Phaser.Math.Vector2(tx - px * w2, ty - py * w2),
          new Phaser.Math.Vector2(fx - px * w1, fy - py * w1),
        ], true)
      }
      poly(wide * 2.2, tip * 2.6, 0x59e0f2, 0.38) // 外側グロー
      poly(wide, tip * 1.5, 0x9ff3ff, 0.72)
      poly(wide * 0.42, tip, 0xffffff, 1) // 白熱した芯
      // ライン上を舞うキラキラ粒子（片手ぶん）
      const sparks = this.add.particles(0, 0, 'dot', {
        speed: { min: 10, max: 70 }, scale: { start: 0.5, end: 0 }, lifespan: 280,
        tint: [0xffffff, 0x9ff3ff, 0x59e0f2], blendMode: 'ADD', emitting: false,
        emitZone: { type: 'random', source: new Phaser.Geom.Line(fx, fy, tx, ty), quantity: 8 },
      }).setDepth(5951)
      sparks.explode(8)
      this.time.delayedCall(400, () => sparks.destroy())
      // 指先のマズルフラッシュ
      const muzzle = this.add.image(fx, fy, 'star').setDepth(5951).setTint(0x9ff3ff).setScale(1)
        .setBlendMode(Phaser.BlendModes.ADD)
      this.tweens.add({
        targets: muzzle, scale: 0.2, alpha: 0, angle: 90, duration: 140,
        onComplete: () => muzzle.destroy(),
      })
    }
    beamFrom(this.fingertipL.x, this.fingertipL.y)
    beamFrom(this.fingertipR.x, this.fingertipR.y)
    // 着弾フレア（一回り大きく。文字より下の深度なので読める）
    g.fillStyle(0xffffff, 0.95)
    g.fillCircle(tx, ty, 18)
    g.fillStyle(0x7fe8ff, 0.5)
    g.fillCircle(tx, ty, 38)
    this.tweens.add({ targets: g, alpha: 0, duration: 110, onComplete: () => g.destroy() })

    // 両腕を軽く前へ押し出す（y は常時バウンド tween が使っているため x で表現）
    this.tweens.add({ targets: this.handR, x: GAME_W - 190, duration: 55, yoyo: true })
    this.tweens.add({ targets: this.handL, x: 190, duration: 55, yoyo: true })
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

  /**
   * 出題はすべて音声で伝えるため、文字のバーは出さない。「もう一度きく」🔊 ボタンだけを置く。
   * ㉒ モンスターの顔と重ならないよう右下に配置する（もどるボタン=左上・ライフ/コンボ=右上・
   * 両手ビームの操作＝画面全面タップとも干渉しない。iPhone のホームインジケータぶんの余白も確保）。
   */
  private buildMissionBar(): void {
    const bg = this.add.circle(0, 0, 44, 0xffc94d)
    bg.setStrokeStyle(4, 0xffffff, 0.95)
    const speaker = this.add.text(0, 1, '🔊', { fontSize: '46px' }).setOrigin(0.5)
    bg.setInteractive({ useHandCursor: true })
    bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation()
      sfx.uiTap()
      this.speakPrompt()
    })
    this.missionBar = this.add.container(GAME_W - 74, GAME_H - 86, [bg, speaker]).setDepth(8000)
    this.missionBar.setScale(0)
    this.tweens.add({ targets: this.missionBar, scale: 1, duration: 320, ease: 'Back.easeOut' })
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
    // モンスターが隠れないよう、画面下側（バブルは消えたあと）に出す
    const glow = this.add.image(GAME_W / 2, 455, 'softglow')
      .setDepth(8490).setScale(2.2).setAlpha(0.85).setTint(0xfff2c0)
    const big = this.add.text(GAME_W / 2, 455, label, {
      fontFamily: FONT, fontSize: '150px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(8500).setStroke('#ff8fb0', 12)
    big.setShadow(0, 6, 'rgba(80,40,120,0.45)', 12)
    big.setScale(0)
    voice.speak(label, { rate: 0.75 })
    this.tweens.add({ targets: big, scale: 1, duration: 260, ease: 'Back.easeOut' })
    this.tweens.add({
      targets: [big, glow], alpha: 0, y: 405, duration: 340, delay: 800,
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
