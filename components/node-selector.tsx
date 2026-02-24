"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { Activity, RefreshCw, ChevronDown, X } from "lucide-react"
import { useRpc } from "@/lib/rpc/context"
import { useT } from "@/lib/i18n/context"
import { CHAINS } from "@/lib/rpc/nodes"

/* ── Shared node list panel (reused in both desktop dropdown and mobile modal) ── */
function NodeListContent({
  onDone,
}: {
  onDone: () => void
}) {
  const {
    chain,
    nodes,
    healths,
    activeNode,
    autoMode,
    ready,
    selectNode,
    enableAuto,
    refreshAll,
  } = useRpc()
  const t = useT()

  return (
    <>
      {/* header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="font-bold text-sm">{CHAINS[chain].name}</span>
        </div>
        <button
          className="btn btn-ghost btn-xs btn-circle"
          onClick={() => refreshAll()}
          title={t.rpc.refresh}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="divider my-1" />

      {/* auto option */}
      <button
        className={`flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-base-200 ${
          autoMode ? "bg-primary/10 border border-primary/30" : ""
        }`}
        onClick={() => {
          enableAuto()
          onDone()
        }}
      >
        <span className="inline-block w-2 h-2 rounded-full bg-primary" />
        <span className="flex-1 font-medium">{t.rpc.autoBest}</span>
        {autoMode && (
          <span className="badge badge-primary badge-xs">{t.rpc.current}</span>
        )}
      </button>

      <div className="divider my-1" />

      {/* node list */}
      <div className="flex flex-col gap-0.5 max-h-56 overflow-y-auto">
        {nodes.map((node) => {
          const h = healths.get(node.id)
          const isActive = !autoMode && activeNode.id === node.id
          const dotColor =
            !h
              ? "bg-base-content/20"
              : h.status === "online"
                ? "bg-success"
                : h.status === "slow"
                  ? "bg-warning"
                  : "bg-error"
          return (
            <button
              key={node.id}
              className={`flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-base-200 ${
                isActive ? "bg-primary/10 border border-primary/30" : ""
              }`}
              onClick={() => {
                selectNode(node.id)
                onDone()
              }}
            >
              <span
                className={`inline-block w-2 h-2 rounded-full shrink-0 ${dotColor}`}
              />
              <span className="flex-1 truncate">{node.name}</span>
              {h && h.status !== "offline" ? (
                <span
                  className={`tabular-nums text-xs ${
                    h.status === "online" ? "text-success" : "text-warning"
                  }`}
                >
                  {h.latency}ms
                </span>
              ) : h ? (
                <span className="text-xs text-error">{t.rpc.offline}</span>
              ) : (
                <span className="loading loading-dots loading-xs" />
              )}
              {isActive && (
                <span className="badge badge-primary badge-xs shrink-0">
                  {t.rpc.current}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* footer info */}
      <div className="divider my-1" />
      <p className="text-[10px] text-base-content/30 px-1">{t.rpc.footerTip}</p>
    </>
  )
}

export function NodeSelector() {
  const { activeNode, autoMode, healths, ready } = useRpc()
  const t = useT()

  const [desktopOpen, setDesktopOpen] = useState(false)
  const desktopRef = useRef<HTMLDivElement>(null)
  const mobileDialogRef = useRef<HTMLDialogElement>(null)

  // close desktop dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (desktopRef.current && !desktopRef.current.contains(e.target as Node)) {
        setDesktopOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const activeHealth = healths.get(activeNode.id)
  const statusColor =
    !ready
      ? "bg-warning"
      : activeHealth?.status === "online"
        ? "bg-success"
        : activeHealth?.status === "slow"
          ? "bg-warning"
          : "bg-error"

  const statusLabel = !ready
    ? t.rpc.checking
    : autoMode
      ? `${t.rpc.auto} - ${activeNode.name}`
      : activeNode.name

  const latencyLabel =
    ready && activeHealth && activeHealth.latency > 0
      ? `${activeHealth.latency}ms`
      : ""

  const openMobileModal = useCallback(() => {
    mobileDialogRef.current?.showModal()
  }, [])

  const closeMobileModal = useCallback(() => {
    mobileDialogRef.current?.close()
  }, [])

  return (
    <>
      <div className="relative" ref={desktopRef}>
        {/* trigger button */}
        <button
          className="btn btn-ghost btn-xs sm:btn-sm gap-1 sm:gap-1.5 text-xs"
          onClick={() => {
            // mobile: open dialog; desktop: toggle dropdown
            if (window.innerWidth < 640) {
              openMobileModal()
            } else {
              setDesktopOpen(!desktopOpen)
            }
          }}
        >
          <span
            className={`inline-block w-2 h-2 rounded-full shrink-0 ${statusColor} ${
              !ready ? "animate-pulse" : ""
            }`}
          />
          <span className="hidden sm:inline max-w-[120px] md:max-w-[140px] truncate">
            {statusLabel}
          </span>
          {latencyLabel && (
            <span className="text-base-content/40 tabular-nums hidden md:inline">
              {latencyLabel}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
        </button>

        {/* Desktop: absolute dropdown */}
        {desktopOpen && (
          <div className="hidden sm:block absolute right-0 top-full mt-2 z-[60] w-72 bg-base-300 border border-base-content/10 rounded-box shadow-xl p-3">
            <NodeListContent onDone={() => setDesktopOpen(false)} />
          </div>
        )}
      </div>

      {/* Mobile: DaisyUI dialog modal (portal-based, escapes sticky parent) */}
      <dialog
        ref={mobileDialogRef}
        className="modal modal-bottom sm:hidden"
      >
        <div className="modal-box bg-base-300 border-t border-base-content/10 rounded-t-2xl pb-8 max-h-[80vh]">
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-base">RPC Node</span>
            <button
              className="btn btn-ghost btn-sm btn-circle"
              onClick={closeMobileModal}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <NodeListContent onDone={closeMobileModal} />
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="submit">close</button>
        </form>
      </dialog>
    </>
  )
}
