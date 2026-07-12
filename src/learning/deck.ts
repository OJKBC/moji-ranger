/**
 * デッキ方式の出題ヘルパー。
 * プールをシャッフルして山札にし、1枚ずつ配る。全部配り切るまで同じ問題を出さない。
 * 配り切ったら自動で切り直す（直前に出したカードが切り直し直後に連続しないようにする）。
 *
 * 用途: えいご（meaning/spell/abc）・もじもじ・よむ など、プールから出す全ステージの
 * 「同じ問題ばかり出る」を防ぐ。ステージ1プレイぶんはシーンが山札を保持する。
 */
export class Deck<T> {
  private readonly pool: T[]
  private queue: T[] = []
  private last: T | undefined

  constructor(items: T[]) {
    this.pool = items.slice()
  }

  get size(): number {
    return this.pool.length
  }

  /** 次の1枚を配る（山札が尽きたら切り直す） */
  next(rng: () => number = Math.random): T {
    if (this.pool.length === 0) throw new Error('Deck is empty')
    if (this.pool.length === 1) return this.pool[0]
    if (this.queue.length === 0) this.reshuffle(rng)
    const card = this.queue.pop() as T
    this.last = card
    return card
  }

  private reshuffle(rng: () => number): void {
    const next = this.pool.slice()
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[next[i], next[j]] = [next[j], next[i]]
    }
    // 山札の一番上（＝次に配る = 配列の末尾）が直前のカードと同じなら、先頭と入れ替える
    if (this.last !== undefined && next[next.length - 1] === this.last) {
      ;[next[0], next[next.length - 1]] = [next[next.length - 1], next[0]]
    }
    this.queue = next
  }
}
