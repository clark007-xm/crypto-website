import type { ContractTransactionResponse } from "ethers"

export interface TransactionLifecycleCallbacks {
  onAwaitingSignature?: () => void
  onSubmitted?: (tx: ContractTransactionResponse) => void
  onConfirmed?: (tx: ContractTransactionResponse) => void
  onError?: (error: unknown) => void
}
