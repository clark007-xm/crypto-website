"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useSearchParams } from "next/navigation"
import { useTheme } from "next-themes"
import { ArrowRight, ChevronRight, Clock3, Coins, FileText, RefreshCw, ShieldCheck, Ticket, Wallet } from "lucide-react"
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts"
import { Navbar } from "@/components/navbar"
import { RecentWinners } from "@/components/recent-winners"
import { useActiveSessions, getSessionPhaseState, type SessionConfigFromEvent } from "@/lib/contracts/hooks"
import { formatTokenValue, getPaymentTokenSymbol } from "@/lib/token-format"
import { useCountdown } from "@/hooks/use-countdown"
import { useOneTapCopy } from "./navigation"
import { PreviewDialog } from "./preview-dialog"
import { ChainReadStatus, ChainCacheStatus } from "./chain-read-status"
import type { ReadErrorKind } from "@/lib/rpc/read-client"

interface Pool {
  id: string
  amount: string
  symbol: string
  price: string
  sold: number
  total: number
  deadline: number
  state: "active" | "upcoming" | "full" | "settled" | "revealing"
  session?: SessionConfigFromEvent
}
const SAMPLE_POOLS: Pool[] = [
  { id: "sample-featured", amount: "1,000", symbol: "USDT", price: "1", sold: 680, total: 1000, deadline: 0, state: "active" },
  { id: "sample-small", amount: "100", symbol: "USDT", price: "1", sold: 32, total: 100, deadline: 0, state: "active" },
]
function compactAmount(amount: bigint, decimals: number) {
  return formatTokenValue(amount, decimals, Math.min(decimals, 4)).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1")
}
function toPool(session: SessionConfigFromEvent): Pool {
  const phase = getSessionPhaseState(session.unlockTimestamp, session.commitDeadline, session.isSettled)
  const total = Number(session.totalTickets)
  const sold = Number(session.ticketsSold)
  return {
    id: session.sessionAddress, session,
    amount: compactAmount(session.ticketPrice * session.totalTickets, session.paymentTokenDecimals),
    symbol: getPaymentTokenSymbol(session.paymentToken, session.paymentTokenSymbol),
    price: compactAmount(session.ticketPrice, session.paymentTokenDecimals), sold, total,
    deadline: Number(phase.isUpcoming ? session.unlockTimestamp : session.commitDeadline) * 1000,
    state: session.isSettled ? "settled" : phase.isUpcoming ? "upcoming" : phase.isRevealPhase ? "revealing" : sold >= total ? "full" : "active",
  }
}

function Deadline({ pool, preview }: { pool: Pool; preview: boolean }) {
  const copy = useOneTapCopy()
  const countdown = useCountdown(pool.deadline)
  if (preview) return <time className="ot-countdown">02:18:36</time>
  if (pool.state === "settled" || pool.state === "revealing" || pool.state === "full") return <span className="ot-status-label">{copy[pool.state]}</span>
  return <time className="ot-countdown">{countdown.days > 0 ? `${countdown.days}d ` : ""}{[countdown.hours, countdown.minutes, countdown.seconds].map(v => String(v).padStart(2, "0")).join(":")}</time>
}
function PoolAction({ pool, preview, onPreview }: { pool: Pool; preview: boolean; onPreview: () => void }) {
  const copy = useOneTapCopy()
  const content = <><span>{pool.state === "active" ? copy.enter : copy.detail}<small>{pool.price} {pool.symbol} / {copy.unit}</small></span><ArrowRight size={24} /></>
  return <div className="ot-pool-actions">
    {preview ? <button className="ot-primary" onClick={onPreview}>{content}</button> : <Link href={`/session/${pool.id}`} className="ot-primary">{content}</Link>}
    <a href="#rules" className="ot-rules-link"><FileText size={20} /><span>{copy.rules}</span><ChevronRight size={18} /></a>
  </div>
}
function Amount({ pool }: { pool: Pool }) {
  return <div className={`ot-amount ${pool.amount.length > 7 ? "ot-amount-long" : ""}`}><strong>{pool.amount}</strong><span>{pool.symbol}</span></div>
}
function ThemeOnePool({ pool, preview, onPreview }: { pool: Pool; preview: boolean; onPreview: () => void }) {
  const copy = useOneTapCopy()
  return <section className="ot-featured ot-paper-pool" aria-label={copy.featured}>
    <div className="ot-paper-value">
      <div className="ot-pool-heading"><h2>{copy.featured}</h2>{preview && <span className="ot-sample">{copy.sample}</span>}</div>
      <Amount pool={pool} />
      <Image className="ot-blue-coin" src="/images/theme-one-coin.png" alt="" width={320} height={320} priority />
    </div>
    <div className="ot-facts">
      <div className="ot-fact"><span>{copy.each}</span><strong>{pool.price} {pool.symbol}</strong></div>
      <div className="ot-fact ot-fact-progress"><span>{copy.sold}</span><div><div className="ot-progress-numbers"><strong>{pool.sold.toLocaleString()} / {pool.total.toLocaleString()} <small>{copy.shares}</small></strong><span>{copy.remaining} <b>{Math.max(0, pool.total - pool.sold).toLocaleString()}</b> {copy.shares}</span></div><progress aria-label={copy.sold} value={pool.sold} max={Math.max(1, pool.total)} /></div></div>
      <div className="ot-fact"><span>{pool.state === "upcoming" ? copy.starts : copy.deadline}</span><Deadline pool={pool} preview={preview} /></div>
    </div>
    <PoolAction pool={pool} preview={preview} onPreview={onPreview} />
  </section>
}
function ThemeTwoPool({ pool, preview, onPreview }: { pool: Pool; preview: boolean; onPreview: () => void }) {
  const copy = useOneTapCopy()
  const [gaugeWidth, setGaugeWidth] = useState(316)
  const progress = Math.min(100, Math.max(0, pool.total ? pool.sold / pool.total * 100 : 0))
  return <section className="ot-featured ot-night-pool" aria-label={copy.featured}>
    <div className="ot-ticket-surface">
      {preview && <span className="ot-sample">{copy.sample}</span>}
      <div className="ot-pool-heading"><h2>{copy.featured}</h2></div>
      <Amount pool={pool} />
      <div className="ot-gauge" role="img" aria-label={`${copy.sold} ${pool.sold} / ${pool.total}`}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} onResize={width => setGaugeWidth(width)}>
          <RadialBarChart data={[{ value: progress }]} innerRadius={gaugeWidth * .42 - 8} outerRadius={gaugeWidth * .42 + 4} startAngle={160} endAngle={20} cx="50%" cy={gaugeWidth * .42 + 8} barSize={12}>
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar dataKey="value" background={{ fill: "#343952" }} fill="#ff826c" cornerRadius={20} isAnimationActive={false} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="ot-gauge-label"><strong>{pool.sold.toLocaleString()} <span>/ {pool.total.toLocaleString()} {copy.shares}</span></strong><span>{copy.remaining} <b>{Math.max(0, pool.total - pool.sold).toLocaleString()}</b> {copy.shares}</span></div>
      </div>
      <div className="ot-night-facts"><div><Coins aria-hidden="true" /><p><strong>{copy.each} {pool.price} {pool.symbol}</strong><span>{copy.featured}</span></p></div><div><Clock3 aria-hidden="true" /><p><span>{pool.state === "upcoming" ? copy.starts : copy.deadline}</span><Deadline pool={pool} preview={preview} /></p></div></div>
    </div>
    <PoolAction pool={pool} preview={preview} onPreview={onPreview} />
  </section>
}
function MorePools({ pools, preview, onPreview }: { pools: Pool[]; preview: boolean; onPreview: (pool: Pool) => void }) {
  const copy = useOneTapCopy()
  return <section className="ot-more-pools" aria-label={copy.more}>
    {pools.map(pool => {
      const content = <><Coins className="ot-small-pool-icon" aria-hidden="true" /><div><span className="ot-muted">{preview ? copy.small : copy.live}</span><p><strong>{pool.amount}</strong> <span>{pool.symbol}</span></p><small>{copy.each} {pool.price} {pool.symbol}</small></div><ChevronRight className="ot-row-arrow" aria-hidden="true" /></>
      return preview ? <button className="ot-pool-row" key={pool.id} onClick={() => onPreview(pool)}>{content}</button> : <Link className="ot-pool-row" key={pool.id} href={`/session/${pool.id}`}>{content}</Link>
    })}
  </section>
}
function Rules() {
  const copy = useOneTapCopy()
  return <section id="rules" className="ot-fairness">
    <div><span className="ot-section-label"><ShieldCheck size={19} />{copy.fairness}</span><h2>{copy.fairnessTitle}</h2><p>{copy.fairnessIntro}</p></div>
    <div className="ot-rule-list">{[{ title: copy.ruleA, body: copy.ruleAText, icon: Ticket }, { title: copy.ruleB, body: copy.ruleBText, icon: Clock3 }, { title: copy.ruleC, body: copy.ruleCText, icon: Wallet }].map(({ title, body, icon: Icon }) => <article key={title}><Icon size={22} /><div><h3>{title}</h3><p>{body}</p></div></article>)}</div>
  </section>
}
function Presentation({ pools, loading = false, preview, refresh, error = null, complete = true, scannedBlocks = 0, hasMore = false, loadMore, updatedAt = 0, showingCached = false }: { pools: Pool[]; loading?: boolean; preview: boolean; refresh?: () => void; error?: ReadErrorKind | null; complete?: boolean; scannedBlocks?: number; hasMore?: boolean; loadMore?: () => void; updatedAt?: number; showingCached?: boolean }) {
  const copy = useOneTapCopy()
  const { theme } = useTheme()
  const requestedTheme = useSearchParams().get("theme")
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted ? theme === "onetap-dark" : requestedTheme === "two"
  const [previewOpen, setPreviewOpen] = useState(false)
  const [showWinners, setShowWinners] = useState(false)
  const [previewMax, setPreviewMax] = useState(320)
  const openPreview = (selected: Pool) => {
    setPreviewMax(Math.max(1, selected.total - selected.sold))
    setPreviewOpen(true)
  }
  const pool = pools[0]
  return <main id="top" className="ot-home">
    <Navbar />
    <div className="ot-home-content">
      <div id="ongoing" className="ot-main-composition">
        <section className="ot-intro" aria-label="One Tap">
          {dark ? <><Image className="ot-night-scene" src="/images/theme-two-scene.png" alt="" width={1536} height={1024} priority sizes="(max-width: 767px) 100vw, 600px" /><h1>{copy.darkA}<br />{copy.darkB}</h1><p>{copy.tagline}</p></> : <h1>{copy.headlineA}<br />{copy.headlineB}<span className="ot-headline-dot">.</span></h1>}
        </section>
        {pool ? (dark ? <ThemeTwoPool pool={pool} preview={preview} onPreview={() => openPreview(pool)} /> : <ThemeOnePool pool={pool} preview={preview} onPreview={() => openPreview(pool)} />) : <section className="ot-pool-empty" aria-live="polite"><div className="ot-empty-icon">{loading ? <RefreshCw className="animate-spin" /> : <Coins />}</div><h2>{error ? copy.readFailed : loading ? copy.loading : complete ? copy.empty : copy.partialTitle}</h2><p>{error ? (error === "rate-limit" ? copy.rateLimited : error === "timeout" ? copy.readTimeout : copy.readUnavailable) : loading ? copy.loadingDesc : complete ? copy.emptyDesc : copy.partialNote}</p>{!loading && <button className="ot-primary" onClick={refresh}><RefreshCw size={18} />{copy.refresh}</button>}<a className="ot-rules-link" href="#rules">{copy.rules}<ArrowRight size={18} /></a></section>}
        {pools.length > 1 && <MorePools pools={pools.slice(1)} preview={preview} onPreview={openPreview} />}
      </div>
      {!preview && <ChainReadStatus error={error} loading={loading} complete={complete} scannedBlocks={scannedBlocks} hasMore={hasMore} refresh={() => refresh?.()} loadMore={() => loadMore?.()} />}
      {!preview && pools.length > 0 && <ChainCacheStatus updatedAt={updatedAt} cached={showingCached} loading={loading} />}
      <div className="ot-data-note"><p>{copy.poolNote}{error && pools.length > 0 && <> {copy.cachedNote}</>}</p>{preview ? <Link href="/" className="ot-text-button">{copy.realMode}<ArrowRight size={15} /></Link> : <button className="ot-text-button" onClick={refresh} disabled={loading}><RefreshCw size={15} />{copy.refresh}</button>}</div>
      <Rules />
      {!preview && (showWinners ? <RecentWinners /> : <section id="history" className="ot-deferred-history"><h2>{copy.history}</h2><p>{copy.winnersDeferred}</p><button className="ot-text-button" onClick={() => setShowWinners(true)}>{copy.loadWinners}<ArrowRight size={16} /></button></section>)}
      <footer className="ot-footer"><span>{copy.footer}</span><Link href="/records">{copy.account}<ArrowRight size={15} /></Link></footer>
    </div>
    {preview && <PreviewDialog open={previewOpen} maxEntries={previewMax} onClose={() => setPreviewOpen(false)} />}
  </main>
}
function LiveHome() {
  const { sessions, loading, refresh, error, complete, scannedBlocks, hasMore, loadMore, updatedAt, showingCached } = useActiveSessions()
  const pools = useMemo(() => sessions.map(toPool).sort((a, b) => Number(b.state === "active") - Number(a.state === "active")), [sessions])
  // The chain query already owns refresh. No fabricated fallback pools are introduced.
  return <Presentation pools={pools} loading={loading} preview={false} refresh={refresh} error={error} complete={complete} scannedBlocks={scannedBlocks} hasMore={hasMore} loadMore={loadMore} updatedAt={updatedAt} showingCached={showingCached} />
}
export function OneTapHome() {
  const search = useSearchParams()
  const preview = search.get("preview") === "1"
  // Explicit demo URL is a separate render branch with no session or write hooks.
  return preview ? <Presentation pools={SAMPLE_POOLS} preview /> : <LiveHome />
}
