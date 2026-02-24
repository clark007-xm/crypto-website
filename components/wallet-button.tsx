"use client"

import { useState } from "react"
import { Wallet, LogOut, Copy, ExternalLink, Check, RefreshCw } from "lucide-react"
import { useWallet } from "@/lib/wallet/context"
import { useT } from "@/lib/i18n/context"
import { useUsdtBalance } from "@/lib/contracts/hooks"
import { ConnectModal } from "./connect-modal"

/* chain name map */
const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  5: "Goerli",
  11155111: "Sepolia",
  56: "BSC",
  97: "BSC Testnet",
  137: "Polygon",
  42161: "Arbitrum",
  10: "Optimism",
  8453: "Base",
}

export function WalletButton() {
  const { status, shortAddress, address, balance, chainId, disconnect } = useWallet()
  const t = useT()
  const [modalOpen, setModalOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const { balance: usdtBalance, loading: usdtLoading, refresh: refreshUsdt } = useUsdtBalance()

  const chainName = chainId ? CHAIN_NAMES[chainId] ?? `Chain ${chainId}` : ""

  const handleCopy = async () => {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  /* Format USDT balance for display */
  const formattedUsdt = usdtBalance
    ? Number(usdtBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00"

  /* ---- Disconnected state ---- */
  if (status !== "connected") {
    return (
      <>
        <button
          className={`btn btn-primary btn-sm gap-2 ${status === "connecting" ? "loading" : ""}`}
          onClick={() => setModalOpen(true)}
          disabled={status === "connecting"}
        >
          <Wallet className="h-4 w-4" />
          <span className="hidden sm:inline">
            {status === "connecting" ? t.wallet.connecting : t.nav.connectWallet}
          </span>
          <span className="sm:hidden">
            {status === "connecting" ? "..." : t.nav.connect}
          </span>
        </button>
        <ConnectModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    )
  }

  /* ---- Connected state: dropdown ---- */
  return (
    <div className="dropdown dropdown-end">
      <div
        tabIndex={0}
        role="button"
        className="btn btn-ghost btn-sm gap-2 border border-primary/20 hover:border-primary/40"
      >
        <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
        <span className="font-mono text-xs">{shortAddress}</span>
      </div>

      <div
        tabIndex={0}
        className="dropdown-content z-30 mt-2 w-[calc(100vw-1rem)] sm:w-72 right-0 rounded-2xl bg-base-200 border border-base-content/10 shadow-2xl p-0 overflow-hidden"
      >
        {/* Wallet header */}
        <div className="p-4 bg-base-300/50 border-b border-base-content/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-base-content/40 font-medium">{t.wallet.connected}</span>
            <span className="badge badge-ghost badge-xs gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              {chainName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="avatar placeholder">
              <div className="bg-primary/20 text-primary rounded-full w-9 h-9">
                <span className="text-xs font-bold">
                  {address ? address.slice(2, 4).toUpperCase() : ""}
                </span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-mono text-sm font-semibold truncate">{shortAddress}</p>
              <p className="text-xs text-base-content/40">{balance} ETH</p>
            </div>
          </div>
        </div>

        {/* Balance section */}
        <div className="p-3 border-b border-base-content/5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-base-content/40">{t.wallet.usdtBalance}</span>
            <button
              className="btn btn-ghost btn-xs btn-circle"
              onClick={refreshUsdt}
              disabled={usdtLoading}
            >
              <RefreshCw className={`h-3 w-3 ${usdtLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
          <p className="text-lg font-bold text-primary font-display mt-0.5">
            {usdtLoading ? "..." : formattedUsdt}
            <span className="text-xs text-base-content/40 ml-1 font-normal">USDT</span>
          </p>
        </div>

        {/* Actions */}
        <div className="p-2">
          <button
            className="btn btn-ghost btn-sm justify-start w-full gap-3 font-normal"
            onClick={handleCopy}
          >
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            {copied ? t.wallet.copied : t.wallet.copyAddress}
          </button>
          <a
            className="btn btn-ghost btn-sm justify-start w-full gap-3 font-normal"
            href={address ? `https://etherscan.io/address/${address}` : "#"}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-4 w-4" />
            {t.wallet.viewExplorer}
          </a>
          <div className="divider my-1 h-0" />
          <button
            className="btn btn-ghost btn-sm justify-start w-full gap-3 font-normal text-error hover:bg-error/10"
            onClick={disconnect}
          >
            <LogOut className="h-4 w-4" />
            {t.wallet.disconnect}
          </button>
        </div>
      </div>
    </div>
  )
}
