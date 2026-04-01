import type { SessionPurchaseRecord } from "@/lib/contracts/hooks"

export interface LocalPurchaseRecord {
  secret: string
  commitment: string
  quantity: number
  timestamp: number
  txHash?: string
  useBalance?: boolean
  ticketPriceWei?: string
  paymentToken?: string
  buyer?: string
}

export type PurchaseHistoryWithLocal<T extends SessionPurchaseRecord = SessionPurchaseRecord> = T & {
  localDetails: LocalPurchaseRecord | null
}

function parseLocalPurchaseRecord(
  item: unknown,
  buyerAddress: string | null
): item is LocalPurchaseRecord {
  if (!item || typeof item !== "object") return false
  const candidate = item as Partial<LocalPurchaseRecord>
  if (typeof candidate.secret !== "string") return false
  if (typeof candidate.commitment !== "string") return false
  if (typeof candidate.quantity !== "number") return false
  if (candidate.buyer && buyerAddress) {
    return candidate.buyer.toLowerCase() === buyerAddress.toLowerCase()
  }
  return true
}

function parseStoredLocalPurchaseRecords(
  raw: string,
  buyerAddress: string | null
): LocalPurchaseRecord[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item): item is LocalPurchaseRecord => parseLocalPurchaseRecord(item, buyerAddress))
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
  } catch {
    return []
  }
}

export function loadLocalPurchaseRecords(
  sessionAddress: string,
  buyerAddress: string | null
): LocalPurchaseRecord[] {
  if (typeof window === "undefined") return []

  try {
    const raw = localStorage.getItem(`onetap_secrets_${sessionAddress}`)
    if (!raw) return []
    return parseStoredLocalPurchaseRecords(raw, buyerAddress)
  } catch {
    return []
  }
}

export function loadAllLocalPurchaseRecords(
  buyerAddress: string | null
): Record<string, LocalPurchaseRecord[]> {
  if (typeof window === "undefined") return {}

  const sessionRecords: Record<string, LocalPurchaseRecord[]> = {}

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key || !key.startsWith("onetap_secrets_")) continue

      const raw = localStorage.getItem(key)
      if (!raw) continue

      const sessionAddress = key.replace("onetap_secrets_", "").toLowerCase()
      const records = parseStoredLocalPurchaseRecords(raw, buyerAddress)
      if (records.length > 0) {
        sessionRecords[sessionAddress] = records
      }
    }
  } catch {
    return {}
  }

  return sessionRecords
}

function matchLocalPurchaseRecord(
  record: SessionPurchaseRecord,
  localRecords: LocalPurchaseRecord[],
  usedIndexes: Set<number>
) {
  const txHash = record.transactionHash.toLowerCase()
  const exactTxIndex = localRecords.findIndex(
    (item, index) => !usedIndexes.has(index) && item.txHash?.toLowerCase() === txHash
  )
  if (exactTxIndex >= 0) {
    usedIndexes.add(exactTxIndex)
    return localRecords[exactTxIndex]
  }

  const recordTimestampMs = record.blockTimestamp * 1000
  const quantity = Number(record.quantity)
  const candidates = localRecords
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => !usedIndexes.has(index) && item.quantity === quantity)
    .sort((a, b) => {
      const aDiff = Math.abs((a.item.timestamp ?? 0) - recordTimestampMs)
      const bDiff = Math.abs((b.item.timestamp ?? 0) - recordTimestampMs)
      return aDiff - bDiff
    })

  if (candidates.length === 0) return null

  usedIndexes.add(candidates[0].index)
  return candidates[0].item
}

export function mergePurchaseHistory<T extends SessionPurchaseRecord>(
  chainRecords: T[],
  localRecords: LocalPurchaseRecord[]
): PurchaseHistoryWithLocal<T>[] {
  const usedIndexes = new Set<number>()

  return chainRecords.map((record) => ({
    ...record,
    localDetails: matchLocalPurchaseRecord(record, localRecords, usedIndexes),
  }))
}

export function formatTicketRange(firstTicketIndex: bigint, lastTicketIndex: bigint) {
  if (firstTicketIndex === lastTicketIndex) {
    return `#${firstTicketIndex.toString()}`
  }
  return `#${firstTicketIndex.toString()} - #${lastTicketIndex.toString()}`
}

export function shortHash(hash: string) {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`
}

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}
