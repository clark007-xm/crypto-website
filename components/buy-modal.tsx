"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import dynamic from "next/dynamic"
import { X, Eye, EyeOff, Copy, RefreshCw, Ticket, Loader2, Check } from "lucide-react"
import { formatEther, hexlify, randomBytes, keccak256, toUtf8Bytes, ZeroAddress } from "ethers"
import { useTransactionFlow } from "@/components/transaction-flow-provider"
import { useT } from "@/lib/i18n/context"
import { useWallet } from "@/lib/wallet/context"
import { getSessionPhaseState, useBuyTickets, useSessionInfo } from "@/lib/contracts/hooks"
import type { SessionConfigFromEvent } from "@/lib/contracts/hooks"

const ConnectModal = dynamic(
  () => import("./connect-modal").then((mod) => mod.ConnectModal)
)

interface BuyModalProps {
  isOpen: boolean
  onClose: () => void
  session: SessionConfigFromEvent
  ethPrice?: number
  onPurchaseSuccess?: () => Promise<void> | void
}

export function BuyModal({
  isOpen,
  onClose,
  session,
  ethPrice = 2000,
  onPurchaseSuccess,
}: BuyModalProps) {
  const t = useT()
  const { status, address, shortAddress, chainId } = useWallet()
  const transactionFlow = useTransactionFlow()
  const { buyTickets, loading: buyLoading, error: buyError } = useBuyTickets()
  const { info: sessionInfo, refresh: refreshSessionInfo } = useSessionInfo(isOpen ? session.sessionAddress : null)
  const resolvedSession = useMemo(() => {
    if (!sessionInfo) return session

    return {
      ...session,
      ticketPrice: sessionInfo.ticketPrice,
      totalTickets: sessionInfo.totalTickets,
      paymentToken: sessionInfo.paymentToken,
      unlockTimestamp: sessionInfo.unlockTimestamp,
      commitDurationSeconds: sessionInfo.commitDurationSeconds,
      revealDurationSeconds: sessionInfo.revealDurationSeconds,
      ticketsSold: sessionInfo.ticketsSold,
      isSettled: sessionInfo.isSettled,
      settlementType: sessionInfo.settlementType,
      commitDeadline: sessionInfo.commitDeadline,
      revealDeadline: sessionInfo.revealDeadline,
    }
  }, [session, sessionInfo])
  const phase = getSessionPhaseState(
    resolvedSession.unlockTimestamp,
    resolvedSession.commitDeadline,
    resolvedSession.isSettled
  )
  const hasInvalidSchedule =
    !resolvedSession.isSettled &&
    resolvedSession.unlockTimestamp === 0n &&
    phase.isRevealPhase
  const startsAtLabel =
    resolvedSession.unlockTimestamp > 0n
      ? new Date(Number(resolvedSession.unlockTimestamp) * 1000).toLocaleString()
      : null
  const commitDeadlineLabel =
    resolvedSession.commitDeadline > 0n
      ? new Date(Number(resolvedSession.commitDeadline) * 1000).toLocaleString()
      : null
  
  // Form state
  const [quantity, setQuantity] = useState(1)
  const [useBalance, setUseBalance] = useState(false)
  const [connectModalOpen, setConnectModalOpen] = useState(false)
  const [buySuccess, setBuySuccess] = useState(false)
  
  // Secret key state
  const [secret, setSecret] = useState("")
  const [showSecret, setShowSecret] = useState(false)
  const [copied, setCopied] = useState(false)
  const refreshTimeoutRef = useRef<number | null>(null)
  const closeTimeoutRef = useRef<number | null>(null)

  // Calculations
  const totalTickets = Number(resolvedSession.totalTickets)
  const ticketsSold = Number(resolvedSession.ticketsSold)
  const availableTickets = Math.max(totalTickets - ticketsSold, 0)
  const isSoldOut = availableTickets <= 0
  const ticketPriceEth = Number(formatEther(resolvedSession.ticketPrice))
  const isEth = resolvedSession.paymentToken === ZeroAddress
  const totalCost = ticketPriceEth * quantity
  const totalCostUsdt = totalCost * ethPrice
  
  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuantity(availableTickets > 0 ? 1 : 0)
      setSecret("")
      setBuySuccess(false)
      setUseBalance(false)
    }
  }, [availableTickets, isOpen])

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current)
      }
      if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [])
  
  // Compute commitment hash from secret
  const commitment = useMemo(() => {
    if (!secret) return ""
    try {
      return keccak256(toUtf8Bytes(secret))
    } catch {
      return ""
    }
  }, [secret])
  
  // Generate random secret
  const generateSecret = () => {
    const randomSecret = hexlify(randomBytes(16)).slice(2)
    setSecret(randomSecret)
  }
  
  // Copy secret to clipboard
  const copySecret = async () => {
    if (secret) {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }
  
  // Handle buy
  const handleBuy = async () => {
    if (status !== "connected") {
      setConnectModalOpen(true)
      return
    }
    
    if (
      !session ||
      !secret ||
      !commitment ||
      !phase.isCommitPhaseActive ||
      hasInvalidSchedule ||
      isSoldOut ||
      quantity <= 0
    ) return

    const value = useBalance ? 0n : resolvedSession.ticketPrice * BigInt(quantity)
    const controller = transactionFlow.createController({
      chainId: resolvedSession.chainId ?? chainId,
      fields: [
        { label: t.tx.account, value: shortAddress ?? address ?? "-", tone: "success" },
        { label: t.tx.action, value: t.session.buyTickets },
        {
          label: t.tx.details,
          value: `${quantity} × ${ticketPriceEth.toFixed(4)} ${isEth ? "ETH" : "TOKEN"}`,
        },
      ],
    })
    
    const tx = await buyTickets(
      resolvedSession.sessionAddress,
      quantity,
      commitment,
      useBalance,
      value,
      controller.callbacks
    )
    
    if (tx) {
      setBuySuccess(true)
      const secretsKey = `onetap_secrets_${session.sessionAddress}`
      const storedSecrets = localStorage.getItem(secretsKey)
      const parsedSecrets = storedSecrets ? JSON.parse(storedSecrets) : []
      const existingSecrets = Array.isArray(parsedSecrets) ? parsedSecrets : []
      existingSecrets.push({
        secret,
        commitment,
        quantity,
        timestamp: Date.now(),
        txHash: tx.hash,
        useBalance,
        ticketPriceWei: resolvedSession.ticketPrice.toString(),
        paymentToken: resolvedSession.paymentToken,
        buyer: address ?? undefined,
      })
      localStorage.setItem(secretsKey, JSON.stringify(existingSecrets))

      const syncSessionState = async () => {
        await refreshSessionInfo()
        await onPurchaseSuccess?.()
      }

      await syncSessionState()

      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current)
      }
      refreshTimeoutRef.current = window.setTimeout(() => {
        void syncSessionState()
      }, 1500)

      if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current)
      }
      closeTimeoutRef.current = window.setTimeout(() => {
        onClose()
      }, 2000)
    }
  }
  
  if (!isOpen) return null
  
  return (
    <>
      {connectModalOpen && (
        <ConnectModal 
          open={connectModalOpen} 
          onClose={() => setConnectModalOpen(false)} 
        />
      )}
      
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={onClose}
      />
      
      {/* Modal - PC: centered, Mobile: bottom sheet */}
      <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-50 pointer-events-none">
        <div 
          className="bg-base-100 w-full md:w-[480px] md:max-h-[90vh] max-h-[85vh] rounded-t-3xl md:rounded-2xl shadow-2xl pointer-events-auto overflow-hidden flex flex-col animate-in slide-in-from-bottom md:slide-in-from-bottom-0 md:zoom-in-95 duration-300"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-base-300 shrink-0">
            <h3 className="text-lg font-bold">{t.session.buyTickets}</h3>
            <button 
              className="btn btn-ghost btn-sm btn-circle"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          {/* Content - scrollable */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Ticket price info */}
            <div className="bg-base-200 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-base-content/60">{t.session.ticketPrice}</span>
                <span className="font-bold text-primary">
                  {ticketPriceEth.toFixed(4)} {isEth ? "ETH" : "TOKEN"}
                </span>
              </div>
            </div>

            {hasInvalidSchedule && (
              <div className="alert alert-error py-2">
                <span className="text-sm">{t.session.invalidSchedule}</span>
              </div>
            )}

            {!hasInvalidSchedule && phase.isUpcoming && (
              <div className="alert alert-info py-2">
                <span className="text-sm">
                  {startsAtLabel
                    ? t.session.startsAt.replace("{time}", startsAtLabel)
                    : t.session.notStarted}
                </span>
              </div>
            )}

            {!hasInvalidSchedule && phase.isRevealPhase && !resolvedSession.isSettled && (
              <div className="alert alert-warning py-2">
                <span className="text-sm">
                  {commitDeadlineLabel
                    ? t.session.buyEndedAt.replace("{time}", commitDeadlineLabel)
                    : t.session.commitEnded}
                </span>
              </div>
            )}

            {isSoldOut && !resolvedSession.isSettled && (
              <div className="alert alert-info py-2">
                <span className="text-sm">{t.session.allTicketsSold}</span>
              </div>
            )}
            
            {/* Quantity */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">{t.session.quantity}</span>
                <span className="label-text-alt text-base-content/40">
                  {t.session.maxTickets}: {availableTickets}
                </span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-square btn-outline btn-sm"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={isSoldOut || quantity <= 1}
                >
                  -
                </button>
                <input
                  type="number"
                  min={availableTickets > 0 ? "1" : "0"}
                  max={String(availableTickets)}
                  value={quantity}
                  onChange={(e) => {
                    if (availableTickets <= 0) {
                      setQuantity(0)
                      return
                    }
                    setQuantity(Math.max(1, Math.min(availableTickets, parseInt(e.target.value, 10) || 1)))
                  }}
                  className="input input-bordered input-sm text-center w-16"
                  disabled={isSoldOut}
                />
                <button
                  className="btn btn-square btn-outline btn-sm"
                  onClick={() => setQuantity(Math.min(availableTickets, quantity + 1))}
                  disabled={isSoldOut || quantity >= availableTickets}
                >
                  +
                </button>
                
                {/* Quick select */}
                <div className="flex gap-1 ml-auto">
                  {[1, 5, 10].map(n => (
                    <button
                      key={n}
                      className={`btn btn-xs ${quantity === n ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setQuantity(Math.min(availableTickets, n))}
                      disabled={isSoldOut}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Secret Key */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">{t.session.secretKey}</span>
              </label>
              <div className="flex gap-2">
                <div className="join flex-1">
                  <input
                    type={showSecret ? "text" : "password"}
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder="Enter your secret..."
                    className="input input-bordered input-sm join-item flex-1 min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="btn btn-sm btn-square join-item"
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={copySecret}
                  className="btn btn-sm btn-square"
                  disabled={!secret}
                >
                  {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={generateSecret}
                  className="btn btn-sm btn-secondary gap-1"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span className="hidden sm:inline">{t.session.generateSecret}</span>
                </button>
              </div>
              <label className="label">
                <span className="label-text-alt text-base-content/40">{t.session.secretKeyHint}</span>
              </label>
            </div>
            
            {/* Commitment Hash */}
            {commitment && (
              <div className="bg-base-200 rounded-xl p-3">
                <p className="text-xs text-base-content/40 mb-1">{t.session.commitmentHash}</p>
                <p className="font-mono text-xs break-all text-base-content/80">{commitment}</p>
              </div>
            )}
            
            {/* Secret Warning */}
            {secret && (
              <div className="alert alert-warning py-2">
                <span className="text-xs">{t.session.secretWarning}</span>
              </div>
            )}
            
            {/* Use balance toggle */}
            <div className="form-control">
              <label className="label cursor-pointer py-2">
                <span className="label-text text-sm">{t.session.useBalance}</span>
                <input 
                  type="checkbox" 
                  className="toggle toggle-primary toggle-sm" 
                  checked={useBalance}
                  onChange={(e) => setUseBalance(e.target.checked)}
                />
              </label>
            </div>
            
            {/* Total cost */}
            <div className="bg-primary/10 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-base-content/60">{t.session.totalCost}</span>
                <div className="text-right">
                  <p className="text-xl font-bold text-primary">
                    {totalCost.toFixed(4)} {isEth ? "ETH" : "TOKEN"}
                  </p>
                  <p className="text-xs text-base-content/40">
                    ~{totalCostUsdt.toFixed(2)} USDT
                  </p>
                </div>
              </div>
            </div>
            
            {/* Error message */}
            {buyError && (
              <div className="alert alert-error py-2">
                <span className="text-sm">{buyError}</span>
              </div>
            )}
            
            {/* Success message */}
            {buySuccess && (
              <div className="alert alert-success py-2">
                <Check className="h-5 w-5" />
                <span className="text-sm">{t.session.buySuccess}</span>
              </div>
            )}
          </div>
          
          {/* Footer - fixed */}
          <div className="p-4 border-t border-base-300 shrink-0 bg-base-100">
            <button
              className="btn btn-primary btn-block gap-2"
              onClick={handleBuy}
              disabled={
                buyLoading ||
                !secret ||
                !commitment ||
                buySuccess ||
                !phase.isCommitPhaseActive ||
                hasInvalidSchedule ||
                isSoldOut ||
                quantity <= 0
              }
            >
              {buyLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {t.session.processing}
                </>
              ) : buySuccess ? (
                <>
                  <Check className="h-5 w-5" />
                  {t.session.buySuccess}
                </>
              ) : isSoldOut ? (
                t.session.allTicketsSold
              ) : status !== "connected" ? (
                t.session.connectToBuy
              ) : (
                <>
                  <Ticket className="h-5 w-5" />
                  {t.session.buyNow}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
