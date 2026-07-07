import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { EventBus } from '../EventBus'
import { GameScene } from './GameScene'
import { Ride25DScene, GAME_W, GAME_H } from './Ride25DScene'
import type { DifficultyLevel, Stage } from '../types'

/**
 * Phaser を React にマウントするラッパー。
 * ステージの renderer に応じて 2.5D オンレール対峙シーン / 2D 固定画面シーンを選ぶ。
 * マウントごとに新しい Game インスタンスを作り、アンマウントで確実に破棄する。
 * （「もういっかい」は親が key を変えて再マウントするだけでよい）
 *
 * 「やめる？」確認ダイアログの表示中は EventBus の game-pause / game-resume で
 * シーンごと一時停止する（背後でエンカウントが進まないように）。
 */
export function PhaserGame({ stage, difficulty = 1 }: { stage: Stage; difficulty?: DifficultyLevel }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const scene = stage.renderer === '2.5d'
      ? new Ride25DScene(stage, difficulty)
      : new GameScene(stage, difficulty)
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: GAME_W,
      height: GAME_H,
      backgroundColor: '#1a1040',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene,
    })
    const pause = () => game.scene.isActive('Game') && game.scene.pause('Game')
    const resume = () => game.scene.isPaused('Game') && game.scene.resume('Game')
    EventBus.on('game-pause', pause)
    EventBus.on('game-resume', resume)
    return () => {
      EventBus.off('game-pause', pause)
      EventBus.off('game-resume', resume)
      game.destroy(true)
    }
  }, [stage, difficulty])

  return <div className="game-root" ref={containerRef} />
}
