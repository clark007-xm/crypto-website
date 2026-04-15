"use client"

import { useState, useMemo } from "react"
import dynamic from "next/dynamic"
import { Clock, Users, Flame, ExternalLink } from "lucide-react"
import { useCountdown } from "@/hooks/use-countdown"
import { useT } from "@/lib/i18n/context"
import { useWallet } from "@/lib/wallet/context"
import { getSessionPhaseState, type SessionConfigFromEvent } from "@/lib/contracts/hooks"
import { getExplorerAddressUrl } from "@/lib/contracts/addresses"
import { getProductInfoLabel, getProductInfoShortLabel } from "@/lib/product-info"
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
  const phase = getSessionPhaseState(session.unlockTimestamp, session.commitDeadline, session.isSettled)

  // Calculate countdown from commitDeadline (memoize to prevent infinite re-renders)
  const endTimeMs = useMemo(() => {
    if (phase.isUpcoming && session.unlockTimestamp > 0n) {
      return Number(session.unlockTimestamp) * 1000
    }
    if (phase.isCommitPhaseActive && session.commitDeadline > 0n) {
      return Number(session.commitDeadline) * 1000
    }
    return Date.now() + 60000
  }, [phase.isUpcoming, phase.isCommitPhaseActive, session.unlockTimestamp, session.commitDeadline])
  const { days, hours, minutes, seconds } = useCountdown(endTimeMs)

  // Determine if using ETH or ERC20 token
  const isEth = session.paymentToken === ZeroAddress
  const productLabel = getProductInfoLabel(session.productInfoId)
  const productShortLabel = getProductInfoShortLabel(session.productInfoId)

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

  const isSettled = session.isSettled

  // Short session address for display
  const shortAddress = `${session.sessionAddress.slice(0, 6)}...${session.sessionAddress.slice(-4)}`

  const isHot = progress > 70
  const tags = [
    phase.isCommitPhaseActive
      ? {
          label: t.products.buying,
          className: "border-success/25 bg-success/10 text-success",
        }
      : phase.isUpcoming && !isSettled
        ? {
            label: t.session.notStarted,
            className: "border-info/25 bg-info/10 text-info",
          }
        : phase.isRevealPhase && !isSettled
          ? {
              label: t.products.revealing,
              className: "border-warning/25 bg-warning/10 text-warning",
            }
          : isSettled
            ? {
                label: t.products.settled,
                className: "border-base-content/10 bg-base-300/80 text-base-content/70",
              }
            : null,
    isHot
      ? {
          label: "HOT",
          className: "border-error/25 bg-error/10 text-error",
          icon: Flame,
        }
      : null,
  ].filter(Boolean) as Array<{
    label: string
    className: string
    icon?: typeof Flame
  }>

  return (
    <div className="card bg-base-200 border border-base-content/5 hover:border-primary/30 transition-all duration-300 group">
      <div className="card-body gap-3 sm:gap-4 p-4 sm:p-6">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="avatar placeholder">
              <div className="bg-gradient-to-br from-primary/20 to-secondary/20 rounded-xl w-11 h-11">
                <span className="text-sm font-bold text-primary">{productShortLabel}</span>
              </div>
            </div>
            <div className="min-w-0">
              <h3 className="card-title text-base font-bold">
                {productLabel}
              </h3>
              <Link 
                href={getExplorerAddressUrl(session.chainId, session.sessionAddress)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex max-w-full items-center gap-1 text-xs text-base-content/40 hover:text-primary"
              >
                {shortAddress}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
          <div className="ml-3 flex max-w-[148px] shrink-0 flex-wrap justify-end gap-1.5 self-start">
            {tags.map((tag) => {
              const Icon = tag.icon
              return (
                <div
                  key={tag.label}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold tracking-[0.02em] whitespace-nowrap shadow-sm ${tag.className}`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  <span>{tag.label}</span>
                </div>
              )
            })}
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
        ) : phase.isRevealPhase ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <span className="badge badge-warning">{t.products.revealing}</span>
          </div>
        ) : phase.isUpcoming ? (
          <div className="flex items-center justify-center gap-2">
            <Clock className="h-3.5 w-3.5 text-base-content/40" />
            <span className="text-xs text-base-content/40">{t.session.notStarted}</span>
            <div className="flex items-center gap-1 font-display text-sm">
              {days > 0 && (
                <>
                  <span className="bg-base-300 rounded px-2 py-0.5 text-info font-bold tabular-nums">
                    {days}{t.create.days}
                  </span>
                  <span className="text-base-content/20 font-bold">:</span>
                </>
              )}
              <span className="bg-base-300 rounded px-2 py-0.5 text-info font-bold tabular-nums">
                {String(hours).padStart(2, "0")}
              </span>
              <span className="text-base-content/20 font-bold">:</span>
              <span className="bg-base-300 rounded px-2 py-0.5 text-info font-bold tabular-nums">
                {String(minutes).padStart(2, "0")}
              </span>
              <span className="text-base-content/20 font-bold">:</span>
              <span className="bg-base-300 rounded px-2 py-0.5 text-info font-bold tabular-nums">
                {String(seconds).padStart(2, "0")}
              </span>
            </div>
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
