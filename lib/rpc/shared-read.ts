import { ChainReadError, type ReadErrorKind } from "./read-client"

export interface SharedReadState<T> { value: T | null; loading: boolean; error: ReadErrorKind | null; updatedAt: number }
/** Subscribers share a read. The last owner leaving aborts the transport and queued work. */
export class SharedRead<T> {
  private state: SharedReadState<T> = { value: null, loading: false, error: null, updatedAt: 0 }
  private listeners = new Set<() => void>()
  private owners = 0
  private active?: { controller: AbortController; promise: Promise<void> }
  constructor(private read: (signal: AbortSignal) => Promise<T>) {}
  snapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(patch: Partial<SharedReadState<T>>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn()) }
  acquire() {
    this.owners++
    // Errors require an explicit retry; mounting another consumer does not restart a storm.
    if (!this.state.error && Date.now() - this.state.updatedAt > 15000) void this.refresh()
    return () => {
      if (--this.owners === 0 && this.active) {
        this.active.controller.abort(); this.active = undefined; this.publish({ loading: false })
      }
    }
  }
  refresh = (): Promise<void> => {
    if (!this.owners) return Promise.resolve()
    if (this.active) return this.active.promise
    const controller = new AbortController()
    const flight = { controller, promise: Promise.resolve() }
    this.active = flight; this.publish({ loading: true, error: null })
    flight.promise = Promise.resolve().then(() => { controller.signal.throwIfAborted(); return this.read(controller.signal) })
      .then(value => { if (this.active === flight) this.publish({ value, updatedAt: Date.now() }) })
      .catch(error => { if (this.active === flight && !controller.signal.aborted) this.publish({ error: error instanceof ChainReadError ? error.kind : "unavailable" }) })
      .finally(() => { if (this.active === flight) { this.active = undefined; this.publish({ loading: false }) } })
    return flight.promise
  }
}
