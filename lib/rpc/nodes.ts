export type ChainId = "eth-mainnet"

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

export const CHAINS: Record<ChainId, { name: string; hexId: string }> = {
  "eth-mainnet": { name: "Ethereum Mainnet", hexId: "0x1" },
}

export const DEFAULT_CHAIN: ChainId = "eth-mainnet"

/** Public Ethereum RPC endpoints – sorted roughly by reliability */
export const ETH_NODES: RpcNode[] = [
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

export function getNodesByChain(chain: ChainId): RpcNode[] {
  switch (chain) {
    case "eth-mainnet":
      return ETH_NODES
    default:
      return ETH_NODES
  }
}
