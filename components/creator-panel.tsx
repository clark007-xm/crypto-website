"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle, Loader2, Settings } from "lucide-react"
import { useT } from "@/lib/i18n/context"
import { useWallet } from "@/lib/wallet/context"
import { useUnsoldSettlement, type SessionConfigFromEvent } from "@/lib/contracts/hooks"

interface CreatorPanelProps {
  session: SessionConfigFromEvent
  ticketsSold: number
}

export function CreatorPanel({ session, ticketsSold }: CreatorPanelProps) {
  const t = useT()
  const { address } = useWallet()
  const { finalizeUnsoldSettlement, loading, error } = useUnsoldSettlement()
  const [success, setSuccess] = useState(false)

  // Check if current user is the creator
  const isCreator = address?.toLowerCase() === session.creator.toLowerCase()

  // Check conditions for unsold settlement
  const now = Math.floor(Date.now() / 1000)
  const commitEnded = now > Number(session.commitDeadline)
  const totalTickets = Number(session.totalTickets)
  const hasUnsoldTickets = ticketsSold < totalTickets
  const unsoldCount = totalTickets - ticketsSold
  const slashRatioBps = session.unsoldTicketsPartnerDepositSlashBps
  const slashRatioPercent = (slashRatioBps / 100).toFixed(2)

  // Can finalize if: creator + commit ended + has unsold tickets
  const canFinalize = isCreator && commitEnded && hasUnsoldTickets

  const handleFinalize = async () => {
    if (!canFinalize) return
    setSuccess(false)
    const tx = await finalizeUnsoldSettlement(session.sessionAddress)
    if (tx) {
      setSuccess(true)
    }
  }

  // Don't show panel if not creator
  if (!isCreator) return null

  return (
    <div className="card bg-base-200 border border-warning/30">
      <div className="card-body gap-4">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-warning" />
          <h3 className="font-bold text-lg">{t.session.creatorPanel}</h3>
        </div>

        {/* Unsold Tickets Settlement */}
        <div className="bg-base-300/50 rounded-lg p-4 space-y-3">
          <h4 className="font-semibold">{t.session.unsoldSettlement}</h4>
          <p className="text-sm text-base-content/60">{t.session.unsoldSettlementDesc}</p>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-base-100/50 rounded p-2">
              <span className="text-base-content/50">{t.session.ticketsSold}</span>
              <p className="font-bold">{ticketsSold} / {totalTickets}</p>
            </div>
            <div className="bg-base-100/50 rounded p-2">
              <span className="text-base-content/50">{t.session.unsoldCount}</span>
              <p className="font-bold text-warning">{unsoldCount}</p>
            </div>
            <div className="bg-base-100/50 rounded p-2 col-span-2">
              <span className="text-base-content/50">{t.session.slashRatio}</span>
              <p className="font-bold">{slashRatioPercent}%</p>
            </div>
          </div>

          {/* Condition warnings */}
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

          {/* Success message */}
          {success && (
            <div className="alert alert-success py-2">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm">{t.session.finalizeSuccess}</span>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="alert alert-error py-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Finalize button */}
          <button
            className="btn btn-warning btn-block"
            onClick={handleFinalize}
            disabled={!canFinalize || loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.session.finalizing}
              </>
            ) : (
              t.session.finalizeUnsold
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
