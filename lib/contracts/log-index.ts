import { ChainReadError, type IndexedLog, type LogReader, type ReadErrorKind } from "../rpc/read-client"

type Range = [number, number]
export interface IndexSnapshot {
  logs: IndexedLog[]; ranges: Range[]; head: number | null; loading: boolean
  error: ReadErrorKind | null; updatedAt: number; complete: boolean; scannedBlocks: number; hydrated: boolean
}
export const EMPTY_INDEX: IndexSnapshot = {
  logs: [], ranges: [], head: null, loading: false, error: null, updatedAt: 0, complete: false, scannedBlocks: 0, hydrated: false,
}
export interface IndexStorage { getItem(key: string): string | null | Promise<string | null>; setItem(key: string, value: string): void | Promise<void> }
function mergeRanges(ranges: Range[]): Range[] {
  const merged: Range[] = []
  for (const [from, to] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const previous = merged[merged.length - 1]
    if (previous && from <= previous[1] + 1) previous[1] = Math.max(previous[1], to)
    else merged.push([from, to])
  }
  return merged
}
function missingRange(ranges: Range[], start: number, head: number, size: number): Range | null {
  let end = head
  for (const [from, to] of [...ranges].reverse()) {
    if (from > end) continue
    if (to >= end) end = from - 1
    else return end < start ? null : [Math.max(start, to + 1, end - size + 1), end]
  }
  return end < start ? null : [Math.max(start, end - size + 1), end]
}

/** One shared flight per chain + Factory + deployment block; only public logs are persisted. */
export class SessionLogIndex {
  private state: IndexSnapshot = EMPTY_INDEX
  private listeners = new Set<() => void>()
  private flight: Promise<void> | null = null
  private seeded = false
  readonly key: string
  readonly ready: Promise<void>
  constructor(readonly chainId: number, readonly factory: string, readonly deployBlock: number, private storage?: IndexStorage,
    private options: { cacheKey?: string; acceptLog?: (log: IndexedLog) => boolean } = {}) {
    this.key = options.cacheKey ?? `onetap:session-index:v1:${chainId}:${factory.toLowerCase()}:${deployBlock}`
    try {
      const raw = storage?.getItem(this.key) ?? null
      if (raw && typeof raw !== "string") {
        this.ready = raw.then(value => this.restore(value)).catch(() => {}).finally(() => this.publish({ hydrated: true }))
      } else {
        this.restore(raw); this.publish({ hydrated: true }); this.ready = Promise.resolve()
      }
    } catch { this.publish({ hydrated: true }); this.ready = Promise.resolve() }
  }
  whenIdle = () => this.flight ?? Promise.resolve()
  snapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(patch: Partial<IndexSnapshot>) {
    this.state = { ...this.state, ...patch }
    const { ranges, head } = this.state
    this.state.scannedBlocks = ranges.reduce((sum, [a, b]) => sum + b - a + 1, 0)
    this.state.complete = head !== null && !missingRange(ranges, this.deployBlock, head, 9000)
    this.listeners.forEach(listener => listener())
  }
  private persist() {
    try {
      const logs = this.state.logs.filter(log => this.state.ranges.some(([a, b]) => log.blockNumber >= a && log.blockNumber <= b))
      const payload = JSON.stringify({ version: 1, head: this.state.head, ranges: this.state.ranges, logs, seeded: this.seeded, updatedAt: this.state.updatedAt })
      if (payload.length <= 2_000_000) void Promise.resolve(this.storage?.setItem(this.key, payload)).catch(() => {})
    } catch { /* Full/disabled storage must not block live reads. */ }
  }
  private restore(raw: string | null) {
    try {
      if (!raw || raw.length > 2_000_000) return
      const cached = JSON.parse(raw)
      if (cached.version !== 1 || !Number.isSafeInteger(cached.head) || cached.head < this.deployBlock ||
        !Array.isArray(cached.ranges) || !Array.isArray(cached.logs)) return
      if (!cached.ranges.every((r: unknown) => Array.isArray(r) && r.length === 2 &&
        r.every(Number.isSafeInteger) && r[0] >= this.deployBlock && r[0] <= r[1] && r[1] <= cached.head)) return
      const ranges = mergeRanges(cached.ranges)
      if (!cached.logs.every((log: IndexedLog) => log && typeof log.address === "string" &&
        log.address.toLowerCase() === this.factory.toLowerCase() && Number.isSafeInteger(log.blockNumber) &&
        Number.isSafeInteger(log.index) && log.index >= 0 && ranges.some(([a, b]) => log.blockNumber >= a && log.blockNumber <= b) &&
        /^0x[\da-f]{64}$/i.test(log.blockHash) && /^0x[\da-f]{64}$/i.test(log.transactionHash) &&
        /^0x[\da-f]*$/i.test(log.data) && Array.isArray(log.topics) && log.topics.every(t => /^0x[\da-f]{64}$/i.test(t)) &&
        (!this.options.acceptLog || this.options.acceptLog(log)))) return
      this.publish({ head: cached.head, ranges, logs: cached.logs, updatedAt: Number.isSafeInteger(cached.updatedAt) && cached.updatedAt <= Date.now() ? cached.updatedAt : 0 })
      this.seeded = cached.seeded === true
    } catch { /* Ignore stale/corrupt cache. */ }
  }
  sync(reader: LogReader, options: { revalidate?: boolean; maxRanges?: number; shouldContinue?: () => boolean } = {}): Promise<void> {
    if (this.flight) return this.flight
    this.flight = this.run(reader, options).finally(() => { this.flight = null })
    return this.flight
  }
  private async readRange(reader: LogReader, range: Range) {
    const [from, to] = range
    const logs = await reader.getLogs(from, to)
    const next = this.state.logs.filter(log => log.blockNumber < from || log.blockNumber > to)
    const unique = new Map([...next, ...logs].map(log => [`${log.blockHash}:${log.transactionHash}:${log.index}`, log]))
    this.publish({ logs: [...unique.values()].sort((a, b) => b.blockNumber - a.blockNumber || b.index - a.index), ranges: mergeRanges([...this.state.ranges, range]) })
    this.persist()
  }
  private async run(reader: LogReader, options: { revalidate?: boolean; maxRanges?: number; shouldContinue?: () => boolean }) {
    await this.ready
    const canContinue = () => !options.shouldContinue || options.shouldContinue() || this.listeners.size > 0
    this.publish({ loading: true, error: null })
    try {
      const head = await reader.getBlockNumber()
      const refreshOnly = options.revalidate !== false && this.state.head !== null && this.state.ranges.length > 0
      // Re-read the last 64 blocks (and discard future blocks after a rollback).
      const boundary = options.revalidate === false ? head + 1 : Math.max(this.deployBlock, Math.min(this.state.head ?? head, head) - 63)
      const ranges = this.state.ranges.filter(([a]) => a < boundary).map(([a, b]) => [a, Math.min(b, boundary - 1)] as Range)
      // Retain previously read data during revalidation. Successful ranges replace it atomically.
      this.publish({ head, ranges, logs: this.state.logs.filter(log => log.blockNumber <= head) })
      for (let i = 0; i < (options.maxRanges ?? 6); i++) {
        if (!canContinue()) break
        const range = missingRange(this.state.ranges, this.deployBlock, head, 9000)
        if (!range) break
        if (refreshOnly && range[1] < boundary) break
        // A cursor advances only after the entire range succeeds. Never cache a failed range as empty.
        await this.readRange(reader, range)
      }
      // A deployment hint helps sparse test deployments without declaring unqueried history empty.
      if (!this.seeded && !this.state.complete && !this.state.logs.length && reader.findSeedBlock &&
        canContinue()) {
        const seed = await reader.findSeedBlock(head)
        if (seed !== null) {
          for (let from = Math.max(this.deployBlock, seed); from <= Math.min(head, seed + 17999); from += 9000) {
            if (!canContinue()) break
            await this.readRange(reader, [from, Math.min(head, from + 8999)])
          }
        }
        this.seeded = canContinue()
        this.persist()
      }
      this.publish({ updatedAt: Date.now() })
      this.persist()
    } catch (error) {
      this.publish({ error: error instanceof ChainReadError ? error.kind : "unavailable" })
    } finally { this.publish({ loading: false }) }
  }
}
