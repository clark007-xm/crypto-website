"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, Copy, ExternalLink, Eye, EyeOff, History, ShieldAlert, ShieldCheck, Ticket } from "lucide-react"
import { formatEther, ZeroAddress } from "ethers"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { useT } from "@/lib/i18n/context"
import { getExplorerTxUrl } from "@/lib/contracts/addresses"
import {
  useSessionPurchaseHistory,
  type SessionConfigFromEvent,
} from "@/lib/contracts/hooks"
import {
  formatTicketRange,
  loadLocalPurchaseRecords,
  mergePurchaseHistory,
  shortHash,
  type LocalPurchaseRecord,
} from "@/lib/purchase-history"
import { useWallet } from "@/lib/wallet/context"

interface SessionPurchaseHistoryProps {
  session: SessionConfigFromEvent
  refreshNonce?: number
}

export function SessionPurchaseHistory({
  session,
  refreshNonce = 0,
}: SessionPurchaseHistoryProps) {
  const t = useT()
  const { status, address } = useWallet()
  const { records, loading, refresh } = useSessionPurchaseHistory(session.sessionAddress)
  const [localRecords, setLocalRecords] = useState<LocalPurchaseRecord[]>([])
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    setLocalRecords(loadLocalPurchaseRecords(session.sessionAddress, address))
  }, [address, refreshNonce, session.sessionAddress])

  useEffect(() => {
    if (status === "connected") {
      void refresh()
    }
  }, [refresh, refreshNonce, status])

  const mergedRecords = useMemo(
    () => mergePurchaseHistory(records, localRecords),
    [localRecords, records]
  )
  const syncedTxHashes = useMemo(
    () =>
      new Set(
        records.map((record) => record.transactionHash.toLowerCase())
      ),
    [records]
  )
  const pendingLocalRecords = useMemo(
    () =>
      localRecords.filter((record) => {
        const txHash = record.txHash?.toLowerCase()
        return Boolean(txHash && !syncedTxHashes.has(txHash))
      }),
    [localRecords, syncedTxHashes]
  )
  const totalOrders = mergedRecords.length + pendingLocalRecords.length
  const totalTickets =
    mergedRecords.reduce((sum, record) => sum + Number(record.quantity), 0) +
    pendingLocalRecords.reduce((sum, record) => sum + record.quantity, 0)
  const hasVisibleRecords = mergedRecords.length > 0 || pendingLocalRecords.length > 0
  const isEth = session.paymentToken === ZeroAddress

  const pendingRecords = useMemo(
    () =>
      pendingLocalRecords.map((record) => ({
        ...record,
        purchasedAt: new Date(record.timestamp).toLocaleString(),
        totalCostWei:
          typeof record.ticketPriceWei === "string"
            ? BigInt(record.ticketPriceWei) * BigInt(record.quantity)
            : session.ticketPrice * BigInt(record.quantity),
      })),
    [pendingLocalRecords, session.ticketPrice]
  )

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
      <div className="card mt-6 border border-base-content/5 bg-base-200">
        <div className="card-body gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-2.5 text-primary">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">{t.session.purchaseHistory}</h3>
              <p className="text-sm text-base-content/60">{t.session.purchaseHistoryDesc}</p>
            </div>
          </div>
          <div className="alert alert-info py-3">
            <span className="text-sm">{t.session.connectToViewRecords}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card mt-6 border border-base-content/5 bg-base-200">
      <div className="card-body gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-2.5 text-primary">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">{t.session.purchaseHistory}</h3>
              <p className="text-sm text-base-content/60">{t.session.purchaseHistoryDesc}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <div className="rounded-full border border-base-content/10 bg-base-100 px-3 py-1 text-sm font-semibold">
              {t.session.ordersCount.replace("{count}", totalOrders.toString())}
            </div>
            <div className="rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              {t.session.ticketsCount.replace("{count}", totalTickets.toString())}
            </div>
          </div>
        </div>

        {loading && !hasVisibleRecords && (
          <div className="flex items-center justify-center py-8">
            <span className="loading loading-spinner loading-md text-primary" />
          </div>
        )}

        {pendingRecords.length > 0 && (
          <div className="rounded-2xl border border-info/15 bg-info/5 p-4">
            <div className="flex items-center gap-2 text-info">
              <History className="h-4 w-4" />
              <p className="text-sm font-semibold">{t.tx.sentTitle}</p>
            </div>
            <p className="mt-1 text-xs text-base-content/55">{t.tx.sentSubtitle}</p>

            <div className="mt-4 space-y-3">
              {pendingRecords.map((record, index) => (
                <div
                  key={`${record.txHash}-${record.timestamp}-${index}`}
                  className="rounded-xl border border-base-content/5 bg-base-100/80 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{record.purchasedAt}</p>
                      <p className="mt-1 text-xs text-base-content/45">{t.session.processing}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        <Ticket className="h-3.5 w-3.5" />
                        {t.session.quantity}: {record.quantity}
                      </span>
                      <span className="rounded-full border border-info/20 bg-info/10 px-3 py-1 text-xs font-semibold text-info">
                        {t.tx.progressSent}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-base-content/5 bg-base-200/70 p-4">
                      <p className="text-xs text-base-content/45">{t.session.purchaseAmount}</p>
                      <p className="mt-1 font-semibold">
                        {Number(formatEther(record.totalCostWei)).toFixed(4)} {isEth ? "ETH" : "TOKEN"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-base-content/5 bg-base-200/70 p-4">
                      <p className="text-xs text-base-content/45">{t.session.ticketRange}</p>
                      <p className="mt-1 font-semibold">{t.session.processing}</p>
                    </div>
                  </div>

                  {record.txHash && (
                    <div className="mt-3 flex items-center justify-between rounded-2xl border border-base-content/5 bg-base-200/70 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-xs text-base-content/45">{t.session.transactionHash}</p>
                        <p className="mt-1 truncate font-mono text-sm">{shortHash(record.txHash)}</p>
                      </div>
                      <a
                        href={getExplorerTxUrl(session.chainId, record.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost btn-sm gap-2"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {t.session.viewTransaction}
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && !hasVisibleRecords && (
          <div className="rounded-2xl border border-dashed border-base-content/15 bg-base-100/60 px-4 py-8 text-center">
            <p className="font-semibold text-base-content/70">{t.session.noPurchaseHistory}</p>
            <p className="mt-2 text-sm text-base-content/45">{t.session.noPurchaseHistoryDesc}</p>
          </div>
        )}

        {mergedRecords.length > 0 && (
          <Accordion type="single" collapsible className="rounded-2xl border border-base-content/5 bg-base-100/60 px-4">
            {mergedRecords.map((record, index) => {
              const localDetails = record.localDetails
              const recordKey = record.transactionHash
              const totalCostWei = session.ticketPrice * record.quantity
              const totalCostLabel = `${Number(formatEther(totalCostWei)).toFixed(4)} ${isEth ? "ETH" : "TOKEN"}`
              const purchasedAt = record.blockTimestamp > 0
                ? new Date(record.blockTimestamp * 1000).toLocaleString()
                : "-"
              const localSavedAt = localDetails?.timestamp
                ? new Date(localDetails.timestamp).toLocaleString()
                : null
              const isRevealed = Boolean(revealedSecrets[recordKey])

              return (
                <AccordionItem key={record.transactionHash} value={record.transactionHash} className="border-base-content/5">
                  <AccordionTrigger className="py-4 hover:no-underline">
                    <div className="flex w-full flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {t.session.purchaseOrder.replace("{index}", String(totalOrders - index))}
                        </p>
                        <p className="mt-1 text-xs text-base-content/45">{purchasedAt}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 pr-3 sm:justify-end">
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
                      <div className="rounded-2xl border border-base-content/5 bg-base-200/70 p-4">
                        <p className="text-xs text-base-content/45">{t.session.quantity}</p>
                        <p className="mt-1 font-semibold">{record.quantity.toString()}</p>
                      </div>
                      <div className="rounded-2xl border border-base-content/5 bg-base-200/70 p-4">
                        <p className="text-xs text-base-content/45">{t.session.ticketRange}</p>
                        <p className="mt-1 font-semibold">{formatTicketRange(record.firstTicketIndex, record.lastTicketIndex)}</p>
                      </div>
                      <div className="rounded-2xl border border-base-content/5 bg-base-200/70 p-4">
                        <p className="text-xs text-base-content/45">{t.session.purchaseAmount}</p>
                        <p className="mt-1 font-semibold">{totalCostLabel}</p>
                      </div>
                      <div className="rounded-2xl border border-base-content/5 bg-base-200/70 p-4">
                        <p className="text-xs text-base-content/45">{t.session.purchasedAt}</p>
                        <p className="mt-1 font-semibold">{purchasedAt}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between rounded-2xl border border-base-content/5 bg-base-200/70 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-xs text-base-content/45">{t.session.transactionHash}</p>
                        <p className="mt-1 truncate font-mono text-sm">{shortHash(record.transactionHash)}</p>
                      </div>
                      <a
                        href={getExplorerTxUrl(session.chainId, record.transactionHash)}
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
                                onClick={() => void copyValue(`${recordKey}-commitment`, localDetails.commitment)}
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
                                  onClick={() => toggleSecret(recordKey)}
                                >
                                  {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                  className="btn btn-ghost btn-xs gap-1"
                                  onClick={() => void copyValue(`${recordKey}-secret`, localDetails.secret)}
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
            })}
          </Accordion>
        )}
      </div>
    </div>
  )
}
