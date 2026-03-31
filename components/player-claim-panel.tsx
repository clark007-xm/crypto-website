"use client"

import { useState } from "react"
import { Gift, CheckCircle, AlertCircle } from "lucide-react"
import { useTransactionFlow } from "@/components/transaction-flow-provider"
import { useT } from "@/lib/i18n/context"
import { useWallet } from "@/lib/wallet/context"
import {
  SESSION_SETTLEMENT_TYPES,
  useClaimPrincipalAndCompensationIfCreatorAbsent,
  useClaimPrincipalAndPenalty,
  type SessionConfigFromEvent,
} from "@/lib/contracts/hooks"
import { formatEther, ZeroAddress } from "ethers"

interface PlayerClaimPanelProps {
  session: SessionConfigFromEvent
  playerTicketCount: number
}

// ETH to USDT rate for display
const ETH_USDT_RATE = 2500

export function PlayerClaimPanel({ session, playerTicketCount }: PlayerClaimPanelProps) {
  const t = useT()
  const { address, shortAddress, status } = useWallet()
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

  const isUnsoldSettled = session.settlementType === SESSION_SETTLEMENT_TYPES.UNSOLD_TICKETS
  const isCreatorAbsentSettled =
    session.settlementType === SESSION_SETTLEMENT_TYPES.CREATOR_ABSENT

  if ((!isUnsoldSettled && !isCreatorAbsentSettled) || playerTicketCount === 0) {
    return null
  }

  const isEth = session.paymentToken === ZeroAddress
  const ticketPriceNum = Number(formatEther(session.ticketPrice))
  const principalAmount = ticketPriceNum * playerTicketCount

  const slashBps = isCreatorAbsentSettled
    ? session.creatorAbsentPartnerDepositSlashBps
    : session.unsoldTicketsPartnerDepositSlashBps
  const compensationPerTicket = (ticketPriceNum * slashBps) / 10000
  const compensationAmount = compensationPerTicket * playerTicketCount
  const totalRefund = principalAmount + compensationAmount
  const totalRefundUsdt = totalRefund * ETH_USDT_RATE
  const loading = isCreatorAbsentSettled ? creatorAbsentLoading : unsoldLoading
  const error = isCreatorAbsentSettled ? creatorAbsentError : unsoldError
  const description = isCreatorAbsentSettled
    ? t.session.claimCreatorAbsentDesc
    : t.session.claimRefundDesc

  const handleClaim = async () => {
    if (!address || claimed) return

    const controller = transactionFlow.createController({
      chainId: session.chainId,
      fields: [
        { label: t.tx.account, value: shortAddress ?? address ?? "-", tone: "success" },
        { label: t.tx.action, value: t.session.claimNow },
        { label: t.tx.details, value: `${playerTicketCount} tickets` },
      ],
    })
    const result = isCreatorAbsentSettled
      ? await claimPrincipalAndCompensation(session.sessionAddress, controller.callbacks)
      : await claimPrincipalAndPenalty(session.sessionAddress, controller.callbacks)
    if (result) {
      setClaimed(true)
      setSuccess(true)
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
            <p className="font-bold text-lg">{playerTicketCount}</p>
          </div>
          <div className="bg-base-300/50 rounded-lg p-3">
            <p className="text-xs text-base-content/40">{t.session.principalAmount}</p>
            <p className="font-bold text-lg">
              {principalAmount.toFixed(4)} {isEth ? "ETH" : "TOKEN"}
            </p>
          </div>
          <div className="bg-base-300/50 rounded-lg p-3">
            <p className="text-xs text-base-content/40">{t.session.compensationAmount}</p>
            <p className="font-bold text-lg text-warning">
              +{compensationAmount.toFixed(4)} {isEth ? "ETH" : "TOKEN"}
            </p>
          </div>
          <div className="bg-base-300/50 rounded-lg p-3">
            <p className="text-xs text-base-content/40">{t.session.totalRefund}</p>
            <p className="font-bold text-lg text-primary">
              {totalRefund.toFixed(4)} {isEth ? "ETH" : "TOKEN"}
            </p>
            <p className="text-xs text-base-content/40">
              ~{totalRefundUsdt.toFixed(2)} USDT
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

        {/* Claim button */}
        {!claimed ? (
          <button
            className="btn btn-warning btn-block gap-2"
            onClick={handleClaim}
            disabled={!isConnected || loading}
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
