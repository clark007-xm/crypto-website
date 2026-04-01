"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { Wallet, LogOut, Copy, ExternalLink, Check, RefreshCw, PlusCircle, AlertTriangle, Ticket } from "lucide-react"
import Link from "next/link"
import { useWallet } from "@/lib/wallet/context"
import { useT } from "@/lib/i18n/context"
import { useIsPartner, usePartnerDeposit } from "@/lib/contracts/hooks"
import { getExplorerAddressUrl } from "@/lib/contracts/addresses"
import { useRpc } from "@/lib/rpc/context"
import { CHAINS, getChainByNumericId } from "@/lib/rpc/nodes"
import { formatEther } from "ethers"

const ConnectModal = dynamic(
  () => import("./connect-modal").then((mod) => mod.ConnectModal)
)

export function WalletButton() {
  const { status, shortAddress, address, balance, chainId, disconnect, switchChain } = useWallet()
  const { chain } = useRpc()
  const t = useT()
  const [modalOpen, setModalOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [switching, setSwitching] = useState(false)
  const { isPartner, loading: partnerLoading, checked: partnerChecked } = useIsPartner()
  const { balance: depositBalance, loading: depositLoading, refresh: refreshDeposit } = usePartnerDeposit()

  const selectedChainId = CHAINS[chain].numericId
  const connectedChain = getChainByNumericId(chainId)
  const chainName = connectedChain ? CHAINS[connectedChain].name : chainId ? `Chain ${chainId}` : ""
  const isWrongNetwork = chainId !== null && chainId !== selectedChainId

  const handleSwitchToSelectedChain = async () => {
    setSwitching(true)
    await switchChain(selectedChainId)
    setSwitching(false)
  }

  const handleCopy = async () => {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  /* Format deposit balance for display (ETH) */
  const formattedDeposit = depositBalance
    ? Number(formatEther(depositBalance)).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
    : "0.0000"

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
        {modalOpen && (
          <ConnectModal open={modalOpen} onClose={() => setModalOpen(false)} />
        )}
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
            <div className="flex items-center gap-2">
              <span className="text-xs text-base-content/40 font-medium">{t.wallet.connected}</span>
              {partnerLoading ? (
                <span className="loading loading-spinner loading-xs text-primary" />
              ) : partnerChecked && isPartner ? (
                <span className="badge badge-primary badge-xs">{t.wallet.partner}</span>
              ) : null}
            </div>
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

        {/* Wrong network warning */}
        {isWrongNetwork && (
          <div className="p-3 bg-warning/10 border-b border-warning/20">
            <div className="flex items-center gap-2 text-warning mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs font-semibold">{t.wallet.wrongNetwork}</span>
            </div>
            <button
              className={`btn btn-warning btn-xs btn-block ${switching ? "loading" : ""}`}
              onClick={handleSwitchToSelectedChain}
              disabled={switching}
            >
              {switching
                ? t.wallet.switching
                : t.wallet.switchToChain.replace("{chain}", CHAINS[chain].name)}
            </button>
          </div>
        )}

        {/* Balance section */}
        <div className="p-3 border-b border-base-content/5">
          {/* ETH Balance */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-base-content/40">{t.wallet.ethBalance}</span>
          </div>
          <p className="text-lg font-bold text-primary font-display mt-0.5">
            {balance ?? "0"}
            <span className="text-xs text-base-content/40 ml-1 font-normal">ETH</span>
          </p>
          
          {/* Partner Deposit (only for partners) */}
          {partnerChecked && isPartner && (
            <div className="mt-3 pt-3 border-t border-base-content/5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-base-content/40">{t.wallet.partnerDeposit}</span>
                <button
                  className="btn btn-ghost btn-xs btn-circle"
                  onClick={refreshDeposit}
                  disabled={depositLoading}
                >
                  <RefreshCw className={`h-3 w-3 ${depositLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
              <p className="text-sm font-semibold text-secondary font-display mt-0.5">
                {depositLoading ? "..." : formattedDeposit}
                <span className="text-xs text-base-content/40 ml-1 font-normal">ETH</span>
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-2">
          {/* Partner-only: Create Table */}
          {partnerChecked && isPartner && (
            <Link
              href="/create"
              className="btn btn-primary btn-sm justify-start w-full gap-3 font-normal mb-1"
            >
              <PlusCircle className="h-4 w-4" />
              {t.wallet.createTable}
            </Link>
          )}
          <Link
            href="/records"
            className="btn btn-ghost btn-sm justify-start w-full gap-3 font-normal"
          >
            <Ticket className="h-4 w-4" />
            {t.footer.myBets}
          </Link>
          <button
            className="btn btn-ghost btn-sm justify-start w-full gap-3 font-normal"
            onClick={handleCopy}
          >
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            {copied ? t.wallet.copied : t.wallet.copyAddress}
          </button>
          <a
            className="btn btn-ghost btn-sm justify-start w-full gap-3 font-normal"
            href={address ? getExplorerAddressUrl(chainId, address) : "#"}
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
