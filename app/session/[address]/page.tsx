"use client"

import { useState, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Clock, ExternalLink, Ticket, Loader2 } from "lucide-react"
import { formatEther, ZeroAddress } from "ethers"
import Link from "next/link"

import { useT } from "@/lib/i18n/context"
import { useActiveSessions, usePlayerTickets } from "@/lib/contracts/hooks"
import { getExplorerAddressUrl } from "@/lib/contracts/addresses"
import { useCountdown } from "@/hooks/use-countdown"
import { BuyModal } from "@/components/buy-modal"
import { CreatorPanel } from "@/components/creator-panel"
import { PlayerClaimPanel } from "@/components/player-claim-panel"

// ETH to USDT rate for display
const ETH_USDT_RATE = 2500

export default function SessionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sessionAddress = params.address as string
  const t = useT()
  
  // Fetch all sessions and find the current one
  const { sessions, loading: sessionsLoading } = useActiveSessions()
  const { tickets: playerTicketCount } = usePlayerTickets(sessionAddress)
  const session = useMemo(() => {
    return sessions.find(s => s.sessionAddress.toLowerCase() === sessionAddress?.toLowerCase())
  }, [sessions, sessionAddress])
  
  // Buy modal state
  const [buyModalOpen, setBuyModalOpen] = useState(false)
  
  // Countdown
  const endTimeMs = useMemo(() => {
    return session?.commitDeadline && session.commitDeadline > 0n
      ? Number(session.commitDeadline) * 1000
      : Date.now() + 60000
  }, [session?.commitDeadline])
  const { days, hours, minutes, seconds } = useCountdown(endTimeMs)
  
  // Calculate values
  const isEth = session?.paymentToken === ZeroAddress
  const ticketPriceNum = session ? Number(formatEther(session.ticketPrice)) : 0
  const totalTickets = session ? Number(session.totalTickets) : 0
  const ticketsSold = session ? Number(session.ticketsSold) : 0
  
  // Check if commit phase is active
  const now = Math.floor(Date.now() / 1000)
  const isSettled = session ? session.isSettled : false
  const isCommitPhaseActive = session ? !isSettled && now < Number(session.commitDeadline) : false
  
  // Loading state
  if (sessionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }
  
  // Session not found
  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-base-content/60">{t.session.notFound}</p>
        <button onClick={() => router.push("/")} className="btn btn-primary">
          {t.session.backToHome}
        </button>
      </div>
    )
  }
  
  const shortAddress = `${sessionAddress.slice(0, 6)}...${sessionAddress.slice(-4)}`

  return (
    <main className="min-h-screen bg-base-100 py-6 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Back button */}
        <button 
          onClick={() => router.back()}
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
                      {isEth ? "ETH" : "TKN"}
                    </span>
                  </div>
                </div>
                <div>
                  <h1 className="text-xl font-bold">
                    {isEth ? t.products.ethPool : t.products.tokenPool}
                  </h1>
                  <Link 
                    href={getExplorerAddressUrl(session.chainId, sessionAddress)}
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
              ) : !isCommitPhaseActive ? (
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
            {isCommitPhaseActive && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <Clock className="h-4 w-4 text-base-content/40" />
                <span className="text-sm text-base-content/40">{t.products.countdown}</span>
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
              
              {/* Buy button - opens modal */}
              <button
                className="btn btn-primary btn-lg w-full mt-4 gap-2"
                onClick={() => setBuyModalOpen(true)}
              >
                <Ticket className="h-5 w-5" />
                {t.session.buyNow}
              </button>
            </div>
          </div>
        )}
        
        {/* Session ended message */}
        {!isCommitPhaseActive && !isSettled && (
          <div className="card bg-base-200 border border-warning/30 mt-4">
            <div className="card-body text-center py-8">
              <Clock className="h-12 w-12 mx-auto text-warning mb-4" />
              <p className="text-warning text-lg font-bold">{t.session.commitEnded}</p>
              <p className="text-sm text-base-content/60 mt-2">{t.session.waitingReveal}</p>
              <p className="text-xs text-base-content/40 mt-4">
                Commit Deadline: {new Date(Number(session.commitDeadline) * 1000).toLocaleString()}
              </p>
            </div>
          </div>
        )}
        
        {isSettled && (
          <div className="card bg-base-200 border border-success/30">
            <div className="card-body text-center">
              <p className="text-success font-bold">{t.session.sessionSettled}</p>
            </div>
          </div>
        )}
        
        {/* Creator management panel */}
        {session && (
          <CreatorPanel session={session} ticketsSold={ticketsSold} />
        )}
        
        {/* Player claim panel - shows when unsold settlement is complete */}
        {session && (
          <PlayerClaimPanel 
            session={session} 
            playerTicketCount={Number(playerTicketCount)}
          />
        )}
      </div>
      
      {/* Buy Modal */}
      {session && (
        <BuyModal
          isOpen={buyModalOpen}
          onClose={() => setBuyModalOpen(false)}
          session={session}
          ethPrice={ETH_USDT_RATE}
        />
      )}
    </main>
  )
}
