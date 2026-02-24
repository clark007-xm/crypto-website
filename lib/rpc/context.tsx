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
import { DEFAULT_CHAIN, getNodesByChain } from "./nodes"

/* ── constants ── */
const HEALTH_INTERVAL = 30_000
const PING_TIMEOUT = 5_000
const SLOW_THRESHOLD = 800

/* ── ping using ethers JsonRpcProvider ── */
async function pingNode(node: RpcNode): Promise<NodeHealth> {
  const start = performance.now()
  try {
    const provider = new JsonRpcProvider(node.url, undefined, {
      staticNetwork: true,
    })

    // set a timeout via AbortController-like pattern
    const blockPromise = provider.getBlockNumber()
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), PING_TIMEOUT)
    )

    const blockNumber = await Promise.race([blockPromise, timeoutPromise])
    const latency = Math.round(performance.now() - start)

    provider.destroy()

    return {
      id: node.id,
      latency,
      blockNumber: blockNumber as number,
      status: latency > SLOW_THRESHOLD ? "slow" : "online",
      lastChecked: Date.now(),
    }
  } catch {
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
  nodes: RpcNode[]
  healths: Map<string, NodeHealth>
  activeNode: RpcNode
  autoMode: boolean
  ready: boolean
  /** An ethers JsonRpcProvider pointing at the currently active RPC node */
  readProvider: JsonRpcProvider | null
  selectNode: (id: string) => void
  enableAuto: () => void
  refreshAll: () => void
}

const RpcContext = createContext<RpcContextValue | null>(null)

/* ── provider component ── */
export function RpcProvider({ children }: { children: React.ReactNode }) {
  const chain: ChainId = DEFAULT_CHAIN
  const nodes = getNodesByChain(chain)

  const [healths, setHealths] = useState<Map<string, NodeHealth>>(new Map())
  const [activeNode, setActiveNode] = useState<RpcNode>(nodes[0])
  const [autoMode, setAutoMode] = useState(true)
  const [ready, setReady] = useState(false)
  const [readProvider, setReadProvider] = useState<JsonRpcProvider | null>(null)

  const autoRef = useRef(autoMode)
  autoRef.current = autoMode

  /* ── update read provider when active node changes ── */
  useEffect(() => {
    const p = new JsonRpcProvider(activeNode.url, undefined, {
      staticNetwork: true,
    })
    setReadProvider(p)
    return () => {
      p.destroy()
    }
  }, [activeNode])

  /* ── benchmark all ── */
  const benchmarkAll = useCallback(async () => {
    const results = await Promise.all(nodes.map(pingNode))
    const next = new Map<string, NodeHealth>()
    for (const r of results) next.set(r.id, r)
    setHealths(next)

    if (autoRef.current) {
      const best = pickBestNode(nodes, next)
      setActiveNode(best)
    } else {
      const currentHealth = next.get(activeNode.id)
      if (!currentHealth || currentHealth.status === "offline") {
        const best = pickBestNode(nodes, next)
        setActiveNode(best)
        setAutoMode(true)
      }
    }
    setReady(true)
  }, [nodes, activeNode.id])

  useEffect(() => {
    benchmarkAll()
    const interval = setInterval(benchmarkAll, HEALTH_INTERVAL)
    return () => clearInterval(interval)
  }, [benchmarkAll])

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
        nodes,
        healths,
        activeNode,
        autoMode,
        ready,
        readProvider,
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
