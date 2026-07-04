import Phaser from 'phaser'

/**
 * React ↔ Phaser 間の疎結合な連絡用イベントバス。
 * イベント一覧:
 *   'stage-clear' (result: StageResult)  … ステージクリア時に Phaser 側から発火
 */
export const EventBus = new Phaser.Events.EventEmitter()
