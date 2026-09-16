"use client"
import { AlertCircle, RefreshCw } from "lucide-react"
import type { ReadErrorKind } from "@/lib/rpc/read-client"
import { useOneTapCopy } from "./navigation"

export function ChainReadStatus({ error, loading, complete, scannedBlocks, hasMore, refresh, loadMore }: {
  error: ReadErrorKind | null; loading: boolean; complete: boolean; scannedBlocks: number; hasMore: boolean
  refresh: () => void; loadMore: () => void
}) {
  const copy = useOneTapCopy()
  return <div className="ot-chain-status" aria-live="polite">
    {error && <p role="alert"><AlertCircle size={18} />{error === "rate-limit" ? copy.rateLimited : error === "timeout" ? copy.readTimeout : copy.readUnavailable}</p>}
    {(!complete || loading) && <p>{copy.scanProgress.replace("{n}", scannedBlocks.toLocaleString())}{!complete && <> · {copy.partialNote}</>}</p>}
    <div>{error && <button className="ot-text-button" onClick={refresh} disabled={loading}><RefreshCw size={16} />{copy.refresh}</button>}
      {hasMore && !error && <button className="ot-text-button" onClick={loadMore} disabled={loading}>{loading ? copy.loading : copy.loadOlder}</button>}</div>
  </div>
}
