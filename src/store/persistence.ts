/**
 * セーブデータの多重保存層（⑳）。
 * localStorage（同期・従来どおり）に加えて IndexedDB へも書き込み、
 * キャッシュ削除等で localStorage が消えても IndexedDB から復活させる。
 *
 * - ダブルバッファ: save_current / save_backup を交互に更新。
 *   片方が壊れていても、もう片方から復旧できる。
 * - 各レコードは { savedAt, data } の封筒つき。読み込みは「壊れていない最新」を選ぶ。
 * - IndexedDB が使えない環境では静かに何もしない（localStorage のみで動く）。
 */

const DB_NAME = 'moji-ranger'
const STORE = 'saves'
const BUFFER_KEYS = ['save_current', 'save_backup'] as const

interface Envelope {
  savedAt: number
  data: unknown
}

let writeToggle = 0

function openDb(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/** ダブルバッファへ交互に書き込む（失敗しても投げない） */
export async function idbWrite(data: unknown, savedAt: number): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    const key = BUFFER_KEYS[writeToggle % BUFFER_KEYS.length]
    writeToggle++
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ savedAt, data } satisfies Envelope, key)
    await new Promise<void>(resolve => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    })
  } catch {
    // 保存失敗してもゲームは続行（localStorage 側が生きている）
  } finally {
    db.close()
  }
}

/** 両バッファを読み、壊れていない最新の封筒を返す */
export async function idbReadNewest(): Promise<Envelope | null> {
  const db = await openDb()
  if (!db) return null
  try {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const reads = BUFFER_KEYS.map(key => new Promise<Envelope | null>(resolve => {
      const req = store.get(key)
      req.onsuccess = () => {
        const v = req.result as Envelope | undefined
        resolve(v && typeof v.savedAt === 'number' && v.data && typeof v.data === 'object' ? v : null)
      }
      req.onerror = () => resolve(null)
    }))
    const results = await Promise.all(reads)
    const valid = results.filter((v): v is Envelope => v !== null)
    if (valid.length === 0) return null
    return valid.sort((a, b) => b.savedAt - a.savedAt)[0]
  } catch {
    return null
  } finally {
    db.close()
  }
}
