import { Interface } from "ethers"
import { CONTRACT_ERROR_ABI } from "./abis"

const CONTRACT_ERROR_INTERFACE = new Interface(CONTRACT_ERROR_ABI)

export interface DecodedContractError {
  name: string
  signature: string
  args: readonly unknown[]
  data: string
}

function isHexErrorData(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{8,}$/.test(value)
}

function findErrorData(value: unknown, depth = 0): string | null {
  if (depth > 5 || value == null) return null
  if (isHexErrorData(value)) return value

  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    const priorityKeys = ["data", "error", "info", "cause", "revert", "payload"]

    for (const key of priorityKeys) {
      if (!(key in record)) continue
      const nested = findErrorData(record[key], depth + 1)
      if (nested) return nested
    }

    for (const nestedValue of Object.values(record)) {
      const nested = findErrorData(nestedValue, depth + 1)
      if (nested) return nested
    }
  }

  return null
}

export function extractContractErrorData(error: unknown): string | null {
  const directData = findErrorData(error)
  if (directData) return directData

  const message =
    typeof error === "string" ? error : error instanceof Error ? error.message : null
  if (!message) return null

  const matched = message.match(/data="?((0x[a-fA-F0-9]{8,}))"?/)
  return matched?.[1] ?? null
}

export function decodeContractError(error: unknown): DecodedContractError | null {
  const data = extractContractErrorData(error)
  if (!data) return null

  try {
    const parsed = CONTRACT_ERROR_INTERFACE.parseError(data)
    if (!parsed) return null

    return {
      name: parsed.name,
      signature: parsed.signature,
      args: Array.from(parsed.args ?? []),
      data,
    }
  } catch {
    return null
  }
}

export function isWalletRejectedError(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    const code = (error as { code?: unknown }).code
    if (code === 4001 || code === "ACTION_REJECTED") {
      return true
    }
  }

  const message =
    typeof error === "string" ? error.toLowerCase() : error instanceof Error ? error.message.toLowerCase() : ""
  return message.includes("user rejected") || message.includes("user denied")
}

export function getReadableContractErrorMessage(
  error: unknown,
  fallback = "The contract rejected this transaction."
) {
  if (isWalletRejectedError(error)) {
    return "Transaction rejected in wallet."
  }

  const decoded = decodeContractError(error)
  if (!decoded) {
    const message = typeof error === "string" ? error : error instanceof Error ? error.message : ""
    if (message.toLowerCase().includes("insufficient funds")) {
      return "Insufficient funds for gas or value."
    }
    return fallback
  }

  switch (decoded.name) {
    case "AlreadySettled":
      return "This session has already been settled."
    case "Unauthorized":
    case "NotPartner":
    case "NotAnAuthorizedPartner":
      return "This wallet is not allowed to perform this action."
    case "SoldOut":
      return "All tickets in this session have already been sold."
    case "TimeConstraintError":
    case "SessionStatusError":
      return "This action is not available at the current session stage."
    case "IncorrectETHAmount":
      return "The payment amount attached to this transaction is incorrect."
    case "InsufficientBalance":
      return "Insufficient balance to complete this action."
    case "InsufficientDeposit":
      return "Partner deposit is not sufficient for this action."
    case "NoTicketsOwned":
      return "This wallet does not own any tickets for the current session."
    case "InvalidAddress":
    case "InvalidAmount":
    case "InvalidBPS":
    case "InvalidZeroInput":
    case "ZeroAddress":
      return "One or more transaction parameters are invalid."
    case "InvalidReveal":
      return "The reveal secret does not match the commitment stored on-chain."
    case "ArrayLengthMismatch":
      return "Input array lengths do not match."
    case "SessionAlreadyRegistered":
      return "This session has already been registered."
    case "PartnerMismatch":
      return "The selected partner does not match the session configuration."
    case "WithdrawFailed":
      return "The on-chain withdrawal failed."
    case "AlreadyPartner":
      return "This address is already a partner."
    case "MissingCommitment":
      return "The required commitment has not been provided."
    case "FeeTooHigh":
      return "The configured fee is too high."
    default:
      return fallback
  }
}
