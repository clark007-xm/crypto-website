/**
 * Contract addresses per chain.
 * TODO: Replace placeholder Loot addresses with real deployed contract addresses.
 */

export interface ContractAddresses {
  usdt: string
  loot: string
}

/** Addresses keyed by chainId (decimal) */
export const ADDRESSES: Record<number, ContractAddresses> = {
  // Ethereum Mainnet
  1: {
    usdt: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    loot: "0x0000000000000000000000000000000000000000", // TODO: deploy
  },
  // Sepolia testnet
  11155111: {
    usdt: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06", // common Sepolia USDT mock
    loot: "0x0000000000000000000000000000000000000000", // TODO: deploy
  },
  // BSC Mainnet
  56: {
    usdt: "0x55d398326f99059fF775485246999027B3197955", // BSC-USD (USDT on BSC)
    loot: "0x0000000000000000000000000000000000000000", // TODO: deploy
  },
}

/** Get addresses for a given chainId, fallback to mainnet */
export function getAddresses(chainId: number | null): ContractAddresses {
  if (chainId && ADDRESSES[chainId]) return ADDRESSES[chainId]
  return ADDRESSES[1]
}
