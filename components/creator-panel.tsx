"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle, Loader2, Settings } from "lucide-react"
import { useT } from "@/lib/i18n/context"
import { useWallet } from "@/lib/wallet/context"
import {
  SESSION_SETTLEMENT_TYPES,
  useCreatorAbsentSettlement,
  useUnsoldSettlement,
  type SessionConfigFromEvent,
} from "@/lib/contracts/hooks"

interface CreatorPanelProps {
  session: SessionConfigFromEvent
  ticketsSold: number
}

export function CreatorPanel({ session, ticketsSold }: CreatorPanelProps) {
  const t = useT()
  const { address } = useWallet()
  const {
    finalizeUnsoldSettlement,
    loading: unsoldLoading,
    error: unsoldError,
  } = useUnsoldSettlement()
  const {
    finalizeCreatorAbsentSettlement,
    loading: creatorAbsentLoading,
    error: creatorAbsentError,
  } = useCreatorAbsentSettlement()
  const [unsoldSuccess, setUnsoldSuccess] = useState(false)
  const [creatorAbsentSuccess, setCreatorAbsentSuccess] = useState(false)

  // Check if current user is the creator
  const isCreator = address?.toLowerCase() === session.creator.toLowerCase()
  const isAdmin = address?.toLowerCase() === session.admin.toLowerCase()

  const now = Math.floor(Date.now() / 1000)
  const commitEnded = now > Number(session.commitDeadline)
  const revealEnded = now > Number(session.revealDeadline)
  const totalTickets = Number(session.totalTickets)
  const hasUnsoldTickets = ticketsSold < totalTickets
  const allTicketsSold = ticketsSold >= totalTickets
  const unsoldCount = totalTickets - ticketsSold
  const slashRatioBps = session.unsoldTicketsPartnerDepositSlashBps
  const slashRatioPercent = (slashRatioBps / 100).toFixed(2)
  const creatorAbsentSlashRatioPercent = (session.creatorAbsentPartnerDepositSlashBps / 100).toFixed(2)

  const isUnsoldSettled = session.settlementType === SESSION_SETTLEMENT_TYPES.UNSOLD_TICKETS
  const isCreatorAbsentSettled =
    session.settlementType === SESSION_SETTLEMENT_TYPES.CREATOR_ABSENT
  const showUnsoldSection = isUnsoldSettled || (hasUnsoldTickets && !session.isSettled)
  const showCreatorAbsentSection =
    isCreatorAbsentSettled || (allTicketsSold && !session.isSettled)

  const canFinalizeUnsold = isCreator && !session.isSettled && commitEnded && hasUnsoldTickets
  const canFinalizeCreatorAbsent =
    isAdmin && !session.isSettled && allTicketsSold && revealEnded

  const handleFinalizeUnsold = async () => {
    if (!canFinalizeUnsold) return
    setUnsoldSuccess(false)
    const tx = await finalizeUnsoldSettlement(session.sessionAddress)
    if (tx) {
      setUnsoldSuccess(true)
    }
  }

  const handleFinalizeCreatorAbsent = async () => {
    if (!canFinalizeCreatorAbsent) return
    setCreatorAbsentSuccess(false)
    const tx = await finalizeCreatorAbsentSettlement(session.sessionAddress)
    if (tx) {
      setCreatorAbsentSuccess(true)
    }
  }

  if (!isCreator && !isAdmin) return null

  return (
    <div className="card bg-base-200 border border-warning/30">
      <div className="card-body gap-4">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-warning" />
          <h3 className="font-bold text-lg">{t.session.creatorPanel}</h3>
        </div>

        {showUnsoldSection && (
          <div className="bg-base-300/50 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold">{t.session.unsoldSettlement}</h4>
            <p className="text-sm text-base-content/60">{t.session.unsoldSettlementDesc}</p>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-base-100/50 rounded p-2">
                <span className="text-base-content/50">{t.session.ticketsSold}</span>
                <p className="font-bold">{ticketsSold} / {totalTickets}</p>
              </div>
              <div className="bg-base-100/50 rounded p-2">
                <span className="text-base-content/50">{t.session.unsoldCount}</span>
                <p className="font-bold text-warning">{Math.max(unsoldCount, 0)}</p>
              </div>
              <div className="bg-base-100/50 rounded p-2 col-span-2">
                <span className="text-base-content/50">{t.session.slashRatio}</span>
                <p className="font-bold">{slashRatioPercent}%</p>
              </div>
            </div>

            {!commitEnded && (
              <div className="alert alert-warning py-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">{t.session.commitNotEnded}</span>
              </div>
            )}
            {commitEnded && !hasUnsoldTickets && (
              <div className="alert alert-info py-2">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">{t.session.allTicketsSold}</span>
              </div>
            )}
            {(unsoldSuccess || isUnsoldSettled) && (
              <div className="alert alert-success py-2">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">{t.session.finalizeSuccess}</span>
              </div>
            )}
            {unsoldError && (
              <div className="alert alert-error py-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">{unsoldError}</span>
              </div>
            )}

            <button
              className="btn btn-warning btn-block"
              onClick={handleFinalizeUnsold}
              disabled={!canFinalizeUnsold || unsoldLoading}
            >
              {unsoldLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t.session.finalizing}
                </>
              ) : (
                t.session.finalizeUnsold
              )}
            </button>
          </div>
        )}

        {showCreatorAbsentSection && (
          <div className="bg-base-300/50 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold">{t.session.creatorAbsentSettlement}</h4>
            <p className="text-sm text-base-content/60">{t.session.creatorAbsentSettlementDesc}</p>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-base-100/50 rounded p-2">
                <span className="text-base-content/50">{t.session.ticketsSold}</span>
                <p className="font-bold">{ticketsSold} / {totalTickets}</p>
              </div>
              <div className="bg-base-100/50 rounded p-2">
                <span className="text-base-content/50">{t.session.slashRatio}</span>
                <p className="font-bold">{creatorAbsentSlashRatioPercent}%</p>
              </div>
            </div>

            {!revealEnded && !session.isSettled && (
              <div className="alert alert-warning py-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">{t.session.revealNotEnded}</span>
              </div>
            )}
            {(creatorAbsentSuccess || isCreatorAbsentSettled) && (
              <div className="alert alert-success py-2">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">{t.session.creatorAbsentFinalizeSuccess}</span>
              </div>
            )}
            {creatorAbsentError && (
              <div className="alert alert-error py-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">{creatorAbsentError}</span>
              </div>
            )}

            <button
              className="btn btn-warning btn-block"
              onClick={handleFinalizeCreatorAbsent}
              disabled={!canFinalizeCreatorAbsent || creatorAbsentLoading}
            >
              {creatorAbsentLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t.session.finalizing}
                </>
              ) : (
                t.session.finalizeCreatorAbsent
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
