"use client"

import {
  DEFAULT_PUBLIC_CHAIN,
  ENABLE_TESTNET,
  type ConfiguredChainId,
} from "@/lib/config/public-env"

export type ChainId = ConfiguredChainId

export interface RpcNode {
  id: string
  name: string
  url: string
  chainId: ChainId
  /** true = community / public endpoint */
  isPublic: boolean
}

export interface NodeHealth {
  id: string
  latency: number          // ms, -1 = unreachable
  blockNumber: number      // 0 = unreachable
  status: "online" | "slow" | "offline"
  lastChecked: number      // Date.now()
}

export const CHAINS: Record<ChainId, { name: string; hexId: string; numericId: number }> = {
  "eth-mainnet": { name: "Ethereum Mainnet", hexId: "0x1", numericId: 1 },
  "sepolia": { name: "Sepolia Testnet", hexId: "0xaa36a7", numericId: 11155111 },
}

/** Default chain based on public runtime config */
export const DEFAULT_CHAIN: ChainId = DEFAULT_PUBLIC_CHAIN

/** Check if a chain should be visible in the current environment */
export function isChainAvailable(chainId: ChainId): boolean {
  if (chainId === "sepolia") {
    return ENABLE_TESTNET
  }
  return true
}

/** Public Ethereum Mainnet RPC endpoints */
export const ETH_MAINNET_NODES: RpcNode[] = [
  {
    id: "cloudflare",
    name: "Cloudflare",
    url: "https://cloudflare-eth.com",
    chainId: "eth-mainnet",
    isPublic: true,
  },
  {
    id: "publicnode",
    name: "PublicNode",
    url: "https://ethereum-rpc.publicnode.com",
    chainId: "eth-mainnet",
    isPublic: true,
  },
  {
    id: "ankr",
    name: "Ankr",
    url: "https://rpc.ankr.com/eth",
    chainId: "eth-mainnet",
    isPublic: true,
  },
  {
    id: "llamarpc",
    name: "LlamaRPC",
    url: "https://eth.llamarpc.com",
    chainId: "eth-mainnet",
    isPublic: true,
  },
  {
    id: "drpc",
    name: "dRPC",
    url: "https://eth.drpc.org",
    chainId: "eth-mainnet",
    isPublic: true,
  },
  {
    id: "1rpc",
    name: "1RPC",
    url: "https://1rpc.io/eth",
    chainId: "eth-mainnet",
    isPublic: true,
  },
]

/** Sepolia Testnet RPC endpoints */
export const SEPOLIA_NODES: RpcNode[] = [
  {
    id: "sepolia-publicnode",
    name: "PublicNode",
    url: "https://ethereum-sepolia-rpc.publicnode.com",
    chainId: "sepolia",
    isPublic: true,
  },
  {
    id: "sepolia-drpc",
    name: "dRPC",
    url: "https://sepolia.drpc.org",
    chainId: "sepolia",
    isPublic: true,
  },
  {
    id: "sepolia-gateway",
    name: "Gateway.fm",
    url: "https://rpc.sepolia.org",
    chainId: "sepolia",
    isPublic: true,
  },
  {
    id: "sepolia-tenderly",
    name: "Tenderly",
    url: "https://sepolia.gateway.tenderly.co",
    chainId: "sepolia",
    isPublic: true,
  },
]

export function getNodesByChain(chain: ChainId): RpcNode[] {
  switch (chain) {
    case "eth-mainnet":
      return ETH_MAINNET_NODES
    case "sepolia":
      return SEPOLIA_NODES
    default:
      return ETH_MAINNET_NODES
  }
}

export function getChainByNumericId(chainId: number | null): ChainId | null {
  if (chainId === 1) return "eth-mainnet"
  if (chainId === 11155111) return "sepolia"
  return null
}

/** Get all available chains based on runtime config */
export function getAvailableChains(): ChainId[] {
  const chains: ChainId[] = ["eth-mainnet"]
  if (ENABLE_TESTNET) {
    chains.push("sepolia")
  }
  return chains
}
