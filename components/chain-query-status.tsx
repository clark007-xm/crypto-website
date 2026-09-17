"use client"
import { useOneTapCopy } from "@/components/one-tap/navigation"
import { ChainCacheStatus } from "@/components/one-tap/chain-read-status"
import type { ReadErrorKind } from "@/lib/rpc/read-client"

export function ChainQueryStatus({ error, loading, onRefresh, complete = true, hasMore = false, onLoadMore, scannedBlocks = 0, updatedAt = 0, olderLabel }: {
  error: ReadErrorKind | null; loading: boolean; onRefresh: () => void
  complete?: boolean; hasMore?: boolean; onLoadMore?: () => void; scannedBlocks?: number; updatedAt?: number; olderLabel?: string
}) {
  const copy = useOneTapCopy()
  return <div className="space-y-2 text-sm" aria-live="polite">
    {error && <p role="alert" className="text-error">{error === "rate-limit" ? copy.rateLimited : error === "timeout" ? copy.readTimeout : copy.readUnavailable}</p>}
    {!complete && <p className="text-xs text-base-content/60">{copy.scanProgress.replace("{n}", scannedBlocks.toLocaleString())} · {copy.partialNote}</p>}
    <ChainCacheStatus updatedAt={updatedAt} cached={loading || Boolean(error)} loading={loading} />
    {error && <button className="btn btn-outline btn-sm" disabled={loading} onClick={onRefresh}>{copy.retryRead}</button>}
    {hasMore && !error && <button className="btn btn-outline btn-sm" disabled={loading} onClick={onLoadMore}>{olderLabel ?? copy.loadOlder}</button>}
  </div>
}
