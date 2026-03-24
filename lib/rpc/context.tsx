"use client"

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { JsonRpcProvider } from "ethers"
import type { ChainId, NodeHealth, RpcNode } from "./nodes"
import { CHAINS, DEFAULT_CHAIN, getAvailableChains, getNodesByChain } from "./nodes"

/* ── constants ── */
const HEALTH_INTERVAL = 30_000
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
}

const RpcContext = createContext<RpcContextValue | null>(null)

/* ── provider component ── */
export function RpcProvider({ children }: { children: React.ReactNode }) {
  const [chain, setChainState] = useState<ChainId>(DEFAULT_CHAIN)
  const [nodes, setNodes] = useState<RpcNode[]>(() => getNodesByChain(DEFAULT_CHAIN))
  const [healths, setHealths] = useState<Map<string, NodeHealth>>(new Map())
  const [activeNode, setActiveNode] = useState<RpcNode>(() => getNodesByChain(DEFAULT_CHAIN)[0])
  const [autoMode, setAutoMode] = useState(true)
  const [ready, setReady] = useState(false)
  const [readProvider, setReadProvider] = useState<JsonRpcProvider | null>(null)

  const availableChains = getAvailableChains()

  const autoRef = useRef(autoMode)
  autoRef.current = autoMode
  const activeNodeRef = useRef(activeNode)
  activeNodeRef.current = activeNode
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  /* ── update read provider when active node changes ── */
  useEffect(() => {
    const p = new JsonRpcProvider(activeNode.url, undefined, {
      staticNetwork: true,
      batchMaxCount: 1, // Disable batching - DRPC free tier limits to 3 batch requests
    })
    setReadProvider(p)
    return () => {
      p.destroy()
    }
  }, [activeNode])

  /* ── benchmark all (stable ref) ── */
  const benchmarkAll = useCallback(async () => {
    const currentNodes = nodesRef.current
    const results = await Promise.all(currentNodes.map(pingNode))
    const next = new Map<string, NodeHealth>()
    for (const r of results) next.set(r.id, r)
    setHealths(next)

    if (autoRef.current) {
      const best = pickBestNode(currentNodes, next)
      setActiveNode(best)
    } else {
      const currentHealth = next.get(activeNodeRef.current.id)
      if (!currentHealth || currentHealth.status === "offline") {
        const best = pickBestNode(currentNodes, next)
        setActiveNode(best)
        setAutoMode(true)
      }
    }
    setReady(true)
  }, [])

  /* ── run benchmark on mount and when chain changes ── */
  const chainIdRef = useRef(chain)
  useEffect(() => {
    // Only re-run if chain actually changed (handled by setChain calling benchmarkAll)
    if (chainIdRef.current !== chain) {
      chainIdRef.current = chain
      benchmarkAll()
    }
  }, [chain, benchmarkAll])

  useEffect(() => {
    benchmarkAll()
    const interval = setInterval(benchmarkAll, HEALTH_INTERVAL)
    return () => clearInterval(interval)
  }, [benchmarkAll])

  /* ── chain switching ── */
  const chainRef = useRef(chain)
  chainRef.current = chain
  const benchmarkAllRef = useRef(benchmarkAll)
  benchmarkAllRef.current = benchmarkAll

  const setChain = useCallback((newChain: ChainId) => {
    if (newChain === chainRef.current) return
    setChainState(newChain)
    const newNodes = getNodesByChain(newChain)
    setNodes(newNodes)
    nodesRef.current = newNodes
    setActiveNode(newNodes[0])
    activeNodeRef.current = newNodes[0]
    setHealths(new Map())
    setReady(false)
    setAutoMode(true)
  }, [])

  /* ── actions ── */
  const selectNode = useCallback(
    (id: string) => {
      const node = nodes.find((n) => n.id === id)
      if (node) {
        setActiveNode(node)
        setAutoMode(false)
      }
    },
    [nodes]
  )

  const enableAuto = useCallback(() => {
    setAutoMode(true)
    const best = pickBestNode(nodes, healths)
    setActiveNode(best)
  }, [nodes, healths])

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
