"use client"

import { useEffect, useState } from "react"
import { useRpc } from "@/lib/rpc/context"
import { useTransactionScope } from "@/lib/transactions/use-transaction-scope"
import { getRefundKind } from "@/lib/contracts/refund-eligibility"
import { Gift, CheckCircle, AlertCircle } from "lucide-react"
import { SessionNetworkNotice, useSessionWriteAccess } from "@/components/session-network-notice"
import { useTransactionFlow } from "@/components/transaction-flow-provider"
import { useT } from "@/lib/i18n/context"
import { useWallet } from "@/lib/wallet/context"
import {
  useClaimPrincipalAndCompensationIfCreatorAbsent,
  useClaimPrincipalAndPenalty,
  type SessionConfigFromEvent,
} from "@/lib/contracts/hooks"
import { formatTokenAmount, getPaymentTokenSymbol } from "@/lib/token-format"

interface PlayerClaimPanelProps {
  session: SessionConfigFromEvent
  playerTicketCount: bigint | number
  onClaimSuccess?: () => Promise<void> | void
}

export function PlayerClaimPanel(props: PlayerClaimPanelProps) {
  const wallet = useWallet()
  const { chain } = useRpc()
  const scopeKey = `${wallet.status}:${wallet.address?.toLowerCase()}:${wallet.chainId}:${chain}:${props.session.chainId}:${props.session.sessionAddress.toLowerCase()}`
  const captureScope = useTransactionScope(scopeKey)
  return <PlayerClaimPanelContent key={scopeKey} {...props} captureScope={captureScope} />
}

export function PlayerClaimPanelContent({ session, playerTicketCount, onClaimSuccess, captureScope }: PlayerClaimPanelProps & { captureScope: () => () => boolean }) {
  const t = useT()
  const { address, shortAddress, status } = useWallet()
  const writeAccess = useSessionWriteAccess(session.chainId)
  const transactionFlow = useTransactionFlow()
  const {
    claimPrincipalAndPenalty,
    loading: unsoldLoading,
    error: unsoldError,
  } = useClaimPrincipalAndPenalty()
  const {
    claimPrincipalAndCompensation,
    loading: creatorAbsentLoading,
    error: creatorAbsentError,
  } = useClaimPrincipalAndCompensationIfCreatorAbsent()
  const [claimed, setClaimed] = useState(false)
  const [success, setSuccess] = useState(false)

  const [nowSeconds, setNowSeconds] = useState(() => BigInt(Math.floor(Date.now() / 1000)))
  const ticketCount = BigInt(playerTicketCount)
  const refundKind = getRefundKind(session, ticketCount, nowSeconds)
  const deadline = session.ticketsSold < session.totalTickets ? session.commitDeadline : session.revealDeadline
  useEffect(() => {
    const tick = () => setNowSeconds(BigInt(Math.floor(Date.now() / 1000)))
    tick()
    if (session.isSettled) return
    const remaining = Number(deadline * 1000n + 1000n) - Date.now()
    if (remaining <= 0) return
    const timer = setTimeout(tick, Math.min(remaining, 2_147_483_647))
    return () => clearTimeout(timer)
  }, [deadline, session.isSettled, nowSeconds])

  if (!refundKind || ticketCount === 0n) {
    return null
  }

  const tokenSymbol = getPaymentTokenSymbol(
    session.paymentToken,
    session.paymentTokenSymbol
  )
  const principalAmountWei = session.ticketPrice * ticketCount

  const isCreatorAbsent = refundKind === "creator-absent"
  const slashBps = isCreatorAbsent
    ? session.creatorAbsentPartnerDepositSlashBps
    : session.unsoldTicketsPartnerDepositSlashBps
  // The contract floors each ticket's compensation before multiplying by ticket count.
  const compensationPerTicketWei = (session.ticketPrice * BigInt(slashBps)) / 10000n
  const compensationAmountWei = compensationPerTicketWei * ticketCount
  const totalRefundWei = principalAmountWei + compensationAmountWei
  const loading = isCreatorAbsent ? creatorAbsentLoading : unsoldLoading
  const error = isCreatorAbsent ? creatorAbsentError : unsoldError
  const description = isCreatorAbsent
    ? t.session.claimCreatorAbsentDesc
    : t.session.claimRefundDesc

  const handleClaim = async () => {
    if (!address || claimed || !writeAccess.canWrite) return
    const isCurrent = captureScope()

    const controller = transactionFlow.createController({
      chainId: session.chainId,
      fields: [
        { label: t.tx.account, value: shortAddress ?? address ?? "-", tone: "success" },
        { label: t.tx.action, value: t.session.claimNow },
        { label: t.tx.details, value: `${playerTicketCount} tickets` },
      ],
    })
    const result = isCreatorAbsent
      ? await claimPrincipalAndCompensation(session.sessionAddress, session.chainId, controller.callbacks)
      : await claimPrincipalAndPenalty(session.sessionAddress, session.chainId, controller.callbacks)
    if (result && isCurrent()) {
      setClaimed(true)
      setSuccess(true)
      await onClaimSuccess?.()
    }
  }

  const isConnected = status === "connected"

  return (
    <div className="card bg-base-200 border border-warning/30">
      <div className="card-body gap-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-warning/20">
            <Gift className="h-5 w-5 text-warning" />
          </div>
          <div>
            <h3 className="font-bold text-lg">{t.session.claimRefundPanel}</h3>
            <p className="text-sm text-base-content/60">{description}</p>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-base-300/50 rounded-lg p-3">
            <p className="text-xs text-base-content/40">{t.session.yourTickets}</p>
            <p className="font-bold text-lg">{ticketCount.toString()}</p>
          </div>
          <div className="bg-base-300/50 rounded-lg p-3">
            <p className="text-xs text-base-content/40">{t.session.principalAmount}</p>
            <p className="font-bold text-lg">
              {formatTokenAmount(principalAmountWei, session.paymentTokenDecimals, tokenSymbol)}
            </p>
          </div>
          <div className="bg-base-300/50 rounded-lg p-3">
            <p className="text-xs text-base-content/40">{t.session.compensationAmount}</p>
            <p className="font-bold text-lg text-warning">
              +{formatTokenAmount(compensationAmountWei, session.paymentTokenDecimals, tokenSymbol)}
            </p>
          </div>
          <div className="bg-base-300/50 rounded-lg p-3">
            <p className="text-xs text-base-content/40">{t.session.totalRefund}</p>
            <p className="font-bold text-lg text-primary">
              {formatTokenAmount(totalRefundWei, session.paymentTokenDecimals, tokenSymbol)}
            </p>
          </div>
        </div>

        {/* Success message */}
        {success && (
          <div className="alert alert-success">
            <CheckCircle className="h-5 w-5" />
            <span>{t.session.claimSuccess}</span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="alert alert-error">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        )}

        <SessionNetworkNotice chainId={session.chainId} />
        {/* Claim button */}
        {!claimed ? (
          <button
            className="btn btn-warning btn-block gap-2"
            onClick={handleClaim}
            disabled={!writeAccess.canWrite || loading}
          >
            {loading ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                {t.session.claiming}
              </>
            ) : (
              <>
                <Gift className="h-4 w-4" />
                {isConnected ? t.session.claimNow : t.session.connectToBuy}
              </>
            )}
          </button>
        ) : (
          <div className="btn btn-disabled btn-block gap-2">
            <CheckCircle className="h-4 w-4" />
            {t.session.alreadyClaimed}
          </div>
        )}
      </div>
    </div>
  )
}
