import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { GameScene, GAME_W, GAME_H } from './GameScene'
import type { Stage } from '../types'

/**
 * Phaser を React にマウントするラッパー。
 * マウントごとに新しい Game インスタンスを作り、アンマウントで確実に破棄する。
 * （「もういっかい」は親が key を変えて再マウントするだけでよい）
 */
export function PhaserGame({ stage }: { stage: Stage }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
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
      scene: new GameScene(stage),
    })
    return () => {
      game.destroy(true)
    }
  }, [stage])

  return <div className="game-root" ref={containerRef} />
}
