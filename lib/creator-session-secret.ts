import { ZeroHash, keccak256, solidityPackedKeccak256, toUtf8Bytes } from "ethers"

export interface LocalCreatorSecretRecord {
  secret: string
  commitment: string
  savedAt: number
  creator?: string
  chainId?: number
}

function normalizeSessionAddress(sessionAddress: string) {
  return sessionAddress.toLowerCase()
}

function normalizeSecret(secret: string) {
  return secret.trim()
}

function isLocalCreatorSecretRecord(candidate: unknown): candidate is LocalCreatorSecretRecord {
  if (!candidate || typeof candidate !== "object") return false

  const record = candidate as Partial<LocalCreatorSecretRecord>
  return (
    typeof record.secret === "string" &&
    typeof record.commitment === "string" &&
    typeof record.savedAt === "number"
  )
}

export function computeCreatorCommitment(secret: string) {
  const normalizedSecret = normalizeSecret(secret)
  if (!normalizedSecret) return ""
  return solidityPackedKeccak256(
    ["bytes", "bytes32"],
    [toUtf8Bytes(normalizedSecret), ZeroHash]
  )
}

export function computeCreatorRevealCommitmentCandidates(secret: string) {
  const normalizedSecret = normalizeSecret(secret)
  if (!normalizedSecret) return []

  const revealData = toUtf8Bytes(normalizedSecret)
  return Array.from(
    new Set([
      solidityPackedKeccak256(["bytes", "bytes32"], [revealData, ZeroHash]).toLowerCase(),
      keccak256(revealData).toLowerCase(),
    ])
  )
}

export function getCreatorCommitmentMatchType(secret: string, sessionCommitment: string) {
  const normalizedCommitment = sessionCommitment.trim().toLowerCase()
  if (!normalizedCommitment) return "none" as const

  const normalizedSecret = normalizeSecret(secret)
  if (!normalizedSecret) return "none" as const

  const revealData = toUtf8Bytes(normalizedSecret)
  const currentCommitment = solidityPackedKeccak256(
    ["bytes", "bytes32"],
    [revealData, ZeroHash]
  ).toLowerCase()
  if (currentCommitment === normalizedCommitment) {
    return "current" as const
  }

  const legacyCommitment = keccak256(revealData).toLowerCase()
  if (legacyCommitment === normalizedCommitment) {
    return "legacy" as const
  }

  return "none" as const
}

export function doesCreatorSecretMatchCommitment(secret: string, sessionCommitment: string) {
  return getCreatorCommitmentMatchType(secret, sessionCommitment) !== "none"
}

export function buildCreatorRevealPayload(secret: string) {
  const normalizedSecret = normalizeSecret(secret)
  if (!normalizedSecret) return null

  return {
    normalizedSecret,
    revealData: toUtf8Bytes(normalizedSecret),
    salt: ZeroHash,
  }
}

export function saveLocalCreatorSecret(
  sessionAddress: string,
  record: LocalCreatorSecretRecord
) {
  if (typeof window === "undefined") return

  try {
    localStorage.setItem(
      `onetap_creator_secret_${normalizeSessionAddress(sessionAddress)}`,
      JSON.stringify(record)
    )
  } catch {
    // Ignore local storage failures to avoid blocking session creation UX.
  }
}

export function loadLocalCreatorSecret(
  sessionAddress: string,
  creatorAddress: string | null
): LocalCreatorSecretRecord | null {
  if (typeof window === "undefined") return null

  try {
    const raw = localStorage.getItem(
      `onetap_creator_secret_${normalizeSessionAddress(sessionAddress)}`
    )
    if (!raw) return null

    const parsed = JSON.parse(raw) as unknown
    if (!isLocalCreatorSecretRecord(parsed)) return null

    if (
      creatorAddress &&
      parsed.creator &&
      parsed.creator.toLowerCase() !== creatorAddress.toLowerCase()
    ) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}
