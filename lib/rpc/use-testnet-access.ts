"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useWallet } from "../wallet/context"
import { ENABLE_TESTNET, PUBLIC_CHAIN_CONFIGS } from "../config/public-env"
import { ChainReadClient } from "./read-client"
import { getNodesByChain } from "./nodes"
import { canAccessTestnet, readFactoryAdmin } from "./admin-access"

export function useTestnetAccess() {
  const { address, status, chainId } = useWallet()
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ key: string; admin: string | null; error: boolean }>({ key: "", admin: null, error: false })
  const key = `${status}:${address?.toLowerCase()}:${chainId}:${revision}`
  const client = useMemo(() => new ChainReadClient(11155111, getNodesByChain("sepolia").map(node => node.url)), [])
  const enabled = ENABLE_TESTNET && status === "connected" && Boolean(address)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    void readFactoryAdmin(client, PUBLIC_CHAIN_CONFIGS[11155111].factory, controller.signal).then(admin => {
      if (!controller.signal.aborted) setResult({ key, admin, error: false })
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key, admin: null, error: true })
    })
    return () => controller.abort()
  }, [client, enabled, key])
  const admin = result.key === key ? result.admin : null
  return { authorized: canAccessTestnet(ENABLE_TESTNET, status === "connected", address, admin),
    loading: enabled && result.key !== key, error: enabled && result.key === key && result.error,
    refresh: useCallback(() => setRevision(value => value + 1), []) }
}
