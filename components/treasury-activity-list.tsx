"use client"

import { ExternalLink, RefreshCw } from "lucide-react"
import { formatEther } from "ethers"
import { getExplorerTxUrl } from "@/lib/contracts/addresses"
import type { TreasuryActivityKind, TreasuryActivityRecord } from "@/lib/contracts/hooks"
import { useT } from "@/lib/i18n/context"

interface TreasuryActivityListProps {
  title: string
  description: string
  records: TreasuryActivityRecord[]
  loading: boolean
  onRefresh: () => void
}

function formatAmount(amount: bigint | null) {
  if (amount === null) return "-"
  return `${Number(formatEther(amount)).toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  })} ETH`
}

function shortAddress(address: string | null) {
  if (!address) return "-"
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function shortHash(hash: string) {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`
}

function getActivityLabel(kind: TreasuryActivityKind, t: ReturnType<typeof useT>) {
  const labels: Record<TreasuryActivityKind, string> = {
    "balance-updated": t.treasury.eventBalanceUpdated,
    "partner-deposit-updated": t.treasury.eventPartnerDepositUpdated,
    withdraw: t.treasury.eventWithdraw,
    "session-registered": t.treasury.eventSessionRegistered,
    "player-pay-ticket": t.treasury.eventPlayerPayTicket,
    "session-ticket-balance-updated": t.treasury.eventSessionTicketBalanceUpdated,
    "session-deposit-balance-updated": t.treasury.eventSessionDepositBalanceUpdated,
    "distribute-funds": t.treasury.eventDistributeFunds,
    "partner-deposit-locked": t.treasury.eventPartnerDepositLocked,
    "partner-deposit-unlocked": t.treasury.eventPartnerDepositUnlocked,
    "partner-deposit-slashed": t.treasury.eventPartnerDepositSlashed,
    "emergency-partner-deposit-unlocked": t.treasury.eventEmergencyPartnerDepositUnlocked,
  }
  return labels[kind]
}

function getToneClass(record: TreasuryActivityRecord) {
  switch (record.tone) {
    case "in":
      return "border-success/20 bg-success/10 text-success"
    case "out":
      return "border-warning/20 bg-warning/10 text-warning"
    case "warning":
      return "border-error/20 bg-error/10 text-error"
    default:
      return "border-base-content/10 bg-base-200 text-base-content/70"
  }
}

export function TreasuryActivityList({
  title,
  description,
  records,
  loading,
  onRefresh,
}: TreasuryActivityListProps) {
  const t = useT()

  return (
    <section className="card border border-base-content/5 bg-base-200">
      <div className="card-body gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="mt-1 text-sm text-base-content/60">{description}</p>
          </div>
          <button className="btn btn-ghost btn-sm gap-2" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {t.treasury.refresh}
          </button>
        </div>

        {loading && records.length === 0 && (
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-2xl bg-base-300/80" />
            <div className="h-20 animate-pulse rounded-2xl bg-base-300/70" />
            <div className="h-20 animate-pulse rounded-2xl bg-base-300/60" />
          </div>
        )}

        {!loading && records.length === 0 && (
          <div className="rounded-2xl border border-dashed border-base-content/15 bg-base-100/60 px-4 py-8 text-center">
            <p className="font-semibold text-base-content/70">{t.treasury.noActivity}</p>
          </div>
        )}

        {records.length > 0 && (
          <div className="space-y-3">
            {records.map((record) => {
              const happenedAt = record.blockTimestamp
                ? new Date(record.blockTimestamp * 1000).toLocaleString()
                : `#${record.blockNumber}`

              return (
                <div
                  key={`${record.transactionHash}-${record.logIndex}`}
                  className="rounded-2xl border border-base-content/5 bg-base-100/70 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getToneClass(record)}`}>
                          {getActivityLabel(record.kind, t)}
                        </span>
                        <span className="text-xs text-base-content/45">{happenedAt}</span>
                      </div>
                      <p className="mt-2 truncate font-mono text-xs text-base-content/45">
                        {t.treasury.txHash}: {shortHash(record.transactionHash)}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="font-display text-lg font-bold text-primary">
                        {formatAmount(record.amount)}
                      </p>
                      <p className="mt-1 text-xs text-base-content/45">
                        {record.session ? shortAddress(record.session) : shortAddress(record.user ?? record.partner)}
                      </p>
                    </div>
                  </div>

                  <a
                    className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-primary hover:opacity-80"
                    href={getExplorerTxUrl(record.chainId, record.transactionHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t.tx.viewOnExplorer}
                  </a>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
