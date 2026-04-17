export interface LocalSessionProductInfoRecord {
  productInfoId: number
  savedAt: number
  creator?: string
  chainId?: number
}

function normalizeSessionAddress(sessionAddress: string) {
  return sessionAddress.toLowerCase()
}

function isLocalSessionProductInfoRecord(
  candidate: unknown
): candidate is LocalSessionProductInfoRecord {
  if (!candidate || typeof candidate !== "object") return false

  const record = candidate as Partial<LocalSessionProductInfoRecord>
  return (
    typeof record.productInfoId === "number" &&
    Number.isFinite(record.productInfoId) &&
    typeof record.savedAt === "number"
  )
}

export function saveLocalSessionProductInfo(
  sessionAddress: string,
  record: LocalSessionProductInfoRecord
) {
  if (typeof window === "undefined") return

  try {
    localStorage.setItem(
      `onetap_session_product_info_${normalizeSessionAddress(sessionAddress)}`,
      JSON.stringify(record)
    )
  } catch {
    // Ignore local storage failures to keep session creation non-blocking.
  }
}

export function loadLocalSessionProductInfo(
  sessionAddress: string,
  chainId?: number | null
) {
  if (typeof window === "undefined") return null

  try {
    const raw = localStorage.getItem(
      `onetap_session_product_info_${normalizeSessionAddress(sessionAddress)}`
    )
    if (!raw) return null

    const parsed = JSON.parse(raw) as unknown
    if (!isLocalSessionProductInfoRecord(parsed)) return null

    if (
      typeof chainId === "number" &&
      typeof parsed.chainId === "number" &&
      parsed.chainId !== chainId
    ) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}
