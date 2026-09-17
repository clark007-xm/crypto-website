import { SessionLogIndex, type IndexStorage } from "./log-index"
import { createPurchaseLogReader } from "./purchase-log-reader"
import type { ChainReadClient, IndexedLog, ReadErrorKind } from "../rpc/read-client"
import { Interface } from "ethers"
import { SESSION_ABI } from "./abis"

export interface PurchaseSession {
  sessionAddress: string
  creationBlock?: number
  creationBlockHash?: string
}
interface Member { index: SessionLogIndex; checked: boolean; identity: string; unsubscribe: () => void }
export interface PurchaseSnapshot {
  logs: IndexedLog[]; loading: boolean; error: ReadErrorKind | null
  complete: boolean; hydrated: boolean; needsInitial: boolean; scannedBlocks: number; updatedAt: number
}
export const EMPTY_PURCHASE: PurchaseSnapshot = {
  logs: [], loading: false, error: null, complete: false, hydrated: false, needsInitial: false, scannedBlocks: 0, updatedAt: 0,
}
const events = new Interface(SESSION_ABI)

/** Each discovered session has its own durable cursor; adding a session never resets others. */
export class PurchaseHistoryIndex {
  private members = new Map<string, Member>()
  private listeners = new Set<() => void>()
  private state: PurchaseSnapshot = EMPTY_PURCHASE
  private flight: Promise<void> | null = null
  private busy = false
  private lastError: ReadErrorKind | null = null
  private nextMember = 0
  constructor(readonly chainId: number, readonly factory: string, readonly deployBlock: number,
    readonly player: string, private storage?: IndexStorage) {}
  snapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  setSessions(sessions: PurchaseSession[]) {
    const keep = new Set<string>()
    for (const session of sessions) {
      const address = session.sessionAddress.toLowerCase()
      const start = Math.max(this.deployBlock, session.creationBlock ?? this.deployBlock)
      const identity = `${address}:${start}:${session.creationBlockHash ?? "unknown"}`
      keep.add(address)
      if (this.members.get(address)?.identity === identity) continue
      this.members.get(address)?.unsubscribe()
      const topics = [events.getEvent("TicketsPurchased")!.topicHash, events.getEvent("WinnerSelected")!.topicHash]
      const playerTopic = events.encodeFilterTopics("TicketsPurchased", [this.player])[1]
      const index = new SessionLogIndex(this.chainId, address, start, this.storage, {
        cacheKey: `onetap:purchases:v2:${this.chainId}:${this.factory.toLowerCase()}:${this.deployBlock}:${this.player.toLowerCase()}:${identity}`,
        acceptLog: log => topics.includes(log.topics[0]) && log.topics[1] === playerTopic,
      })
      this.members.set(address, { index, identity, checked: false, unsubscribe: index.subscribe(() => this.publish()) })
    }
    for (const [address, member] of this.members) {
      if (!keep.has(address)) { member.unsubscribe(); this.members.delete(address) }
    }
    this.publish()
  }
  private publish() {
    const members = [...this.members.values()]
    const snapshots = members.map(member => member.index.snapshot())
    this.state = {
      logs: snapshots.flatMap(state => state.logs).sort((a, b) => b.blockNumber - a.blockNumber || b.index - a.index),
      loading: this.busy, error: this.lastError,
      complete: snapshots.every(state => state.complete), hydrated: snapshots.every(state => state.hydrated),
      needsInitial: members.some(member => !member.checked),
      scannedBlocks: snapshots.reduce((sum, state) => sum + state.scannedBlocks, 0),
      updatedAt: snapshots.length ? Math.min(...snapshots.map(state => state.updatedAt)) : 0,
    }
    this.listeners.forEach(listener => listener())
  }
  sync(client: Pick<ChainReadClient, "getBlockNumber" | "getLogs">,
    options: { mode?: "initial" | "refresh" | "older"; maxRanges?: number; shouldContinue?: () => boolean } = {}): Promise<void> {
    if (this.flight) return this.flight
    this.flight = this.run(client, options).finally(() => { this.flight = null })
    return this.flight
  }
  private async run(client: Pick<ChainReadClient, "getBlockNumber" | "getLogs">,
    options: { mode?: "initial" | "refresh" | "older"; maxRanges?: number; shouldContinue?: () => boolean }) {
    this.busy = true; this.lastError = null; this.publish()
    const active = () => options.shouldContinue?.() ?? true
    let head: Promise<number> | undefined
    try {
      if (options.mode === "refresh") this.members.forEach(member => { member.checked = false })
      for (let i = 0; i < (options.maxRanges ?? 6) && active(); i++) {
        const members = [...this.members.values()]
        await Promise.all(members.map(member => member.index.ready))
        if (!active()) break
        const initial = members.find(member => !member.checked)
        const older = members.filter(member => !member.index.snapshot().complete)
        const member = initial ?? (options.mode === "older" && older.length ? older[this.nextMember++ % older.length] : undefined)
        if (!member) break
        const reader = createPurchaseLogReader({
          getBlockNumber: () => head ??= client.getBlockNumber(),
          getLogs: (...args) => client.getLogs(...args),
        }, [member.index.factory], this.player, active)
        await member.index.sync(reader, { revalidate: Boolean(initial), maxRanges: 1, shouldContinue: active })
        if (!active()) break
        // A chain reorg or a newly discovered catalog must not attach obsolete data to the current set.
        if (this.members.get(member.index.factory) !== member) continue
        if (member.index.snapshot().error) { this.lastError = member.index.snapshot().error; break }
        member.checked = true
      }
    } finally { this.busy = false; this.publish() }
  }
}
