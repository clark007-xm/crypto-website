/**
 * Contract addresses per chain.
 */

import { PUBLIC_CHAIN_CONFIGS } from "@/lib/config/public-env"

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
export const ADDRESSES: Record<number, ContractAddresses> = PUBLIC_CHAIN_CONFIGS

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

const EXPLORER_BASE_URLS: Record<number, string> = {
  1: "https://etherscan.io",
  11155111: "https://sepolia.etherscan.io",
}

export function getExplorerBaseUrl(chainId: number | null): string {
  if (chainId && EXPLORER_BASE_URLS[chainId]) {
    return EXPLORER_BASE_URLS[chainId]
  }
  return EXPLORER_BASE_URLS[1]
}

export function getExplorerAddressUrl(chainId: number | null, address: string): string {
  return `${getExplorerBaseUrl(chainId)}/address/${address}`
}
