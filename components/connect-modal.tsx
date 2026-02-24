"use client"

import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { useWallet } from "@/lib/wallet/context"
import { useT } from "@/lib/i18n/context"

interface ConnectModalProps {
  open: boolean
  onClose: () => void
}

/* SVG icons inline to avoid external deps */
function MetaMaskIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M25.2 2L15.7 9.1L17.4 4.8L25.2 2Z" fill="#E2761B" stroke="#E2761B" strokeWidth="0.25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2.8 2L12.2 9.2L10.6 4.8L2.8 2Z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21.8 19.2L19.2 23.2L24.6 24.7L26.2 19.3L21.8 19.2Z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M1.8 19.3L3.4 24.7L8.8 23.2L6.2 19.2L1.8 19.3Z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8.5 12.3L7 14.6L12.3 14.8L12.1 9L8.5 12.3Z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19.5 12.3L15.8 8.9L15.7 14.8L21 14.6L19.5 12.3Z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8.8 23.2L12 21.6L9.2 19.3L8.8 23.2Z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 21.6L19.2 23.2L18.8 19.3L16 21.6Z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.25" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function GenericWalletIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-base-content/60">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
    </svg>
  )
}

const WALLET_LIST = [
  {
    id: "metamask",
    name: "MetaMask",
    icon: MetaMaskIcon,
    check: (eth: unknown) => !!(eth as Record<string, unknown>)?.isMetaMask,
  },
  {
    id: "injected",
    name: "Browser Wallet",
    icon: GenericWalletIcon,
    check: (eth: unknown) => !!eth,
  },
]

export function ConnectModal({ open, onClose }: ConnectModalProps) {
  const { connect, status, hasProvider } = useWallet()
  const t = useT()
  const dialogRef = useRef<HTMLDialogElement>(null)

  /* ── Detect wallets client-side only to avoid hydration mismatch ── */
  const [detected, setDetected] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const eth = window.ethereum
    const result: Record<string, boolean> = {}
    for (const w of WALLET_LIST) {
      result[w.id] = w.check(eth)
    }
    setDetected(result)
  }, [open]) // re-check each time modal opens

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      dialog.showModal()
    } else {
      dialog.close()
    }
  }, [open])

  const handleConnect = async () => {
    await connect()
    onClose()
  }

  const isConnecting = status === "connecting"

  return (
    <dialog
      ref={dialogRef}
      className="modal modal-bottom sm:modal-middle"
      onClose={onClose}
    >
      <div className="modal-box bg-base-200 border border-base-content/10 max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-lg font-display">{t.wallet.connectTitle}</h3>
          <button
            className="btn btn-ghost btn-sm btn-circle"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Wallet list */}
        <div className="flex flex-col gap-3">
          {WALLET_LIST.map((w) => {
            const isDetected = !!detected[w.id]
            const Icon = w.icon
            return (
              <button
                key={w.id}
                className={`btn btn-ghost justify-start gap-4 h-auto py-4 px-4 border border-base-content/5 hover:border-primary/40 hover:bg-primary/5 transition-all ${
                  isConnecting ? "loading" : ""
                }`}
                onClick={handleConnect}
                disabled={isConnecting}
              >
                <div className="w-10 h-10 rounded-xl bg-base-300 flex items-center justify-center shrink-0">
                  <Icon />
                </div>
                <div className="flex flex-col items-start gap-0.5">
                  <span className="font-semibold text-sm">{w.name}</span>
                  {Object.keys(detected).length > 0 && (
                    <span className="text-xs text-base-content/40">
                      {isDetected ? t.wallet.detected : t.wallet.notDetected}
                    </span>
                  )}
                </div>
                {isDetected && (
                  <div className="ml-auto badge badge-success badge-xs" />
                )}
              </button>
            )
          })}
        </div>

        {/* Install hint -- only show after client detection ran */}
        {Object.keys(detected).length > 0 && !hasProvider && (
          <div className="mt-4 p-3 rounded-xl bg-warning/10 border border-warning/20">
            <p className="text-xs text-warning">
              {t.wallet.noWallet}{" "}
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="link link-warning font-semibold"
              >
                {t.wallet.installMetaMask}
              </a>
            </p>
          </div>
        )}

        {/* Footer tip */}
        <p className="text-xs text-base-content/30 mt-4 text-center">
          {t.wallet.footerTip}
        </p>
      </div>

      {/* Click outside to close */}
      <form method="dialog" className="modal-backdrop">
        <button type="submit" onClick={onClose}>close</button>
      </form>
    </dialog>
  )
}
