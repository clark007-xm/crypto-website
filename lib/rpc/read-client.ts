/** Bounded, paced reads for the public session index. Never sends transactions. */
export type ReadErrorKind = "rate-limit" | "timeout" | "unavailable" | "invalid-response"
export class ChainReadError extends Error {
  constructor(public readonly kind: ReadErrorKind) { super(kind); this.name = "ChainReadError" }
}
export interface IndexedLog {
  address: string; topics: string[]; data: string; blockNumber: number
  blockHash: string; transactionHash: string; index: number
}
export interface LogReader {
  getBlockNumber(): Promise<number>
  getLogs(fromBlock: number, toBlock: number): Promise<IndexedLog[]>
  findSeedBlock?(head: number): Promise<number | null>
}
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export class ChainReadClient {
  private tail: Promise<unknown> = Promise.resolve()
  private cooldown = new Map<string, number>()
  private verified = new Set<string>()
  private preferred = 0
  private lastFailure: ReadErrorKind = "unavailable"
  constructor(
    readonly chainId: number,
    private urls: string[],
    private options: { timeoutMs?: number; gapMs?: number; cooldownMs?: number; fetch?: typeof fetch } = {},
  ) {}

  send<T>(method: string, params: unknown[], signal?: AbortSignal): Promise<T> {
    if (!["eth_blockNumber", "eth_getLogs", "eth_call", "eth_getBlockByNumber", "eth_getCode"].includes(method)) {
      return Promise.reject(new ChainReadError("invalid-response"))
    }
    const task = this.tail.then(async () => {
      signal?.throwIfAborted()
      await pause(this.options.gapMs ?? 180)
      signal?.throwIfAborted()
      const now = Date.now()
      const candidates = this.urls.map((url, index) => ({ url, index }))
        .filter(({ url }) => (this.cooldown.get(url) ?? 0) <= now)
        .sort((a, b) => Number(b.index === this.preferred) - Number(a.index === this.preferred))
      if (!candidates.length) throw new ChainReadError(this.lastFailure)
      let lastError = new ChainReadError("unavailable")
      const deadline = Date.now() + 20_000
      // One attempt per configured endpoint. Failed endpoints cool down; no hidden SDK retry loop.
      for (const { url, index } of candidates) {
        try {
          signal?.throwIfAborted()
          if (Date.now() >= deadline) throw new ChainReadError("timeout")
          if (!this.verified.has(url)) {
            const chain = await this.request<string>(url, "eth_chainId", [], deadline, signal)
            if (Number(chain) !== this.chainId) throw new ChainReadError("invalid-response")
            this.verified.add(url)
          }
          const result = await this.request<T>(url, method, params, deadline, signal)
          this.preferred = index
          return result
        } catch (error) {
          signal?.throwIfAborted()
          lastError = error instanceof ChainReadError ? error : new ChainReadError("unavailable")
          this.lastFailure = lastError.kind
          this.cooldown.set(url, Date.now() + (this.options.cooldownMs ?? 30_000))
        }
      }
      throw lastError
    })
    this.tail = task.catch(() => undefined)
    return task
  }

  private async request<T>(url: string, method: string, params: unknown[], deadline: number, signal?: AbortSignal): Promise<T> {
    if (Date.now() >= deadline) throw new ChainReadError("timeout")
    signal?.throwIfAborted()
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener("abort", abort, { once: true })
    const timer = setTimeout(() => controller.abort(), Math.min(this.options.timeoutMs ?? 5_000, deadline - Date.now()))
    try {
      const response = await (this.options.fetch ?? fetch)(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: controller.signal,
      })
      if (response.status === 429) throw new ChainReadError("rate-limit")
      if (!response.ok) throw new ChainReadError("unavailable")
      const body = await response.json()
      if (body.error) throw new ChainReadError(body.error.code === -32005 ? "rate-limit" : "unavailable")
      if (body.result === undefined) throw new ChainReadError("invalid-response")
      signal?.throwIfAborted()
      return body.result as T
    } catch (error) {
      signal?.throwIfAborted()
      if (controller.signal.aborted) throw new ChainReadError("timeout")
      throw error instanceof ChainReadError ? error : new ChainReadError("unavailable")
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort) }
  }

  async getBlockNumber(signal?: AbortSignal) {
    const result = Number(await this.send<string>("eth_blockNumber", [], signal))
    if (!Number.isSafeInteger(result) || result < 0) throw new ChainReadError("invalid-response")
    return result
  }

  async getLogs(address: string | string[], topics: (string | string[] | null)[], from: number, to: number, signal?: AbortSignal): Promise<IndexedLog[]> {
    const logs = await this.send<Array<Record<string, unknown>>>("eth_getLogs", [{
      address, topics, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`,
    }], signal)
    if (!Array.isArray(logs)) throw new ChainReadError("invalid-response")
    const addresses = (Array.isArray(address) ? address : [address]).map(value => value.toLowerCase())
    return logs.filter(log => !log.removed).map(log => {
      const result = {
        address: String(log.address), topics: log.topics as string[], data: String(log.data),
        blockNumber: Number(log.blockNumber), blockHash: String(log.blockHash),
        transactionHash: String(log.transactionHash), index: Number(log.logIndex),
      }
      if (!addresses.includes(result.address.toLowerCase()) || !Number.isSafeInteger(result.blockNumber) || result.blockNumber < from || result.blockNumber > to ||
        !Number.isSafeInteger(result.index) || result.index < 0 || !Array.isArray(result.topics) ||
        !/^0x[\da-f]{40}$/i.test(result.address) || !/^0x[\da-f]*$/i.test(result.data) ||
        !/^0x[\da-f]{64}$/i.test(result.blockHash) || !/^0x[\da-f]{64}$/i.test(result.transactionHash) ||
        !result.topics.every(topic => /^0x[\da-f]{64}$/i.test(topic)) ||
        !topics.every((topic, i) => topic === null || (Array.isArray(topic) ? topic : [topic]).includes(result.topics[i]))) throw new ChainReadError("invalid-response")
      return result
    })
  }
}
