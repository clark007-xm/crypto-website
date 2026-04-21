"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { ArrowLeft, Clock, ExternalLink, Ticket } from "lucide-react"
import { formatEther, ZeroAddress } from "ethers"
import Link from "next/link"

import { useT } from "@/lib/i18n/context"
import {
  getSessionPhaseState,
  SESSION_SETTLEMENT_TYPES,
  usePlayerTickets,
  useSessionInfo,
} from "@/lib/contracts/hooks"
import { getExplorerAddressUrl } from "@/lib/contracts/addresses"
import { loadLocalSessionProductInfo } from "@/lib/local-session-product-info"
import { getProductInfoLabel, getProductInfoShortLabel } from "@/lib/product-info"
import { useCountdown } from "@/hooks/use-countdown"
import { BuyModal } from "@/components/buy-modal"
import { CreatorPanel } from "@/components/creator-panel"
import { PlayerClaimPanel } from "@/components/player-claim-panel"
import { SessionTreasuryCard } from "@/components/session-treasury-card"

// ETH to USDT rate for display
const ETH_USDT_RATE = 2500

function SessionPurchaseHistorySkeleton() {
  return (
    <div className="card mt-6 border border-base-content/5 bg-base-200">
      <div className="card-body gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-base-300 animate-pulse" />
            <div className="space-y-2">
              <div className="h-5 w-28 rounded bg-base-300 animate-pulse" />
              <div className="h-4 w-56 rounded bg-base-300/80 animate-pulse" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-24 rounded-full bg-base-300 animate-pulse" />
            <div className="h-8 w-24 rounded-full bg-base-300 animate-pulse" />
          </div>
        </div>

        <div className="space-y-3">
          <div className="h-20 rounded-2xl bg-base-300/80 animate-pulse" />
          <div className="h-20 rounded-2xl bg-base-300/70 animate-pulse" />
        </div>
      </div>
    </div>
  )
}

const SessionPurchaseHistory = dynamic(
  () =>
    import("@/components/session-purchase-history").then(
      (module) => module.SessionPurchaseHistory
    ),
  {
    ssr: false,
    loading: () => <SessionPurchaseHistorySkeleton />,
  }
)

export default function SessionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sessionAddress = params.address as string
  const t = useT()
  const shortAddress = `${sessionAddress.slice(0, 6)}...${sessionAddress.slice(-4)}`
  
  const {
    info: resolvedSession,
    loading: sessionLoading,
    refresh: refreshSessionInfo,
  } = useSessionInfo(sessionAddress)
  const { tickets: playerTicketCount, refresh: refreshPlayerTickets } = usePlayerTickets(sessionAddress)
  const [resolvedProductInfoId, setResolvedProductInfoId] = useState(0)
  
  // Buy modal state
  const [buyModalOpen, setBuyModalOpen] = useState(false)
  const [purchaseHistoryRefreshNonce, setPurchaseHistoryRefreshNonce] = useState(0)
  const phase = resolvedSession
    ? getSessionPhaseState(
        resolvedSession.unlockTimestamp,
        resolvedSession.commitDeadline,
        resolvedSession.isSettled
      )
    : null

  useEffect(() => {
    if (!resolvedSession) {
      setResolvedProductInfoId(0)
      return
    }

    const chainValue = Number(resolvedSession.productInfoId ?? 0)
    if (chainValue > 0) {
      setResolvedProductInfoId(chainValue)
      return
    }

    const localRecord = loadLocalSessionProductInfo(
      resolvedSession.sessionAddress,
      resolvedSession.chainId
    )
    setResolvedProductInfoId(localRecord?.productInfoId ?? 0)
  }, [resolvedSession])
  
  // Countdown
  const countdownTarget =
    resolvedSession && phase
      ? phase.isUpcoming
        ? resolvedSession.unlockTimestamp
        : phase.isCommitPhaseActive
          ? resolvedSession.commitDeadline
          : 0n
      : 0n
  const endTimeMs = useMemo(() => {
    return countdownTarget > 0n
      ? Number(countdownTarget) * 1000
      : Date.now() + 60000
  }, [countdownTarget])
  const { days, hours, minutes, seconds } = useCountdown(endTimeMs)
  
  // Calculate values
  const isEth = resolvedSession?.paymentToken === ZeroAddress
  const productLabel = getProductInfoLabel(resolvedProductInfoId)
  const productShortLabel = getProductInfoShortLabel(resolvedProductInfoId)
  const ticketPriceNum = resolvedSession ? Number(formatEther(resolvedSession.ticketPrice)) : 0
  const totalTickets = resolvedSession ? Number(resolvedSession.totalTickets) : 0
  const ticketsSold = resolvedSession ? Number(resolvedSession.ticketsSold) : 0
  const availableTickets = Math.max(totalTickets - ticketsSold, 0)
  const isSoldOut = availableTickets <= 0
  
  // Check if commit phase is active
  const isSettled = resolvedSession ? resolvedSession.isSettled : false
  const isCommitPhaseActive = phase?.isCommitPhaseActive ?? false
  const isUpcoming = phase?.isUpcoming ?? false
  const isRevealPhase = phase?.isRevealPhase ?? false
  const hasInvalidSchedule = Boolean(
    resolvedSession &&
      !resolvedSession.isSettled &&
      resolvedSession.unlockTimestamp === 0n &&
      isRevealPhase
  )
  const startsAtLabel =
    resolvedSession && resolvedSession.unlockTimestamp > 0n
      ? new Date(Number(resolvedSession.unlockTimestamp) * 1000).toLocaleString()
      : null
  const commitDeadlineLabel =
    resolvedSession && resolvedSession.commitDeadline > 0n
      ? new Date(Number(resolvedSession.commitDeadline) * 1000).toLocaleString()
      : null

  const handlePurchaseSuccess = useCallback(async () => {
    await Promise.all([
      refreshSessionInfo(),
      refreshPlayerTickets(),
    ])
    setPurchaseHistoryRefreshNonce((current) => current + 1)
  }, [refreshPlayerTickets, refreshSessionInfo])

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
      return
    }
    router.push("/")
  }, [router])

  if (sessionLoading && !resolvedSession) {
    return (
      <main className="min-h-screen bg-base-100 py-6 px-4">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleBack}
            className="btn btn-ghost btn-sm gap-2 mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            {t.session.back}
          </button>

          <div className="card bg-base-200 border border-base-content/5 mb-6">
            <div className="card-body">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-gradient-to-br from-primary/20 to-secondary/20 rounded-xl w-14 h-14 shrink-0" />
                  <div className="min-w-0 space-y-2">
                    <div className="h-6 w-28 rounded bg-base-300 animate-pulse" />
                    <div className="h-4 w-28 rounded bg-base-300/80 animate-pulse" />
                  </div>
                </div>
                <div className="h-6 w-20 rounded-full bg-base-300 animate-pulse" />
              </div>

              <div className="bg-base-300/60 rounded-xl p-4 mt-4 border border-base-content/5">
                <div className="h-4 w-20 rounded bg-base-300 animate-pulse mx-auto" />
                <div className="h-10 w-48 rounded bg-base-300/80 animate-pulse mx-auto mt-3" />
                <div className="h-4 w-24 rounded bg-base-300 animate-pulse mx-auto mt-3" />
              </div>
            </div>
          </div>

          <div className="card bg-base-200 border border-base-content/5">
            <div className="card-body">
              <div className="h-6 w-28 rounded bg-base-300 animate-pulse" />
              <div className="space-y-3 mt-4">
                <div className="h-12 rounded-xl bg-base-300/80 animate-pulse" />
                <div className="h-12 rounded-xl bg-base-300/70 animate-pulse" />
                <div className="h-12 rounded-xl bg-base-300/60 animate-pulse" />
              </div>
            </div>
          </div>

          <SessionPurchaseHistorySkeleton />
        </div>
      </main>
    )
  }
  
  // Session not found
  if (!resolvedSession) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-base-content/60">{t.session.notFound}</p>
        <button onClick={() => router.push("/")} className="btn btn-primary">
          {t.session.backToHome}
        </button>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-base-100 py-6 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Back button */}
        <button 
          onClick={handleBack}
          className="btn btn-ghost btn-sm gap-2 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          {t.session.back}
        </button>
        
        {/* Session header */}
        <div className="card bg-base-200 border border-base-content/5 mb-6">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="avatar placeholder">
                  <div className="bg-gradient-to-br from-primary/20 to-secondary/20 rounded-xl w-14 h-14">
                    <span className="text-lg font-bold text-primary">
                      {productShortLabel}
                    </span>
                  </div>
                </div>
                <div>
                  <h1 className="text-xl font-bold">
                    {productLabel}
                  </h1>
                  <Link 
                    href={getExplorerAddressUrl(resolvedSession.chainId, sessionAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-base-content/40 hover:text-primary flex items-center gap-1"
                  >
                    {shortAddress}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
              
              {/* Status badge */}
              {isSettled ? (
                <span className="badge badge-success">{t.products.settled}</span>
              ) : hasInvalidSchedule ? (
                <span className="badge badge-error">{t.session.commitEnded}</span>
              ) : isUpcoming ? (
                <span className="badge badge-info">{t.session.notStarted}</span>
              ) : isRevealPhase ? (
                <span className="badge badge-warning">{t.products.revealing}</span>
              ) : (
                <span className="badge badge-primary">{t.session.active}</span>
              )}
            </div>
            
            {/* Prize value */}
            <div className="bg-base-300/60 rounded-xl p-4 text-center mt-4 border border-base-content/5">
              <p className="text-xs text-base-content/40 mb-1">{t.products.prizeValue}</p>
              <p className="text-2xl sm:text-3xl font-bold text-primary font-display">
                {(ticketPriceNum * totalTickets).toFixed(4)} {isEth ? "ETH" : "TOKEN"}
              </p>
              <p className="text-sm text-base-content/40 mt-1">
                ~{(ticketPriceNum * totalTickets * ETH_USDT_RATE).toFixed(2)} USDT
              </p>
            </div>
            
            {/* Countdown */}
            {(isUpcoming || isCommitPhaseActive) && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <Clock className="h-4 w-4 text-base-content/40" />
                <span className="text-sm text-base-content/40">
                  {isUpcoming ? t.session.notStarted : t.products.countdown}
                </span>
                <div className="flex items-center gap-1 font-display">
                  {days > 0 && (
                    <>
                      <span className="bg-base-300 rounded px-2 py-1 text-primary font-bold tabular-nums">
                        {days}{t.create.days}
                      </span>
                      <span className="text-base-content/20 font-bold">:</span>
                    </>
                  )}
                  <span className="bg-base-300 rounded px-2 py-1 text-primary font-bold tabular-nums">
                    {String(hours).padStart(2, "0")}
                  </span>
                  <span className="text-base-content/20 font-bold">:</span>
                  <span className="bg-base-300 rounded px-2 py-1 text-primary font-bold tabular-nums">
                    {String(minutes).padStart(2, "0")}
                  </span>
                  <span className="text-base-content/20 font-bold">:</span>
                  <span className="bg-base-300 rounded px-2 py-1 text-primary font-bold tabular-nums">
                    {String(seconds).padStart(2, "0")}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Buy tickets card - simplified with modal */}
        {isCommitPhaseActive && (
          <div className="card bg-base-200 border border-base-content/5">
            <div className="card-body">
              <h2 className="card-title text-lg">{t.session.buyTickets}</h2>
              
              {/* Ticket price info */}
              <div className="flex items-center justify-between py-3 border-b border-base-content/10">
                <span className="text-base-content/60">{t.session.ticketPrice}</span>
                <span className="font-semibold">
                  {ticketPriceNum.toFixed(4)} {isEth ? "ETH" : "TOKEN"}
                  <span className="text-xs text-base-content/40 ml-1">
                    (~{(ticketPriceNum * ETH_USDT_RATE).toFixed(2)} USDT)
                  </span>
                </span>
              </div>
              
              {/* Total tickets info */}
              <div className="flex items-center justify-between py-3">
                <span className="text-base-content/60">{t.session.totalTicketsLabel}</span>
                <span className="font-semibold">{totalTickets}</span>
              </div>

              <div className="flex items-center justify-between py-3 border-t border-base-content/10">
                <span className="text-base-content/60">{t.session.unsoldCount}</span>
                <span className={`font-semibold ${isSoldOut ? "text-warning" : ""}`}>
                  {availableTickets}
                </span>
              </div>

              {isSoldOut && (
                <div className="alert alert-info mt-4 py-2">
                  <span className="text-sm">{t.session.allTicketsSold}</span>
                </div>
              )}
              
              {/* Buy button - opens modal */}
              <button
                className="btn btn-primary btn-lg w-full mt-4 gap-2"
                onClick={() => setBuyModalOpen(true)}
                disabled={isSoldOut}
              >
                <Ticket className="h-5 w-5" />
                {isSoldOut ? t.session.allTicketsSold : t.session.buyNow}
              </button>
            </div>
          </div>
        )}
        
        {/* Session starts later */}
        {isUpcoming && !isSettled && (
          <div className="card bg-base-200 border border-info/30 mt-4">
            <div className="card-body text-center py-8">
              <Clock className="h-12 w-12 mx-auto text-info mb-4" />
              <p className="text-info text-lg font-bold">{t.session.notStarted}</p>
              {startsAtLabel && (
                <p className="text-sm text-base-content/60 mt-2">
                  {t.session.startsAt.replace("{time}", startsAtLabel)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Misconfigured session timing */}
        {hasInvalidSchedule && (
          <div className="card bg-base-200 border border-error/30 mt-4">
            <div className="card-body text-center py-8">
              <Clock className="h-12 w-12 mx-auto text-error mb-4" />
              <p className="text-error text-lg font-bold">{t.session.invalidSchedule}</p>
              {commitDeadlineLabel && (
                <p className="text-xs text-base-content/40 mt-4">
                  Commit Deadline: {commitDeadlineLabel}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Session ended message */}
        {!hasInvalidSchedule && !isUpcoming && !isCommitPhaseActive && !isSettled && (
          <div className="card bg-base-200 border border-warning/30 mt-4">
            <div className="card-body text-center py-8">
              <Clock className="h-12 w-12 mx-auto text-warning mb-4" />
              <p className="text-warning text-lg font-bold">{t.session.commitEnded}</p>
              <p className="text-sm text-base-content/60 mt-2">{t.session.waitingReveal}</p>
              {commitDeadlineLabel && (
                <p className="text-xs text-base-content/40 mt-4">
                  Commit Deadline: {commitDeadlineLabel}
                </p>
              )}
            </div>
          </div>
        )}
        
        {isSettled && (
          <div className="card bg-base-200 border border-success/30">
            <div className="card-body text-center">
              <p className="text-success font-bold">{t.session.sessionSettled}</p>
              {resolvedSession.settlementType === SESSION_SETTLEMENT_TYPES.NORMAL && (
                <p className="mt-2 text-sm text-base-content/60">{t.session.prizeAutoSent}</p>
              )}
            </div>
          </div>
        )}

        {resolvedSession && (
          <SessionPurchaseHistory
            session={resolvedSession}
            refreshNonce={purchaseHistoryRefreshNonce}
          />
        )}

        {resolvedSession && <SessionTreasuryCard session={resolvedSession} />}
        
        {/* Creator management panel */}
        {resolvedSession && (
          <CreatorPanel
            session={resolvedSession}
            ticketsSold={ticketsSold}
            onSettlementStateChange={refreshSessionInfo}
          />
        )}
        
        {/* Player claim panel - shows when unsold settlement is complete */}
        {resolvedSession && (
          <PlayerClaimPanel 
            session={resolvedSession} 
            playerTicketCount={Number(playerTicketCount)}
          />
        )}
      </div>
      
      {/* Buy Modal */}
      {resolvedSession && (
        <BuyModal
          isOpen={buyModalOpen}
          onClose={() => setBuyModalOpen(false)}
          session={resolvedSession}
          ethPrice={ETH_USDT_RATE}
          onPurchaseSuccess={handlePurchaseSuccess}
        />
      )}
    </main>
  )
}
