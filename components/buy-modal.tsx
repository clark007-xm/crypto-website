"use client"

import { useState, useMemo, useEffect } from "react"
import dynamic from "next/dynamic"
import { X, Eye, EyeOff, Copy, RefreshCw, Ticket, Loader2, Check } from "lucide-react"
import { formatEther, hexlify, randomBytes, keccak256, toUtf8Bytes, ZeroAddress } from "ethers"
import { useT } from "@/lib/i18n/context"
import { useWallet } from "@/lib/wallet/context"
import { useBuyTickets } from "@/lib/contracts/hooks"
import type { SessionConfigFromEvent } from "@/lib/contracts/hooks"

const ConnectModal = dynamic(
  () => import("./connect-modal").then((mod) => mod.ConnectModal)
)

interface BuyModalProps {
  isOpen: boolean
  onClose: () => void
  session: SessionConfigFromEvent
  ethPrice?: number
}

export function BuyModal({ isOpen, onClose, session, ethPrice = 2000 }: BuyModalProps) {
  const t = useT()
  const { status } = useWallet()
  const { buyTickets, loading: buyLoading, error: buyError } = useBuyTickets()
  
  // Form state
  const [quantity, setQuantity] = useState(1)
  const [useBalance, setUseBalance] = useState(false)
  const [connectModalOpen, setConnectModalOpen] = useState(false)
  const [buySuccess, setBuySuccess] = useState(false)
  
  // Secret key state
  const [secret, setSecret] = useState("")
  const [showSecret, setShowSecret] = useState(false)
  const [copied, setCopied] = useState(false)
  
  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuantity(1)
      setSecret("")
      setBuySuccess(false)
      setUseBalance(false)
    }
  }, [isOpen])
  
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
  
  // Calculations
  const totalTickets = Number(session.totalTickets)
  const ticketPriceEth = Number(formatEther(session.ticketPrice))
  const isEth = session.paymentToken === ZeroAddress
  const totalCost = ticketPriceEth * quantity
  const totalCostUsdt = totalCost * ethPrice
  
  // Handle buy
  const handleBuy = async () => {
    if (status !== "connected") {
      setConnectModalOpen(true)
      return
    }
    
    if (!session || !secret || !commitment) return

    const value = useBalance ? 0n : session.ticketPrice * BigInt(quantity)
    
    const tx = await buyTickets(
      session.sessionAddress,
      quantity,
      commitment,
      useBalance,
      value
    )
    
    if (tx) {
      setBuySuccess(true)
      const secretsKey = `onetap_secrets_${session.sessionAddress}`
      const storedSecrets = localStorage.getItem(secretsKey)
      const parsedSecrets = storedSecrets ? JSON.parse(storedSecrets) : []
      const existingSecrets = Array.isArray(parsedSecrets) ? parsedSecrets : []
      existingSecrets.push({ secret, commitment, quantity, timestamp: Date.now() })
      localStorage.setItem(secretsKey, JSON.stringify(existingSecrets))
      
      // Auto close after success
      setTimeout(() => {
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
            
            {/* Quantity */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">{t.session.quantity}</span>
                <span className="label-text-alt text-base-content/40">
                  {t.session.maxTickets}: {totalTickets}
                </span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-square btn-outline btn-sm"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  max={totalTickets}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(totalTickets, parseInt(e.target.value) || 1)))}
                  className="input input-bordered input-sm text-center w-16"
                />
                <button
                  className="btn btn-square btn-outline btn-sm"
                  onClick={() => setQuantity(Math.min(totalTickets, quantity + 1))}
                  disabled={quantity >= totalTickets}
                >
                  +
                </button>
                
                {/* Quick select */}
                <div className="flex gap-1 ml-auto">
                  {[1, 5, 10].map(n => (
                    <button
                      key={n}
                      className={`btn btn-xs ${quantity === n ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setQuantity(Math.min(totalTickets, n))}
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
              disabled={buyLoading || !secret || !commitment || buySuccess}
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
