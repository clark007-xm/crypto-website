"use client"

import { useState } from "react"
import { Gift, CheckCircle, AlertCircle } from "lucide-react"
import { useT } from "@/lib/i18n/context"
import { useWallet } from "@/lib/wallet/context"
import { useClaimPrincipalAndPenalty, type SessionConfigFromEvent } from "@/lib/contracts/hooks"
import { formatEther, ZeroAddress } from "ethers"

interface PlayerClaimPanelProps {
  session: SessionConfigFromEvent
  playerTicketCount: number
  isUnsoldSettled: boolean // True if finalizeTicketsUnsoldSettlement has been called
}

// ETH to USDT rate for display
const ETH_USDT_RATE = 2500

export function PlayerClaimPanel({ 
  session, 
  playerTicketCount,
  isUnsoldSettled 
}: PlayerClaimPanelProps) {
  const t = useT()
  const { address, status } = useWallet()
  const { claimPrincipalAndPenalty, loading, error } = useClaimPrincipalAndPenalty()
  const [claimed, setClaimed] = useState(false)
  const [success, setSuccess] = useState(false)

  // Only show if player has tickets and session is in unsold settlement state
  if (!isUnsoldSettled || playerTicketCount === 0) {
    return null
  }

  // Calculate amounts
  const isEth = session.paymentToken === ZeroAddress
  const ticketPriceNum = Number(formatEther(session.ticketPrice))
  const principalAmount = ticketPriceNum * playerTicketCount
  
  // Compensation from creator deposit
  // Based on unsoldTicketsPartnerDepositSlashBps (basis points)
  const slashBps = session.unsoldTicketsPartnerDepositSlashBps
  const totalTickets = Number(session.totalTickets)
  const ticketsSold = playerTicketCount // Approximate - actual would need on-chain data
  
  // Simplified compensation calculation
  // Actual calculation depends on total slashed amount / tickets sold
  const compensationPerTicket = (ticketPriceNum * slashBps) / 10000
  const compensationAmount = compensationPerTicket * playerTicketCount
  
  const totalRefund = principalAmount + compensationAmount
  const totalRefundUsdt = totalRefund * ETH_USDT_RATE

  const handleClaim = async () => {
    if (!address || claimed) return
    
    const result = await claimPrincipalAndPenalty(session.sessionAddress)
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
            <p className="text-sm text-base-content/60">{t.session.claimRefundDesc}</p>
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
