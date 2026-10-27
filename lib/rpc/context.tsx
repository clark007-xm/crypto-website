"use client"

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useMemo,
  useState,
} from "react"
import { JsonRpcProvider } from "ethers"
import type { ChainId, NodeHealth, RpcNode } from "./nodes"
import { useTestnetAccess } from "./use-testnet-access"
import { allowedRpcChain } from "./admin-access"
import { CHAINS, DEFAULT_CHAIN, getNodesByChain } from "./nodes"

/* ── constants ── */
const PING_TIMEOUT = 5_000
const SLOW_THRESHOLD = 800

/* ── ping using fetch (lightweight, no ethers overhead) ── */
async function pingNode(node: RpcNode): Promise<NodeHealth> {
  const start = performance.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT)

  try {
    const res = await fetch(node.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: [],
        id: 1,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) throw new Error("HTTP error")
    const json = await res.json()
    if (json.error) throw new Error(json.error.message)

    const latency = Math.round(performance.now() - start)
    const blockNumber = parseInt(json.result, 16)

    return {
      id: node.id,
      latency,
      blockNumber,
      status: latency > SLOW_THRESHOLD ? "slow" : "online",
      lastChecked: Date.now(),
    }
  } catch {
    clearTimeout(timeoutId)
    return {
      id: node.id,
      latency: -1,
      blockNumber: 0,
      status: "offline",
      lastChecked: Date.now(),
    }
  }
}

function pickBestNode(
  nodes: RpcNode[],
  healths: Map<string, NodeHealth>
): RpcNode {
  let best: RpcNode = nodes[0]
  let bestLatency = Infinity

  for (const node of nodes) {
    const h = healths.get(node.id)
    if (h && h.status !== "offline" && h.latency < bestLatency) {
      bestLatency = h.latency
      best = node
    }
  }
  return best
}

/* ── context types ── */
interface RpcContextValue {
  chain: ChainId
  availableChains: ChainId[]
  nodes: RpcNode[]
  healths: Map<string, NodeHealth>
  activeNode: RpcNode
  autoMode: boolean
  ready: boolean
  /** An ethers JsonRpcProvider pointing at the currently active RPC node */
  readProvider: JsonRpcProvider | null
  setChain: (chain: ChainId) => void
  selectNode: (id: string) => void
  enableAuto: () => void
  refreshAll: () => void
  testnetAccess: { loading: boolean; error: boolean; refresh: () => void }
}

const RpcContext = createContext<RpcContextValue | null>(null)

/* ── provider component ── */
export function RpcProvider({ children }: { children: React.ReactNode }) {
  const testnetAccess = useTestnetAccess()
  const [requestedChain, setRequestedChain] = useState<ChainId>(DEFAULT_CHAIN)
  const chain = allowedRpcChain(requestedChain, testnetAccess.authorized)
  const nodes = useMemo(() => getNodesByChain(chain), [chain])
  const availableChains: ChainId[] = testnetAccess.authorized ? ["eth-mainnet", "sepolia"] : ["eth-mainnet"]
  const [selection, setSelection] = useState<{ chain: ChainId; node: RpcNode; auto: boolean } | null>(null)
  const [benchmark, setBenchmark] = useState<{ chain: ChainId; healths: Map<string, NodeHealth> } | null>(null)
  const activeNode = selection?.chain === chain ? selection.node : nodes[0]
  const autoMode = selection?.chain === chain ? selection.auto : true
  const ready = benchmark?.chain === chain
  const healths = useMemo(() => benchmark?.chain === chain ? benchmark.healths : new Map<string, NodeHealth>(), [benchmark, chain])
  const [providerState, setProviderState] = useState<{ key: string; provider: JsonRpcProvider } | null>(null)
  const providerKey = `${chain}:${activeNode.url}`
  const readProvider = providerState?.key === providerKey ? providerState.provider : null
  useEffect(() => {
    const provider = new JsonRpcProvider(activeNode.url, CHAINS[chain].numericId, {
      polling: false, staticNetwork: true, batchMaxCount: 1,
    })
    setProviderState({ key: providerKey, provider })
    return () => provider.destroy()
  }, [activeNode.url, chain, providerKey])

  // Old-chain or older benchmark results must never replace the current node.
  const current = useRef({ chain, activeNode, autoMode, authorized: testnetAccess.authorized })
  current.current = { chain, activeNode, autoMode, authorized: testnetAccess.authorized }
  const generation = useRef(0)
  const benchmarkAll = useCallback(async () => {
    const request = ++generation.current
    const results = await Promise.all(nodes.map(pingNode))
    if (request !== generation.current || current.current.chain !== chain) return
    const next = new Map(results.map(result => [result.id, result]))
    setBenchmark({ chain, healths: next })
    const state = current.current
    if (state.autoMode || next.get(state.activeNode.id)?.status === "offline") {
      setSelection({ chain, node: pickBestNode(nodes, next), auto: true })
    }
  }, [chain, nodes])
  useEffect(() => {
    void benchmarkAll()
    const visible = () => { if (document.visibilityState === "visible") void benchmarkAll() }
    document.addEventListener("visibilitychange", visible)
    return () => { generation.current++; document.removeEventListener("visibilitychange", visible) }
  }, [benchmarkAll])
  const setChain = useCallback((next: ChainId) => {
    if (next === "sepolia" && !current.current.authorized) return
    setRequestedChain(next)
  }, [])
  const selectNode = useCallback((id: string) => {
    const node = nodes.find(value => value.id === id)
    if (node) setSelection({ chain, node, auto: false })
  }, [chain, nodes])
  const enableAuto = useCallback(() => {
    setSelection({ chain, node: pickBestNode(nodes, healths), auto: true })
  }, [chain, nodes, healths])

  return (
    <RpcContext.Provider
      value={{
        chain,
        availableChains,
        nodes,
        healths,
        activeNode,
        autoMode,
        ready,
        readProvider,
        setChain,
        selectNode,
        enableAuto,
        refreshAll: benchmarkAll,
        testnetAccess,
      }}
    >
      {children}
    </RpcContext.Provider>
  )
}

/* ── hooks ── */
export function useRpc() {
  const ctx = useContext(RpcContext)
  if (!ctx) throw new Error("useRpc must be used within <RpcProvider>")
  return ctx
}
