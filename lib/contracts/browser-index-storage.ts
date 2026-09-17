import type { IndexStorage } from "./log-index"

/** Public chain data only. No wallet secrets, signatures or provider credentials. */
export function createBrowserIndexStorage(factory: IDBFactory | undefined): IndexStorage {
  let connection: Promise<IDBDatabase> | undefined
  const memory = new Map<string, string>()
  function open() {
    if (!factory) return Promise.reject(new Error("storage unavailable"))
    if (!connection) connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open("onetap-chain-index", 1)
      let done = false
      const timeout = setTimeout(() => { done = true; reject(new Error("storage timeout")) }, 1500)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("entries")) request.result.createObjectStore("entries")
      }
      request.onsuccess = () => {
        if (done) { request.result.close(); return }
        done = true; clearTimeout(timeout)
        request.result.onversionchange = () => { request.result.close(); connection = undefined }
        resolve(request.result)
      }
      request.onerror = request.onblocked = () => { done = true; clearTimeout(timeout); reject(new Error("storage unavailable")) }
    })
    return connection
  }
  async function transact<T>(mode: IDBTransactionMode, execute: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await open()
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("entries", mode)
      const request = execute(transaction.objectStore("entries"))
      const timeout = setTimeout(() => { transaction.abort(); reject(new Error("storage timeout")) }, 1500)
      transaction.oncomplete = () => { clearTimeout(timeout); resolve(request.result) }
      transaction.onerror = transaction.onabort = () => { clearTimeout(timeout); reject(new Error("storage unavailable")) }
    })
  }
  return {
    async getItem(key) {
      try {
        const entry = await transact("readonly", store => store.get(key))
        if (entry && typeof entry.value === "string" && Date.now() - entry.savedAt < 30 * 86400000) return entry.value
      } catch { /* Private mode, quota or blocked database: live reads still work. */ }
      return memory.get(key) ?? null
    },
    async setItem(key, value) {
      // Fallback is deliberately bounded; it is not a second unlimited persistent cache.
      memory.delete(key); memory.set(key, value)
      while (memory.size > 100) memory.delete(memory.keys().next().value!)
      try { await transact("readwrite", store => store.put({ value, savedAt: Date.now() }, key)) } catch { /* optional cache */ }
    },
  }
}

let browserStorage: IndexStorage | undefined
export function getBrowserIndexStorage(): IndexStorage | undefined {
  if (typeof window === "undefined") return undefined
  if (!browserStorage) {
    let factory: IDBFactory | undefined
    try { factory = window.indexedDB } catch { /* optional */ }
    browserStorage = createBrowserIndexStorage(factory)
  }
  return browserStorage
}
