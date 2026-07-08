import Phaser from 'phaser'

/**
 * React ↔ Phaser 間の疎結合な連絡用イベントバス。
 * イベント一覧:
 *   'stage-clear' (result: StageResult)  … ステージクリア時に Phaser 側から発火
 *   'stage-failed' ({ stageId, difficulty }) … ライフ0でステージ失敗時に Phaser 側から発火
 *   'monster-captured' ({ monsterId })       … なかまボール成功時に Phaser 側から発火
 *   'game-pause' / 'game-resume'         … 「やめる？」確認ダイアログの開閉で React 側から発火
 */
export const EventBus = new Phaser.Events.EventEmitter()
