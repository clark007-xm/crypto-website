"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  History,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Ticket,
} from "lucide-react"
import { formatEther, ZeroAddress } from "ethers"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  useAllPurchaseHistory,
  type GlobalSessionPurchaseRecord,
  type SessionCatalogFromEvent,
} from "@/lib/contracts/hooks"
import { getExplorerAddressUrl, getExplorerTxUrl } from "@/lib/contracts/addresses"
import { useT } from "@/lib/i18n/context"
import {
  formatTicketRange,
  loadAllLocalPurchaseRecords,
  mergePurchaseHistory,
  shortAddress,
  shortHash,
  type LocalPurchaseRecord,
  type PurchaseHistoryWithLocal,
} from "@/lib/purchase-history"
import { CHAINS } from "@/lib/rpc/nodes"
import { useRpc } from "@/lib/rpc/context"
import { useWallet } from "@/lib/wallet/context"

interface GroupedPurchaseHistory {
  session: SessionCatalogFromEvent
  records: PurchaseHistoryWithLocal<GlobalSessionPurchaseRecord>[]
  totalTickets: number
}

function formatPurchaseAmount(amountWei: bigint, isEth: boolean) {
  return `${Number(formatEther(amountWei)).toFixed(4)} ${isEth ? "ETH" : "TOKEN"}`
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-base-content/5 bg-base-100/70 p-4">
      <p className="text-xs text-base-content/45">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  )
}

function PurchaseOrderContent({
  record,
  copiedKey,
  revealedSecrets,
  onCopy,
  onToggleSecret,
  t,
}: {
  record: PurchaseHistoryWithLocal<GlobalSessionPurchaseRecord>
  copiedKey: string | null
  revealedSecrets: Record<string, boolean>
  onCopy: (key: string, value: string) => Promise<void>
  onToggleSecret: (key: string) => void
  t: ReturnType<typeof useT>
}) {
  const isEth = record.session.paymentToken === ZeroAddress
  const totalCostWei = record.session.ticketPrice * record.quantity
  const purchasedAt =
    record.blockTimestamp > 0 ? new Date(record.blockTimestamp * 1000).toLocaleString() : "-"
  const localDetails = record.localDetails
  const localSavedAt = localDetails?.timestamp
    ? new Date(localDetails.timestamp).toLocaleString()
    : null
  const recordKey = `${record.transactionHash}-${record.logIndex}`
  const isRevealed = Boolean(revealedSecrets[recordKey])

  return (
    <AccordionItem value={recordKey} className="border-base-content/5">
      <AccordionTrigger className="py-4 hover:no-underline">
        <div className="flex w-full flex-col gap-3 pr-3 text-left sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{purchasedAt}</p>
            <p className="mt-1 text-xs text-base-content/45">
              {shortHash(record.transactionHash)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Ticket className="h-3.5 w-3.5" />
              {t.session.quantity}: {record.quantity.toString()}
            </span>
            <span className="rounded-full border border-base-content/10 bg-base-200 px-3 py-1 text-xs font-semibold text-base-content/70">
              {formatTicketRange(record.firstTicketIndex, record.lastTicketIndex)}
            </span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pt-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoCard label={t.session.quantity} value={record.quantity.toString()} />
          <InfoCard
            label={t.session.ticketRange}
            value={formatTicketRange(record.firstTicketIndex, record.lastTicketIndex)}
          />
          <InfoCard
            label={t.session.purchaseAmount}
            value={formatPurchaseAmount(totalCostWei, isEth)}
          />
          <InfoCard label={t.session.purchasedAt} value={purchasedAt} />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-base-content/5 bg-base-200/70 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs text-base-content/45">{t.session.transactionHash}</p>
            <p className="mt-1 truncate font-mono text-sm">{shortHash(record.transactionHash)}</p>
          </div>
          <a
            href={getExplorerTxUrl(record.session.chainId, record.transactionHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            {t.session.viewTransaction}
          </a>
        </div>

        {localDetails ? (
          <div className="mt-3 rounded-2xl border border-success/15 bg-success/5 p-4">
            <div className="flex items-center gap-2 text-success">
              <ShieldCheck className="h-4 w-4" />
              <p className="text-sm font-semibold">{t.session.localRecordFound}</p>
            </div>
            <p className="mt-1 text-xs text-base-content/55">
              {localSavedAt
                ? t.session.localRecordSavedAt.replace("{time}", localSavedAt)
                : t.session.localRecordDesc}
            </p>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-base-content/5 bg-base-100/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-base-content/45">{t.session.commitmentHash}</p>
                  <button
                    className="btn btn-ghost btn-xs gap-1"
                    onClick={() => void onCopy(`${recordKey}-commitment`, localDetails.commitment)}
                  >
                    {copiedKey === `${recordKey}-commitment` ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-success" />
                        {t.wallet.copied}
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        {t.session.copyDetail}
                      </>
                    )}
                  </button>
                </div>
                <p className="mt-2 break-all font-mono text-xs text-base-content/80">
                  {localDetails.commitment}
                </p>
              </div>

              <div className="rounded-xl border border-base-content/5 bg-base-100/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-base-content/45">{t.session.secretKey}</p>
                  <div className="flex items-center gap-1">
                    <button
                      className="btn btn-ghost btn-xs btn-circle"
                      onClick={() => onToggleSecret(recordKey)}
                    >
                      {isRevealed ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      className="btn btn-ghost btn-xs gap-1"
                      onClick={() => void onCopy(`${recordKey}-secret`, localDetails.secret)}
                    >
                      {copiedKey === `${recordKey}-secret` ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-success" />
                          {t.wallet.copied}
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          {t.session.copyDetail}
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <p className="mt-2 break-all font-mono text-xs text-base-content/80">
                  {isRevealed ? localDetails.secret : "••••••••••••••••"}
                </p>
              </div>

              <div className="rounded-xl border border-base-content/5 bg-base-100/80 p-3">
                <p className="text-xs text-base-content/45">{t.session.paymentMethod}</p>
                <p className="mt-2 font-semibold">
                  {localDetails.useBalance
                    ? t.session.treasuryPayment
                    : t.session.walletPayment}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="alert mt-3 border border-warning/15 bg-warning/5 py-3 text-base-content">
            <ShieldAlert className="h-4 w-4 text-warning" />
            <span className="text-sm">{t.session.localRecordMissing}</span>
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  )
}

export function AllPurchaseHistory() {
  const t = useT()
  const { chain } = useRpc()
  const { status, address } = useWallet()
  const { records, loading, refresh } = useAllPurchaseHistory()
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [localRecordsBySession, setLocalRecordsBySession] = useState<Record<string, LocalPurchaseRecord[]>>({})

  useEffect(() => {
    setLocalRecordsBySession(loadAllLocalPurchaseRecords(address))
  }, [address, records])

  const groupedSessions = useMemo(() => {
    const groups = new Map<
      string,
      { session: SessionCatalogFromEvent; records: GlobalSessionPurchaseRecord[] }
    >()

    for (const record of records) {
      const key = record.session.sessionAddress.toLowerCase()
      const existing = groups.get(key)
      if (existing) {
        existing.records.push(record)
      } else {
        groups.set(key, {
          session: record.session,
          records: [record],
        })
      }
    }

    return Array.from(groups.values()).map((group) => {
      const mergedRecords = mergePurchaseHistory(
        group.records,
        localRecordsBySession[group.session.sessionAddress.toLowerCase()] ?? []
      )

      return {
        session: group.session,
        records: mergedRecords,
        totalTickets: mergedRecords.reduce((sum, record) => sum + Number(record.quantity), 0),
      } satisfies GroupedPurchaseHistory
    })
  }, [localRecordsBySession, records])

  const totalOrders = records.length
  const totalTickets = groupedSessions.reduce((sum, group) => sum + group.totalTickets, 0)

  const toggleSecret = (key: string) => {
    setRevealedSecrets((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  const copyValue = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedKey(key)
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current))
    }, 1500)
  }

  if (status !== "connected") {
    return (
      <div className="card border border-base-content/5 bg-base-200">
        <div className="card-body gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-2.5 text-primary">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t.session.allPurchaseHistory}</h1>
              <p className="text-sm text-base-content/60">{t.session.allPurchaseHistoryDesc}</p>
            </div>
          </div>
          <div className="alert alert-info py-3">
            <span className="text-sm">{t.session.connectToViewAllRecords}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card border border-base-content/5 bg-base-200">
      <div className="card-body gap-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-2.5 text-primary">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t.session.allPurchaseHistory}</h1>
              <p className="text-sm text-base-content/60">{t.session.allPurchaseHistoryDesc}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <div className="rounded-full border border-base-content/10 bg-base-100 px-3 py-1 text-sm font-semibold">
              {t.rpc.network}: {CHAINS[chain].name}
            </div>
            <div className="rounded-full border border-base-content/10 bg-base-100 px-3 py-1 text-sm font-semibold">
              {t.session.sessionCount.replace("{count}", groupedSessions.length.toString())}
            </div>
            <div className="rounded-full border border-base-content/10 bg-base-100 px-3 py-1 text-sm font-semibold">
              {t.session.ordersCount.replace("{count}", totalOrders.toString())}
            </div>
            <div className="rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              {t.session.ticketsCount.replace("{count}", totalTickets.toString())}
            </div>
            <button
              className="btn btn-ghost btn-sm gap-2"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {t.products.refresh}
            </button>
          </div>
        </div>

        {loading && groupedSessions.length === 0 && (
          <div className="flex items-center justify-center py-10">
            <span className="loading loading-spinner loading-md text-primary" />
          </div>
        )}

        {!loading && groupedSessions.length === 0 && (
          <div className="rounded-2xl border border-dashed border-base-content/15 bg-base-100/60 px-4 py-10 text-center">
            <p className="font-semibold text-base-content/70">{t.session.noGlobalPurchaseHistory}</p>
            <p className="mt-2 text-sm text-base-content/45">
              {t.session.noGlobalPurchaseHistoryDesc}
            </p>
          </div>
        )}

        {groupedSessions.length > 0 && (
          <Accordion
            type="multiple"
            className="rounded-3xl border border-base-content/5 bg-base-100/60 px-4"
          >
            {groupedSessions.map((group) => {
              const isEth = group.session.paymentToken === ZeroAddress
              const totalPoolWei = group.session.ticketPrice * group.session.totalTickets

              return (
                <AccordionItem
                  key={group.session.sessionAddress}
                  value={group.session.sessionAddress}
                  className="border-base-content/5"
                >
                  <AccordionTrigger className="py-5 hover:no-underline">
                    <div className="flex w-full flex-col gap-3 pr-3 text-left lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold">
                            {isEth ? t.products.ethPool : t.products.tokenPool}
                          </span>
                          <span className="rounded-full border border-base-content/10 bg-base-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-base-content/60">
                            {shortAddress(group.session.sessionAddress)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-base-content/45">
                          {formatPurchaseAmount(totalPoolWei, isEth)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <span className="rounded-full border border-base-content/10 bg-base-200 px-3 py-1 text-xs font-semibold text-base-content/70">
                          {t.session.ordersCount.replace("{count}", group.records.length.toString())}
                        </span>
                        <span className="rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                          {t.session.ticketsCount.replace("{count}", group.totalTickets.toString())}
                        </span>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-1">
                    <div className="flex flex-col gap-3 rounded-2xl border border-base-content/5 bg-base-200/50 p-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs text-base-content/45">{t.session.sessionAddress}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Link
                            href={`/session/${group.session.sessionAddress}`}
                            className="font-mono text-sm font-semibold text-base-content/80 transition-colors hover:text-primary"
                          >
                            {shortAddress(group.session.sessionAddress)}
                          </Link>
                          <a
                            href={getExplorerAddressUrl(group.session.chainId, group.session.sessionAddress)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-ghost btn-xs btn-circle"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                      <Link
                        href={`/session/${group.session.sessionAddress}`}
                        className="btn btn-ghost btn-sm gap-2"
                      >
                        <ArrowUpRight className="h-4 w-4" />
                        {t.session.openSession}
                      </Link>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <InfoCard
                        label={t.session.ticketPrice}
                        value={formatPurchaseAmount(group.session.ticketPrice, isEth)}
                      />
                      <InfoCard
                        label={t.session.totalTicketsLabel}
                        value={group.session.totalTickets.toString()}
                      />
                      <InfoCard
                        label={t.products.prizeValue}
                        value={formatPurchaseAmount(totalPoolWei, isEth)}
                      />
                    </div>

                    <Accordion
                      type="single"
                      collapsible
                      className="mt-4 rounded-2xl border border-base-content/5 bg-base-100/70 px-4"
                    >
                      {group.records.map((record) => (
                        <PurchaseOrderContent
                          key={`${record.transactionHash}-${record.logIndex}`}
                          record={record}
                          copiedKey={copiedKey}
                          revealedSecrets={revealedSecrets}
                          onCopy={copyValue}
                          onToggleSecret={toggleSecret}
                          t={t}
                        />
                      ))}
                    </Accordion>
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        )}
      </div>
    </div>
  )
}
