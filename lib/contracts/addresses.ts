/**
 * Contract addresses per chain.
 */

export interface ContractAddresses {
  usdt: string
  /** CommitRevealFactory 主合约地址 */
  factory: string
  /** CommitRevealTreasury 资金管理合约 */
  treasury: string
  /** Factory 部署区块号，用于查询事件 */
  deployBlock: number
}

/** Addresses keyed by chainId (decimal) */
export const ADDRESSES: Record<number, ContractAddresses> = {
  // Ethereum Mainnet
  1: {
    usdt: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    factory: "0x0000000000000000000000000000000000000000", // TODO: deploy to mainnet
    treasury: "0x0000000000000000000000000000000000000000", // TODO: deploy to mainnet
    deployBlock: 0,
  },
  // Sepolia Testnet
  11155111: {
    usdt: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06", // Sepolia USDT mock
    factory: "0x0717DEB12839FE8D0DA8c6869E66d658ECc0b240",
    treasury: "0x2B6c0444B0D5102588a7C61d061D3b5658B1df05",
    deployBlock: 7800000, // Approximate deploy block on Sepolia
  },
}

/** Get addresses for a given chainId, fallback to mainnet */
export function getAddresses(chainId: number | null): ContractAddresses {
  if (chainId && ADDRESSES[chainId]) return ADDRESSES[chainId]
  return ADDRESSES[1]
}

/** Check if contracts are deployed on a chain */
export function hasDeployedContracts(chainId: number | null): boolean {
  if (!chainId) return false
  const addrs = ADDRESSES[chainId]
  if (!addrs) return false
  return addrs.factory !== "0x0000000000000000000000000000000000000000"
}
