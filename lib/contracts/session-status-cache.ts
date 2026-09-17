import type { SessionCatalogFromEvent, SessionConfigFromEvent } from "./hooks"
import type { IndexStorage } from "./log-index"

export function sessionStatusKey(scope: string, session: SessionCatalogFromEvent) {
  return `onetap:status:v1:${scope}:${session.sessionAddress.toLowerCase()}:${session.creationBlockHash ?? "unknown"}`
}
export async function readSessionStatus(storage: IndexStorage | undefined, scope: string, session: SessionCatalogFromEvent) {
  try {
    const cached = JSON.parse(await storage?.getItem(sessionStatusKey(scope, session)) ?? "null")
    if (!cached || !Number.isSafeInteger(cached.updatedAt) || cached.updatedAt > Date.now() || typeof cached.ticketsSold !== "string" ||
      !/^\d+$/.test(cached.ticketsSold) || typeof cached.isSettled !== "boolean" ||
      !Number.isInteger(cached.decimals) || cached.decimals < 0 || cached.decimals > 255 || typeof cached.symbol !== "string" ||
      ![null, 0, 1, 2].includes(cached.settlementType)) return null
    const value: SessionConfigFromEvent = { ...session, ticketsSold: BigInt(cached.ticketsSold), isSettled: cached.isSettled,
      settlementType: cached.settlementType, paymentTokenDecimals: cached.decimals, paymentTokenSymbol: cached.symbol }
    return { value, updatedAt: cached.updatedAt as number }
  } catch { return null }
}
export function writeSessionStatus(storage: IndexStorage | undefined, scope: string, session: SessionConfigFromEvent) {
  const cached = { ticketsSold: session.ticketsSold.toString(), isSettled: session.isSettled,
    settlementType: session.settlementType, decimals: session.paymentTokenDecimals, symbol: session.paymentTokenSymbol, updatedAt: Date.now() }
  try { void Promise.resolve(storage?.setItem(sessionStatusKey(scope, session), JSON.stringify(cached))).catch(() => {}) } catch { /* optional */ }
}
