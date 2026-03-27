"use client"

import { useState, useMemo } from "react"
import dynamic from "next/dynamic"
import { Clock, Users, Flame, ExternalLink } from "lucide-react"
import { useCountdown } from "@/hooks/use-countdown"
import { useT } from "@/lib/i18n/context"
import { useWallet } from "@/lib/wallet/context"
import { type SessionConfigFromEvent } from "@/lib/contracts/hooks"
import { getExplorerAddressUrl } from "@/lib/contracts/addresses"
import { formatEther, ZeroAddress } from "ethers"
import Link from "next/link"

const ConnectModal = dynamic(
  () => import("./connect-modal").then((mod) => mod.ConnectModal)
)

interface SessionCardProps {
  session: SessionConfigFromEvent
}

// ETH to USDT rate for display
const ETH_USDT_RATE = 2500

export function SessionCard({ session }: SessionCardProps) {
  const t = useT()
  const { status } = useWallet()
  const [modalOpen, setModalOpen] = useState(false)

  // Calculate countdown from commitDeadline (memoize to prevent infinite re-renders)
  const endTimeMs = useMemo(() => {
    return session.commitDeadline > 0n
      ? Number(session.commitDeadline) * 1000
      : Date.now() + 60000
  }, [session.commitDeadline])
  const { days, hours, minutes, seconds } = useCountdown(endTimeMs)

  // Determine if using ETH or ERC20 token
  const isEth = session.paymentToken === ZeroAddress

  // Format price - currently all tokens use 18 decimals (ETH and test ERC20)
  // TODO: Add proper decimal detection when supporting real USDT (6 decimals)
  const ticketPriceNum = Number(formatEther(session.ticketPrice))
  
  const totalTickets = Number(session.totalTickets)
  const ticketsSold = Number(session.ticketsSold)
  const progress = totalTickets > 0 ? (ticketsSold / totalTickets) * 100 : 0
  const remaining = totalTickets - ticketsSold
  
  // Calculate pool value
  const totalPoolValue = ticketPriceNum * totalTickets
  const totalPoolUsdt = totalPoolValue * ETH_USDT_RATE

  // Check if commit phase is over
  const now = Math.floor(Date.now() / 1000)
  const isSettled = session.isSettled
  const isCommitPhaseActive = !isSettled && now < Number(session.commitDeadline)

  // Short session address for display
  const shortAddress = `${session.sessionAddress.slice(0, 6)}...${session.sessionAddress.slice(-4)}`

  const isHot = progress > 70

  return (
    <div className="card bg-base-200 border border-base-content/5 hover:border-primary/30 transition-all duration-300 group">
      <div className="card-body gap-3 sm:gap-4 p-4 sm:p-6">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="avatar placeholder">
              <div className="bg-gradient-to-br from-primary/20 to-secondary/20 rounded-xl w-11 h-11">
                <span className="text-sm font-bold text-primary">{isEth ? "ETH" : "TKN"}</span>
              </div>
            </div>
            <div>
              <h3 className="card-title text-base font-bold">
                {isEth ? t.products.ethPool : t.products.tokenPool}
              </h3>
              <Link 
                href={getExplorerAddressUrl(session.chainId, session.sessionAddress)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-base-content/40 hover:text-primary flex items-center gap-1"
              >
                {shortAddress}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {isCommitPhaseActive && (
              <div className="badge badge-success badge-sm font-bold">
                {t.products.buying}
              </div>
            )}
            {!isCommitPhaseActive && !isSettled && (
              <div className="badge badge-warning badge-sm font-bold">
                {t.products.revealing}
              </div>
            )}
            {isSettled && (
              <div className="badge badge-neutral badge-sm font-bold">
                {t.products.settled}
              </div>
            )}
            {isHot && (
              <div className="badge badge-error badge-sm gap-1 font-bold">
                <Flame className="h-3 w-3" />
                HOT
              </div>
            )}
          </div>
        </div>

        {/* Prize value highlight */}
        <div className="bg-base-300/60 rounded-xl p-3 sm:p-4 text-center border border-base-content/5">
          <p className="text-xs text-base-content/40 mb-1">{t.products.prizeValue}</p>
          <p className="text-xl sm:text-2xl font-bold text-primary font-display">
            {totalPoolValue.toFixed(4)} {isEth ? "ETH" : "TOKEN"}
          </p>
          <p className="text-xs text-base-content/40 mt-1">
            {ticketPriceNum.toFixed(4)} {isEth ? "ETH" : "TOKEN"} / {t.products.ticket}
            <span className="ml-1">(~{totalPoolUsdt.toFixed(2)} USDT)</span>
          </p>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs mb-2">
            <span className="text-base-content/50">{t.products.progress}</span>
            <span className="text-primary font-semibold">{progress.toFixed(1)}%</span>
          </div>
          <progress
            className="progress progress-primary w-full"
            value={ticketsSold}
            max={totalTickets}
          />
          <div className="flex justify-between text-xs mt-2">
            <span className="text-base-content/40 flex items-center gap-1">
              <Users className="h-3 w-3" />
              {ticketsSold.toLocaleString()} {t.products.participated}
            </span>
            <span className="text-accent font-medium">
              {t.products.remaining.replace("{n}", remaining.toLocaleString())}
            </span>
          </div>
        </div>

        {/* Countdown or Status */}
        {isSettled ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <span className="badge badge-success">{t.products.settled}</span>
          </div>
        ) : !isCommitPhaseActive ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <span className="badge badge-warning">{t.products.revealing}</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <Clock className="h-3.5 w-3.5 text-base-content/40" />
            <span className="text-xs text-base-content/40">{t.products.countdown}</span>
            <div className="flex items-center gap-1 font-display text-sm">
              {days > 0 && (
                <>
                  <span className="bg-base-300 rounded px-2 py-0.5 text-primary font-bold tabular-nums">
                    {days}{t.create.days}
                  </span>
                  <span className="text-base-content/20 font-bold">:</span>
                </>
              )}
              <span className="bg-base-300 rounded px-2 py-0.5 text-primary font-bold tabular-nums">
                {String(hours).padStart(2, "0")}
              </span>
              <span className="text-base-content/20 font-bold">:</span>
              <span className="bg-base-300 rounded px-2 py-0.5 text-primary font-bold tabular-nums">
                {String(minutes).padStart(2, "0")}
              </span>
              <span className="text-base-content/20 font-bold">:</span>
              <span className="bg-base-300 rounded px-2 py-0.5 text-primary font-bold tabular-nums">
                {String(seconds).padStart(2, "0")}
              </span>
            </div>
          </div>
        )}

        {/* Action button */}
        <Link
          href={`/session/${session.sessionAddress}`}
          className="btn btn-primary btn-block gap-2 group-hover:shadow-lg group-hover:shadow-primary/25 transition-shadow"
          onClick={(e) => {
            if (status !== "connected") {
              e.preventDefault()
              setModalOpen(true)
            }
          }}
        >
          {isSettled ? t.products.viewResult : t.products.join}
        </Link>
        {modalOpen && (
          <ConnectModal open={modalOpen} onClose={() => setModalOpen(false)} />
        )}
      </div>
    </div>
  )
}
