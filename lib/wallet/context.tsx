"use client"

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { BrowserProvider, formatEther } from "ethers"
import type { JsonRpcSigner, Eip1193Provider } from "ethers"

/* ── augment Window ── */
declare global {
  interface Window {
    ethereum?: Eip1193Provider & {
      isMetaMask?: boolean
      on: (event: string, handler: (...args: unknown[]) => void) => void
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void
    }
  }
}

/* ── context types ── */
export type WalletStatus = "disconnected" | "connecting" | "connected"

export interface WalletContextValue {
  status: WalletStatus
  address: string | null
  shortAddress: string | null
  balance: string | null
  chainId: number | null
  hasProvider: boolean
  /** ethers BrowserProvider (for read calls through user's wallet) */
  provider: BrowserProvider | null
  /** ethers JsonRpcSigner (for write/sign calls) */
  signer: JsonRpcSigner | null
  connect: () => Promise<void>
  disconnect: () => void
}

const WalletContext = createContext<WalletContextValue | null>(null)

/* ── helpers ── */
function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

/* ── provider component ── */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("disconnected")
  const [address, setAddress] = useState<string | null>(null)
  const [balance, setBalance] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [hasProvider, setHasProvider] = useState(false)
  const [provider, setProvider] = useState<BrowserProvider | null>(null)
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null)

  const providerRef = useRef<BrowserProvider | null>(null)

  /* ── detect injected provider on mount ── */
  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      setHasProvider(true)
    }
  }, [])

  /* ── populate state from connected wallet ── */
  const populateState = useCallback(async (ethProvider: BrowserProvider) => {
    try {
      const s = await ethProvider.getSigner()
      const addr = await s.getAddress()
      const [bal, network] = await Promise.all([
        ethProvider.getBalance(addr),
        ethProvider.getNetwork(),
      ])

      providerRef.current = ethProvider
      setProvider(ethProvider)
      setSigner(s)
      setAddress(addr)
      setBalance(formatEther(bal).slice(0, 8))
      setChainId(Number(network.chainId))
      setStatus("connected")
    } catch {
      setStatus("disconnected")
    }
  }, [])

  /* ── auto-reconnect ── */
  useEffect(() => {
    if (!window.ethereum) return
    const saved = localStorage.getItem("wallet_connected")
    if (saved !== "true") return

    const ethProvider = new BrowserProvider(window.ethereum)
    ethProvider
      .send("eth_accounts", [])
      .then((accounts: string[]) => {
        if (accounts.length > 0) {
          populateState(ethProvider)
        } else {
          localStorage.removeItem("wallet_connected")
        }
      })
      .catch(() => localStorage.removeItem("wallet_connected"))
  }, [populateState])

  /* ── event listeners ── */
  useEffect(() => {
    const eth = window.ethereum
    if (!eth) return

    const handleAccountsChanged = async (...args: unknown[]) => {
      const accounts = args[0] as string[]
      if (accounts.length === 0) {
        setStatus("disconnected")
        setAddress(null)
        setBalance(null)
        setChainId(null)
        setProvider(null)
        setSigner(null)
        providerRef.current = null
        localStorage.removeItem("wallet_connected")
      } else {
        const ethProvider = new BrowserProvider(eth)
        await populateState(ethProvider)
      }
    }

    const handleChainChanged = async () => {
      // chain changed -- rebuild provider to pick up new chain
      const ethProvider = new BrowserProvider(eth)
      if (providerRef.current) {
        await populateState(ethProvider)
      }
    }

    eth.on("accountsChanged", handleAccountsChanged)
    eth.on("chainChanged", handleChainChanged)

    return () => {
      eth.removeListener("accountsChanged", handleAccountsChanged)
      eth.removeListener("chainChanged", handleChainChanged)
    }
  }, [populateState])

  /* ── connect ── */
  const connect = useCallback(async () => {
    if (!window.ethereum) {
      window.open("https://metamask.io/download/", "_blank")
      return
    }

    setStatus("connecting")
    try {
      const ethProvider = new BrowserProvider(window.ethereum)
      await ethProvider.send("eth_requestAccounts", [])
      localStorage.setItem("wallet_connected", "true")
      await populateState(ethProvider)
    } catch {
      setStatus("disconnected")
    }
  }, [populateState])

  /* ── disconnect ── */
  const disconnect = useCallback(() => {
    setStatus("disconnected")
    setAddress(null)
    setBalance(null)
    setChainId(null)
    setProvider(null)
    setSigner(null)
    providerRef.current = null
    localStorage.removeItem("wallet_connected")
  }, [])

  const shortAddress = address ? shortenAddress(address) : null

  return (
    <WalletContext.Provider
      value={{
        status,
        address,
        shortAddress,
        balance,
        chainId,
        hasProvider,
        provider,
        signer,
        connect,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

/* ── hook ── */
export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error("useWallet must be used within <WalletProvider>")
  return ctx
}
