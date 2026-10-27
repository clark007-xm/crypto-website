import { isError } from "ethers"
import type { ContractTransactionResponse, TransactionResponse } from "ethers"
import type { TransactionLifecycleCallbacks } from "./types"

function isSameAction(original: TransactionResponse, replacement: TransactionResponse) {
  return original.from.toLowerCase() === replacement.from.toLowerCase() &&
    original.to?.toLowerCase() === replacement.to?.toLowerCase() &&
    original.data.toLowerCase() === replacement.data.toLowerCase() &&
    original.value === replacement.value && original.nonce === replacement.nonce &&
    original.chainId === replacement.chainId
}

/** A fee-only wallet acceleration confirms the same action under a new hash. */
export async function waitForConfirmation(
  transaction: ContractTransactionResponse,
  callbacks?: TransactionLifecycleCallbacks,
): Promise<ContractTransactionResponse> {
  try {
    const receipt = await transaction.wait()
    if (!receipt || receipt.status !== 1) throw new Error("Transaction was not confirmed successfully")
    return transaction
  } catch (error) {
    if (!isError(error, "TRANSACTION_REPLACED") || error.cancelled || error.reason !== "repriced" ||
      error.receipt.status !== 1 || !isSameAction(transaction, error.replacement)) throw error
    const replacement = error.replacement as ContractTransactionResponse
    callbacks?.onSubmitted?.(replacement)
    return replacement
  }
}
