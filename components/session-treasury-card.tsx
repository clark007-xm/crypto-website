"use client"

import { RefreshCw, ShieldAlert, WalletCards } from "lucide-react"
import { formatEther, ZeroAddress } from "ethers"
import { useSessionTreasuryInfo, type SessionConfigFromEvent } from "@/lib/contracts/hooks"
import { useT } from "@/lib/i18n/context"

interface SessionTreasuryCardProps {
  session: SessionConfigFromEvent
}

function formatEth(value: bigint) {
  return Number(formatEther(value)).toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  })
}

function shortAddress(address: string) {
  if (!address || address === ZeroAddress) return "-"
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-base-content/5 bg-base-100/70 p-4">
      <p className="text-xs text-base-content/45">{label}</p>
      <p className="mt-1 break-all font-semibold">{value}</p>
    </div>
  )
}

export function SessionTreasuryCard({ session }: SessionTreasuryCardProps) {
  const t = useT()
  const { info, loading, refresh } = useSessionTreasuryInfo(
    session.treasury,
    session.sessionAddress,
  )

  return (
    <div className="card mt-6 border border-base-content/5 bg-base-200">
      <div className="card-body gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-2.5 text-primary">
              <WalletCards className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">{t.treasury.sessionFunds}</h3>
              <p className="text-sm text-base-content/60">{t.treasury.sessionFundsDesc}</p>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm gap-2"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {t.treasury.refresh}
          </button>
        </div>

        {loading && !info ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="h-20 animate-pulse rounded-2xl bg-base-300/80" />
            <div className="h-20 animate-pulse rounded-2xl bg-base-300/70" />
            <div className="h-20 animate-pulse rounded-2xl bg-base-300/60" />
            <div className="h-20 animate-pulse rounded-2xl bg-base-300/50" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoTile
              label={t.treasury.ticketPool}
              value={`${formatEth(info?.playerTicketAmount ?? 0n)} ETH`}
            />
            <InfoTile
              label={t.treasury.lockedPartnerDeposit}
              value={`${formatEth(info?.partnerDepositAmount ?? 0n)} ETH`}
            />
            <InfoTile
              label={t.treasury.boundPartner}
              value={shortAddress(info?.partner ?? ZeroAddress)}
            />
            <InfoTile
              label={t.treasury.registeredSession}
              value={info?.isSession ? t.treasury.yes : t.treasury.no}
            />
          </div>
        )}

        <div className="rounded-2xl border border-warning/15 bg-warning/5 p-4">
          <div className="flex items-center gap-2 text-warning">
            <ShieldAlert className="h-4 w-4" />
            <p className="text-sm font-semibold">{t.treasury.emergencyStatus}</p>
          </div>
          <p className="mt-2 text-sm text-base-content/60">
            {t.treasury.emergencyStatusDesc}
          </p>
          <p className="mt-2 text-xs font-semibold text-warning">
            {t.treasury.onlyAdminProject}
          </p>
        </div>
      </div>
    </div>
  )
}
