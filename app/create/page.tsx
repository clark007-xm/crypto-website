"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, AlertTriangle, CheckCircle, Copy, Check, Eye, EyeOff, Wallet } from "lucide-react"
import { formatEther, parseEther } from "ethers"
import { Navbar } from "@/components/navbar"
import { useTransactionFlow } from "@/components/transaction-flow-provider"
import { DurationPicker } from "@/components/duration-picker"
import { useT } from "@/lib/i18n/context"
import { useWallet } from "@/lib/wallet/context"
import { computeCreatorCommitment, saveLocalCreatorSecret } from "@/lib/creator-session-secret"
import { useIsPartner, useCreateSession, usePartnerDeposit, useDepositToTreasury } from "@/lib/contracts/hooks"
import { 
  MAX_COMMIT_DURATION_DAYS, 
  MAX_COMMIT_DURATION_SECONDS,
  MAX_REVEAL_DURATION_DAYS,
  MAX_REVEAL_DURATION_SECONDS 
} from "@/lib/contracts/config"

export default function CreatePage() {
  const t = useT()
  const { status, address, shortAddress, chainId } = useWallet()
  const transactionFlow = useTransactionFlow()
  const { isPartner, loading: partnerLoading, checked: partnerChecked } = useIsPartner()
  const { createSession, loading: creating, error: createError } = useCreateSession()
  const { balance: depositBalance, isInsufficient, shortfall, loading: depositLoading, checked: depositChecked, refresh: refreshDeposit } = usePartnerDeposit()
  const { deposit: doDeposit, loading: depositing, error: depositError } = useDepositToTreasury()

  // Form state
  const [ticketPrice, setTicketPrice] = useState("0.001")
  const [totalTickets, setTotalTickets] = useState("100")
  // Duration state: days, hours, minutes
  const [commitDays, setCommitDays] = useState(0)
  const [commitHours, setCommitHours] = useState(1)
  const [commitMinutes, setCommitMinutes] = useState(0)
  const [revealDays, setRevealDays] = useState(0)
  const [revealHours, setRevealHours] = useState(0)
  const [revealMinutes, setRevealMinutes] = useState(30)
  
  // Calculate total seconds from days/hours/minutes
  const commitDurationSeconds = (commitDays * 24 * 60 + commitHours * 60 + commitMinutes) * 60
  const revealDurationSeconds = (revealDays * 24 * 60 + revealHours * 60 + revealMinutes) * 60
  
  // Validate duration limits
  const isCommitDurationValid = commitDurationSeconds > 0 && commitDurationSeconds <= MAX_COMMIT_DURATION_SECONDS
  const isRevealDurationValid = revealDurationSeconds > 0 && revealDurationSeconds <= MAX_REVEAL_DURATION_SECONDS
  const [partnerShare, setPartnerShare] = useState("10") // percentage
  const [platformFee, setPlatformFee] = useState("5") // percentage
  const [secret, setSecret] = useState("") // User's raw secret string
  const [showSecret, setShowSecret] = useState(false)
  const [secretCopied, setSecretCopied] = useState(false)
  const [commitmentCopied, setCommitmentCopied] = useState(false)
  const [success, setSuccess] = useState(false)
  const [newSessionAddress, setNewSessionAddress] = useState<string | null>(null)
  const [depositAmount, setDepositAmount] = useState("")
  const [depositSuccess, setDepositSuccess] = useState(false)

  // Compute commitment from secret (for preview)
  const commitment = computeCreatorCommitment(secret)

  // Copy secret to clipboard
  const copySecret = async () => {
    if (secret) {
      await navigator.clipboard.writeText(secret)
      setSecretCopied(true)
      setTimeout(() => setSecretCopied(false), 2000)
    }
  }

  // Copy commitment to clipboard
  const copyCommitment = async () => {
    if (commitment) {
      await navigator.clipboard.writeText(commitment)
      setCommitmentCopied(true)
      setTimeout(() => setCommitmentCopied(false), 2000)
    }
  }

  // Handle deposit (ETH)
  const handleDeposit = async () => {
    if (!depositAmount) return
    try {
      const amountWei = parseEther(depositAmount)
      const controller = transactionFlow.createController({
        chainId,
        fields: [
          { label: t.tx.account, value: shortAddress ?? address ?? "-", tone: "success" },
          { label: t.tx.action, value: t.create.depositBtn },
          { label: t.tx.details, value: `${depositAmount} ETH` },
        ],
      })
      const success = await doDeposit(amountWei, controller.callbacks)
      if (success) {
        setDepositSuccess(true)
        setDepositAmount("")
        refreshDeposit()
        setTimeout(() => setDepositSuccess(false), 3000)
      }
    } catch {
      alert(t.create.depositFailed)
    }
  }

  // Calculate preview values
  const priceNum = parseFloat(ticketPrice) || 0
  const ticketsNum = parseInt(totalTickets, 10) || 0
  const partnerShareNum = parseFloat(partnerShare) || 0
  const platformFeeNum = parseFloat(platformFee) || 0
  const totalPoolEth = priceNum * ticketsNum
  const yourShareEth = totalPoolEth * (partnerShareNum / 100)
  
  // ETH to USDT approximate rate (for display only)
  const ETH_USDT_RATE = 2500
  const totalPoolUsdt = totalPoolEth * ETH_USDT_RATE
  const yourShareUsdt = yourShareEth * ETH_USDT_RATE

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!secret.trim()) {
      alert(t.create.secretWarning)
      return
    }
    
    // Validate duration limits
    if (!isCommitDurationValid) {
      alert(t.create.commitDurationError?.replace("{days}", String(MAX_COMMIT_DURATION_DAYS)) || `Commit duration must be between 1 minute and ${MAX_COMMIT_DURATION_DAYS} days`)
      return
    }
    if (!isRevealDurationValid) {
      alert(t.create.revealDurationError?.replace("{days}", String(MAX_REVEAL_DURATION_DAYS)) || `Reveal duration must be between 1 minute and ${MAX_REVEAL_DURATION_DAYS} days`)
      return
    }

    // commitment is already computed from secret
    let parsedTicketPrice: bigint
    try {
      parsedTicketPrice = parseEther(ticketPrice)
    } catch {
      alert(t.create.failed)
      return
    }

    const controller = transactionFlow.createController({
      chainId,
      fields: [
        { label: t.tx.account, value: shortAddress ?? address ?? "-", tone: "success" },
        { label: t.tx.action, value: t.create.submit },
        { label: t.tx.details, value: `${ticketPrice} ETH / ${totalTickets} tickets` },
      ],
    })

    const sessionAddress = await createSession(
      {
        sessionCommitment: commitment,
        ticketPrice: parsedTicketPrice,
        totalTickets: parseInt(totalTickets, 10),
        partnerShareBps: Math.round(partnerShareNum * 100),
        platformFeeBps: Math.round(platformFeeNum * 100),
        commitDurationSeconds,
        revealDurationSeconds,
      },
      controller.callbacks
    )

    if (sessionAddress) {
      saveLocalCreatorSecret(sessionAddress, {
        secret: secret.trim(),
        commitment,
        savedAt: Date.now(),
        creator: address ?? undefined,
        chainId: chainId ?? undefined,
      })
      setSuccess(true)
      setNewSessionAddress(sessionAddress)
    }
  }

  // Show loading state
  if (status === "connecting" || partnerLoading || (partnerChecked && isPartner && depositLoading)) {
    return (
      <main className="min-h-screen bg-base-100 text-base-content">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      </main>
    )
  }

  // Not connected
  if (status !== "connected") {
    return (
      <main className="min-h-screen bg-base-100 text-base-content">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-16">
          <div className="alert alert-warning">
            <AlertTriangle className="h-5 w-5" />
            <span>{t.create.connectFirst}</span>
          </div>
          <div className="mt-4">
            <Link href="/" className="btn btn-ghost gap-2">
              <ArrowLeft className="h-4 w-4" />
              {t.create.back}
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // Not a partner
  if (partnerChecked && !isPartner) {
    return (
      <main className="min-h-screen bg-base-100 text-base-content">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-16">
          <div className="alert alert-error">
            <AlertTriangle className="h-5 w-5" />
            <span>{t.create.notPartner}</span>
          </div>
          <div className="mt-4">
            <Link href="/" className="btn btn-ghost gap-2">
              <ArrowLeft className="h-4 w-4" />
              {t.create.back}
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // Success state
  if (success && newSessionAddress) {
    return (
      <main className="min-h-screen bg-base-100 text-base-content">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-16">
          <div className="card bg-base-200 border border-success/20">
            <div className="card-body items-center text-center gap-4">
              <CheckCircle className="h-16 w-16 text-success" />
              <h2 className="card-title text-success">{t.create.success}</h2>
              <p className="text-base-content/60 break-all font-mono text-sm">
                {newSessionAddress}
              </p>
              <div className="card-actions mt-4">
                <Link href="/" className="btn btn-primary">
                  {t.create.back}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <Navbar />
      
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-16">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="btn btn-ghost btn-sm gap-2 mb-4">
            <ArrowLeft className="h-4 w-4" />
            {t.create.back}
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold font-display">{t.create.title}</h1>
          <p className="text-base-content/60 mt-2">{t.create.subtitle}</p>
        </div>

        {/* Deposit Required Warning */}
        {depositChecked && isInsufficient && (
          <div className="card bg-warning/10 border border-warning/30 mb-8">
            <div className="card-body p-4 sm:p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <h3 className="font-semibold text-warning">{t.create.depositRequired}</h3>
                  <p className="text-sm text-base-content/60">{t.create.depositBalance}: {formatEther(depositBalance)} ETH</p>
                </div>
              </div>
              
              <div className="bg-base-100/50 rounded-lg p-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-base-content/60">{t.create.depositNeeded}</span>
                  <span className="font-semibold text-warning">{formatEther(shortfall)} ETH</span>
                </div>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text text-sm">{t.create.depositAmount}</span>
                </label>
                <div className="flex gap-2">
                  <label className="input input-bordered flex items-center gap-2 flex-1">
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder={formatEther(shortfall)}
                      className="grow"
                    />
                    <span className="text-base-content/40">ETH</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleDeposit}
                    className="btn btn-warning min-w-[120px]"
                    disabled={depositing || !depositAmount}
                  >
                    {depositing && <span className="loading loading-spinner loading-sm"></span>}
                    {depositing ? t.create.depositing : t.create.depositBtn}
                  </button>
                </div>
              </div>

              {depositError && (
                <div className="alert alert-error mt-3 py-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">{depositError}</span>
                </div>
              )}

              {depositSuccess && (
                <div className="alert alert-success mt-3 py-2">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm">{t.create.depositSuccess}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Ticket Price */}
          <div className="form-control">
            <label className="label">
              <span className="label-text font-semibold">{t.create.ticketPrice}</span>
            </label>
            <label className="input input-bordered flex items-center gap-2">
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                value={ticketPrice}
                onChange={(e) => setTicketPrice(e.target.value)}
                className="grow"
                required
              />
              <span className="text-base-content/40">ETH</span>
            </label>
            <label className="label">
              <span className="label-text-alt text-base-content/40">
                {t.create.ticketPriceHint} ({priceNum > 0 ? `~${(priceNum * ETH_USDT_RATE).toFixed(2)} USDT` : ""})
              </span>
            </label>
          </div>

          {/* Total Tickets */}
          <div className="form-control">
            <label className="label">
              <span className="label-text font-semibold">{t.create.totalTickets}</span>
            </label>
            <input
              type="number"
              min="2"
              max="10000"
              value={totalTickets}
              onChange={(e) => setTotalTickets(e.target.value)}
              className="input input-bordered"
              required
            />
            <label className="label">
              <span className="label-text-alt text-base-content/40">{t.create.totalTicketsHint}</span>
            </label>
          </div>

          {/* Duration Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Commit Duration */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">{t.create.commitDuration}</span>
                <span className="label-text-alt text-base-content/40">
                  {t.create.maxDays?.replace("{days}", String(MAX_COMMIT_DURATION_DAYS)) || `Max ${MAX_COMMIT_DURATION_DAYS} days`}
                </span>
              </label>
              <div className={`bg-base-300/50 rounded-2xl p-4 border ${!isCommitDurationValid ? 'border-error' : 'border-base-content/5'}`}>
                <DurationPicker
                  days={commitDays}
                  hours={commitHours}
                  minutes={commitMinutes}
                  onDaysChange={setCommitDays}
                  onHoursChange={setCommitHours}
                  onMinutesChange={setCommitMinutes}
                  labels={{
                    days: t.create.days,
                    hours: t.create.hours,
                    mins: t.create.mins,
                  }}
                  maxDays={MAX_COMMIT_DURATION_DAYS}
                />
                <p className="text-center text-xs text-base-content/40 mt-3">
                  {t.create.commitDurationHint}
                </p>
              </div>
              {!isCommitDurationValid && commitDurationSeconds > 0 && (
                <label className="label">
                  <span className="label-text-alt text-error">
                    {t.create.commitDurationError?.replace("{days}", String(MAX_COMMIT_DURATION_DAYS)) || `Maximum ${MAX_COMMIT_DURATION_DAYS} days`}
                  </span>
                </label>
              )}
            </div>

            {/* Reveal Duration */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">{t.create.revealDuration}</span>
                <span className="label-text-alt text-base-content/40">
                  {t.create.maxDays?.replace("{days}", String(MAX_REVEAL_DURATION_DAYS)) || `Max ${MAX_REVEAL_DURATION_DAYS} days`}
                </span>
              </label>
              <div className={`bg-base-300/50 rounded-2xl p-4 border ${!isRevealDurationValid ? 'border-error' : 'border-base-content/5'}`}>
                <DurationPicker
                  days={revealDays}
                  hours={revealHours}
                  minutes={revealMinutes}
                  onDaysChange={setRevealDays}
                  onHoursChange={setRevealHours}
                  onMinutesChange={setRevealMinutes}
                  labels={{
                    days: t.create.days,
                    hours: t.create.hours,
                    mins: t.create.mins,
                  }}
                  maxDays={MAX_REVEAL_DURATION_DAYS}
                />
                <p className="text-center text-xs text-base-content/40 mt-3">
                  {t.create.revealDurationHint}
                </p>
              </div>
              {!isRevealDurationValid && revealDurationSeconds > 0 && (
                <label className="label">
                  <span className="label-text-alt text-error">
                    {t.create.revealDurationError?.replace("{days}", String(MAX_REVEAL_DURATION_DAYS)) || `Maximum ${MAX_REVEAL_DURATION_DAYS} days`}
                  </span>
                </label>
              )}
            </div>
          </div>

          {/* Share Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Partner Share */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">{t.create.partnerShare}</span>
              </label>
              <label className="input input-bordered flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="50"
                  value={partnerShare}
                  onChange={(e) => setPartnerShare(e.target.value)}
                  className="grow"
                  required
                />
                <span className="text-base-content/40">%</span>
              </label>
              <label className="label">
                <span className="label-text-alt text-base-content/40">{t.create.partnerShareHint}</span>
              </label>
            </div>

            {/* Platform Fee */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">{t.create.platformFee}</span>
              </label>
              <label className="input input-bordered flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="20"
                  value={platformFee}
                  onChange={(e) => setPlatformFee(e.target.value)}
                  className="grow"
                  required
                />
                <span className="text-base-content/40">%</span>
              </label>
              <label className="label">
                <span className="label-text-alt text-base-content/40">{t.create.platformFeeHint}</span>
              </label>
            </div>
          </div>

          {/* Secret Key */}
          <div className="form-control">
            <label className="label">
              <span className="label-text font-semibold">{t.create.secretKey}</span>
            </label>
            <div className="flex gap-2">
              <label className="input input-bordered flex items-center gap-2 flex-1">
                <input
                  type={showSecret ? "text" : "password"}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder={t.create.secretKeyPlaceholder}
                  className="grow"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="btn btn-ghost btn-xs btn-circle"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </label>
              <button
                type="button"
                onClick={copySecret}
                className="btn btn-outline btn-square"
                disabled={!secret}
              >
                {secretCopied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <label className="label">
              <span className="label-text-alt text-base-content/40">{t.create.secretKeyHint}</span>
            </label>
            
            {/* Show computed commitment */}
            {commitment && (
              <div className="mt-2 p-3 bg-base-200 rounded-lg border border-base-content/10">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-base-content/40">{t.create.commitment}</span>
                  <button
                    type="button"
                    onClick={copyCommitment}
                    className="btn btn-ghost btn-xs gap-1"
                  >
                    {commitmentCopied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                    {commitmentCopied ? t.wallet.copied : t.wallet.copyAddress}
                  </button>
                </div>
                <p className="text-xs font-mono text-base-content/60 break-all">{commitment}</p>
              </div>
            )}

            {secret && (
              <div className="alert alert-warning mt-3">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">{t.create.secretWarning}</span>
              </div>
            )}
          </div>

          {/* Preview Card */}
          <div className="card bg-base-200 border border-base-content/10">
            <div className="card-body p-4">
              <h3 className="font-semibold text-sm text-base-content/60">{t.create.preview}</h3>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <p className="text-xs text-base-content/40">{t.create.totalPool}</p>
                  <p className="text-lg font-bold text-primary">{totalPoolEth.toFixed(4)} ETH</p>
                  <p className="text-xs text-base-content/40">~{totalPoolUsdt.toFixed(2)} USDT</p>
                </div>
                <div>
                  <p className="text-xs text-base-content/40">{t.create.yourShare}</p>
                  <p className="text-lg font-bold text-accent">{yourShareEth.toFixed(4)} ETH</p>
                  <p className="text-xs text-base-content/40">~{yourShareUsdt.toFixed(2)} USDT</p>
                </div>
              </div>
            </div>
          </div>

          {/* Error */}
          {createError && (
            <div className="alert alert-error">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">{createError}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg"
            disabled={creating || !secret || isInsufficient}
          >
            {creating && <span className="loading loading-spinner"></span>}
            {creating ? t.create.creating : t.create.submit}
          </button>
        </form>
      </div>
    </main>
  )
}
