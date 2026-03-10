import type { SynthesisJobStatus } from '../../types/synthesis'

export interface SynthesisJobStoreOptions {
  enableIndexedDb?: boolean
  dbName?: string
  storeName?: string
  indexedDb?: IDBFactory | null
}

const DEFAULT_DB_NAME = 'knexforge-synthesis'
const DEFAULT_STORE_NAME = 'synthesis-jobs'

function deepCopy<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}

export class SynthesisJobStore {
  private readonly memory = new Map<string, SynthesisJobStatus>()
  private readonly options: Required<Omit<SynthesisJobStoreOptions, 'indexedDb'>> & {
    indexedDb: IDBFactory | null
  }
  private dbPromise: Promise<IDBDatabase | null> | null = null

  constructor(options: SynthesisJobStoreOptions = {}) {
    this.options = {
      enableIndexedDb: options.enableIndexedDb ?? true,
      dbName: options.dbName ?? DEFAULT_DB_NAME,
      storeName: options.storeName ?? DEFAULT_STORE_NAME,
      indexedDb: options.indexedDb ?? (typeof indexedDB !== 'undefined' ? indexedDB : null),
    }
  }

  async save(status: SynthesisJobStatus): Promise<void> {
    const clone = deepCopy(status)
    this.memory.set(clone.job_id, clone)

    await this.withDatabase(async (db) => {
      await this.runWriteTransaction(db, (store) => {
        store.put(clone)
      })
    }, undefined)
  }

  async get(jobId: string): Promise<SynthesisJobStatus | null> {
    const memoryMatch = this.memory.get(jobId)
    if (memoryMatch) {
      return deepCopy(memoryMatch)
    }

    const dbMatch = await this.withDatabase(async (db) => {
      return this.runReadTransaction<SynthesisJobStatus | null>(db, (store) => {
        const request = store.get(jobId)
        return this.wrapRequest(request, (result) => (result ? (result as SynthesisJobStatus) : null))
      })
    }, null)

    if (dbMatch) {
      this.memory.set(jobId, deepCopy(dbMatch))
      return deepCopy(dbMatch)
    }

    return null
  }

  async list(): Promise<SynthesisJobStatus[]> {
    const byId = new Map<string, SynthesisJobStatus>()

    const dbRecords = await this.withDatabase(async (db) => {
      return this.runReadTransaction<SynthesisJobStatus[]>(db, (store) => {
        const request = store.getAll()
        return this.wrapRequest(request, (result) =>
          Array.isArray(result) ? (result as SynthesisJobStatus[]) : [],
        )
      })
    }, [])

    for (const record of dbRecords) {
      byId.set(record.job_id, deepCopy(record))
    }

    for (const [jobId, status] of this.memory.entries()) {
      byId.set(jobId, deepCopy(status))
    }

    return Array.from(byId.values()).sort((a, b) => a.created_at.localeCompare(b.created_at))
  }

  async delete(jobId: string): Promise<void> {
    this.memory.delete(jobId)

    await this.withDatabase(async (db) => {
      await this.runWriteTransaction(db, (store) => {
        store.delete(jobId)
      })
    }, undefined)
  }

  async clear(): Promise<void> {
    this.memory.clear()

    await this.withDatabase(async (db) => {
      await this.runWriteTransaction(db, (store) => {
        store.clear()
      })
    }, undefined)
  }

  private async withDatabase<T>(fn: (db: IDBDatabase) => Promise<T>, fallback: T): Promise<T> {
    const db = await this.openDatabase()
    if (!db) {
      return fallback
    }

    try {
      return await fn(db)
    } catch {
      return fallback
    }
  }

  private async openDatabase(): Promise<IDBDatabase | null> {
    if (!this.options.enableIndexedDb || !this.options.indexedDb) {
      return null
    }

    if (this.dbPromise) {
      return this.dbPromise
    }

    this.dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      const request = this.options.indexedDb!.open(this.options.dbName, 1)

      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(this.options.storeName)) {
          db.createObjectStore(this.options.storeName, { keyPath: 'job_id' })
        }
      }

      request.onsuccess = () => resolve(request.result)
    })

    return this.dbPromise
  }

  private runWriteTransaction(
    db: IDBDatabase,
    callback: (store: IDBObjectStore) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.options.storeName, 'readwrite')
      const store = tx.objectStore(this.options.storeName)

      try {
        callback(store)
      } catch (error) {
        reject(error)
        return
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  }

  private runReadTransaction<T>(
    db: IDBDatabase,
    callback: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.options.storeName, 'readonly')
      const store = tx.objectStore(this.options.storeName)

      callback(store).then(resolve).catch(reject)
    })
  }

  private wrapRequest<T>(request: IDBRequest, mapper: (value: unknown) => T): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(mapper(request.result))
      request.onerror = () => reject(request.error)
    })
  }
}

export function createSynthesisJobStore(options: SynthesisJobStoreOptions = {}): SynthesisJobStore {
  return new SynthesisJobStore(options)
}
