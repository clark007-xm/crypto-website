"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, CheckCircle, RefreshCw, ShieldAlert, Wallet } from "lucide-react"
import { formatEther, parseEther } from "ethers"
import { useTransactionFlow } from "@/components/transaction-flow-provider"
import { TreasuryActivityList } from "@/components/treasury-activity-list"
import { useT } from "@/lib/i18n/context"
import {
  useDepositToTreasury,
  useIsPartner,
  usePartnerDeposit,
  useTreasuryActivity,
  useTreasuryBalance,
  useWithdrawFromTreasury,
} from "@/lib/contracts/hooks"
import { useWallet } from "@/lib/wallet/context"

function formatEth(value: bigint) {
  return Number(formatEther(value)).toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  })
}

export function TreasuryCenter() {
  const t = useT()
  const { status, address, shortAddress, chainId } = useWallet()
  const transactionFlow = useTransactionFlow()
  const { balance, loading, checked, refresh } = useTreasuryBalance()
  const { withdraw, loading: withdrawing, error } = useWithdrawFromTreasury()
  const { isPartner, loading: partnerLoading, checked: partnerChecked } = useIsPartner()
  const {
    balance: partnerDepositBalance,
    requiredDeposit,
    loading: partnerDepositLoading,
    refresh: refreshPartnerDeposit,
  } = usePartnerDeposit()
  const { deposit, loading: depositing, error: depositError } = useDepositToTreasury()
  const {
    records: activityRecords,
    loading: activityLoading,
    refresh: refreshActivity,
  } = useTreasuryActivity({ enabled: status === "connected", limit: 24 })
  const [amount, setAmount] = useState("")
  const [depositAmount, setDepositAmount] = useState("")
  const [success, setSuccess] = useState(false)
  const [depositSuccess, setDepositSuccess] = useState(false)

  const parsedAmount = useMemo(() => {
    try {
      return amount.trim() ? parseEther(amount.trim()) : 0n
    } catch {
      return null
    }
  }, [amount])
  const parsedDepositAmount = useMemo(() => {
    try {
      return depositAmount.trim() ? parseEther(depositAmount.trim()) : 0n
    } catch {
      return null
    }
  }, [depositAmount])

  const canWithdraw =
    status === "connected" &&
    parsedAmount !== null &&
    parsedAmount > 0n &&
    parsedAmount <= balance &&
    !withdrawing
  const canDeposit =
    status === "connected" &&
    partnerChecked &&
    isPartner &&
    parsedDepositAmount !== null &&
    parsedDepositAmount > 0n &&
    !depositing

  const handleWithdraw = async () => {
    if (!canWithdraw || parsedAmount === null) return

    setSuccess(false)
    const tx = await withdraw(
      parsedAmount,
      transactionFlow.createController({
        chainId,
        fields: [
          { label: t.tx.account, value: shortAddress ?? address ?? "-", tone: "success" },
          { label: t.tx.action, value: t.treasury.withdraw },
          { label: t.tx.details, value: `${amount} ETH` },
        ],
      }).callbacks,
    )

    if (tx) {
      setSuccess(true)
      setAmount("")
      await refresh()
      await refreshActivity()
    }
  }

  const handleDeposit = async () => {
    if (!canDeposit || parsedDepositAmount === null) return

    setDepositSuccess(false)
    const ok = await deposit(
      parsedDepositAmount,
      transactionFlow.createController({
        chainId,
        fields: [
          { label: t.tx.account, value: shortAddress ?? address ?? "-", tone: "success" },
          { label: t.tx.action, value: t.treasury.depositTopUp },
          { label: t.tx.details, value: `${depositAmount} ETH` },
        ],
      }).callbacks,
    )

    if (ok) {
      setDepositSuccess(true)
      setDepositAmount("")
      await Promise.all([refresh(), refreshPartnerDeposit(), refreshActivity()])
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="card border border-base-content/5 bg-base-200">
        <div className="card-body gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{t.treasury.title}</h1>
                <p className="mt-1 text-sm text-base-content/60">{t.treasury.subtitle}</p>
              </div>
            </div>
            <button
              className="btn btn-ghost btn-sm gap-2"
              onClick={() => void refresh()}
              disabled={loading || status !== "connected"}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {t.treasury.refresh}
            </button>
          </div>

          {status !== "connected" ? (
            <div className="alert alert-info py-3">
              <span className="text-sm">{t.treasury.connectToView}</span>
            </div>
          ) : (
            <>
              <div className="rounded-3xl border border-primary/10 bg-primary/10 p-6">
                <p className="text-sm font-medium text-base-content/60">
                  {t.treasury.availableBalance}
                </p>
                <p className="mt-2 font-display text-4xl font-bold text-primary sm:text-5xl">
                  {loading && !checked ? "..." : formatEth(balance)}
                  <span className="ml-2 text-base font-semibold text-base-content/50">ETH</span>
                </p>
                <p className="mt-3 text-sm text-base-content/55">
                  {t.treasury.availableBalanceDesc}
                </p>
              </div>

              <div className="rounded-3xl border border-base-content/5 bg-base-100/70 p-5">
                <label className="form-control gap-2">
                  <span className="label-text font-semibold">{t.treasury.withdrawAmount}</span>
                  <div className="join w-full">
                    <input
                      className="input input-bordered join-item min-w-0 flex-1"
                      inputMode="decimal"
                      placeholder={t.treasury.withdrawAmountPlaceholder}
                      value={amount}
                      onChange={(event) => {
                        setAmount(event.target.value)
                        setSuccess(false)
                      }}
                    />
                    <button
                      type="button"
                      className="btn join-item"
                      onClick={() => setAmount(formatEther(balance))}
                      disabled={balance <= 0n}
                    >
                      {t.treasury.withdrawAll}
                    </button>
                  </div>
                </label>

                {balance <= 0n && (
                  <div className="alert alert-info mt-4 py-3">
                    <span className="text-sm">{t.treasury.noBalance}</span>
                  </div>
                )}
                {parsedAmount === null && amount.trim() && (
                  <div className="alert alert-warning mt-4 py-3">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm">{t.treasury.withdrawAmountPlaceholder}</span>
                  </div>
                )}
                {error && (
                  <div className="alert alert-error mt-4 py-3">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm">{error}</span>
                  </div>
                )}
                {success && (
                  <div className="alert alert-success mt-4 py-3">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm">{t.treasury.withdrawSuccess}</span>
                  </div>
                )}

                <button
                  className="btn btn-primary mt-5 w-full gap-2"
                  onClick={() => void handleWithdraw()}
                  disabled={!canWithdraw}
                >
                  {withdrawing && <span className="loading loading-spinner loading-sm" />}
                  {withdrawing ? t.treasury.withdrawing : t.treasury.withdraw}
                </button>
              </div>
            </>
          )}
        </div>
        </section>

        <div className="space-y-6">
          <aside className="card border border-base-content/5 bg-base-200">
            <div className="card-body gap-4">
              <h2 className="text-lg font-bold">{t.treasury.partnerManagement}</h2>
              <p className="text-sm text-base-content/60">{t.treasury.partnerManagementDesc}</p>

              {status !== "connected" ? (
                <div className="alert alert-info py-3">
                  <span className="text-sm">{t.treasury.connectToView}</span>
                </div>
              ) : partnerLoading ? (
                <div className="h-24 animate-pulse rounded-2xl bg-base-300/70" />
              ) : !partnerChecked || !isPartner ? (
                <div className="alert border border-warning/15 bg-warning/5 py-3 text-base-content">
                  <ShieldAlert className="h-4 w-4 text-warning" />
                  <span className="text-sm">{t.treasury.partnerOnly}</span>
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <div className="rounded-2xl border border-base-content/5 bg-base-100/70 p-4">
                      <p className="text-xs text-base-content/45">
                        {t.treasury.availablePartnerDeposit}
                      </p>
                      <p className="mt-1 font-display text-xl font-bold text-secondary">
                        {partnerDepositLoading ? "..." : formatEth(partnerDepositBalance)} ETH
                      </p>
                    </div>
                    <div className="rounded-2xl border border-base-content/5 bg-base-100/70 p-4">
                      <p className="text-xs text-base-content/45">
                        {t.treasury.requiredPartnerDeposit}
                      </p>
                      <p className="mt-1 font-display text-xl font-bold">
                        {formatEth(requiredDeposit)} ETH
                      </p>
                    </div>
                  </div>

                  <label className="form-control gap-2">
                    <span className="label-text font-semibold">{t.treasury.depositAmount}</span>
                    <input
                      className="input input-bordered"
                      inputMode="decimal"
                      placeholder={t.treasury.depositAmountPlaceholder}
                      value={depositAmount}
                      onChange={(event) => {
                        setDepositAmount(event.target.value)
                        setDepositSuccess(false)
                      }}
                    />
                  </label>

                  {depositError && (
                    <div className="alert alert-error py-3">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm">{depositError}</span>
                    </div>
                  )}
                  {depositSuccess && (
                    <div className="alert alert-success py-3">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm">{t.treasury.depositSuccess}</span>
                    </div>
                  )}

                  <button
                    className="btn btn-secondary w-full gap-2"
                    onClick={() => void handleDeposit()}
                    disabled={!canDeposit}
                  >
                    {depositing && <span className="loading loading-spinner loading-sm" />}
                    {depositing ? t.create.depositing : t.treasury.depositTopUp}
                  </button>
                </>
              )}
            </div>
          </aside>

          <aside className="card border border-base-content/5 bg-base-200">
            <div className="card-body gap-4">
              <h2 className="text-lg font-bold">{t.treasury.balanceSourcesTitle}</h2>
              <p className="text-sm text-base-content/60">{t.treasury.balanceSourcesDesc}</p>
              <div className="space-y-3">
                {[
                  t.treasury.sourcePartnerDeposit,
                  t.treasury.sourcePrizePayout,
                  t.treasury.sourceRefundCompensation,
                  t.treasury.sourceUnlockedDeposit,
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-base-content/5 bg-base-100/70 px-4 py-3 text-sm text-base-content/75"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {status === "connected" && (
        <TreasuryActivityList
          title={t.treasury.activityTitle}
          description={t.treasury.activityDesc}
          records={activityRecords}
          loading={activityLoading}
          onRefresh={() => void refreshActivity()}
        />
      )}
    </div>
  )
}
