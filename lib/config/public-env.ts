const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

export type ConfiguredChainId = "eth-mainnet" | "sepolia"

export interface PublicChainConfig {
  usdt: string
  factory: string
  treasury: string
  deployBlock: number
}

const DEFAULT_CHAIN_CONFIGS: Record<number, PublicChainConfig> = {
  1: {
    usdt: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    factory: ZERO_ADDRESS,
    treasury: ZERO_ADDRESS,
    deployBlock: 0,
  },
  11155111: {
    usdt: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06",
    factory: "0x0717DEB12839FE8D0DA8c6869E66d658ECc0b240",
    treasury: "0x2B6c0444B0D5102588a7C61d061D3b5658B1df05",
    deployBlock: 7800000,
  },
}

const CHAIN_NUMERIC_IDS: Record<ConfiguredChainId, number> = {
  "eth-mainnet": 1,
  sepolia: 11155111,
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function parseAddress(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  const normalized = value.trim()
  return /^0x[a-fA-F0-9]{40}$/.test(normalized) ? normalized : fallback
}

function parseChain(value: string | undefined): ConfiguredChainId | null {
  if (!value) return null
  if (value === "eth-mainnet" || value === "sepolia") {
    return value
  }
  return null
}

const defaultEnableTestnet = process.env.NODE_ENV === "development"

export const ENABLE_TESTNET = parseBoolean(
  process.env.NEXT_PUBLIC_ENABLE_TESTNET,
  defaultEnableTestnet
)

const configuredDefaultChain = parseChain(process.env.NEXT_PUBLIC_DEFAULT_CHAIN)
const fallbackDefaultChain: ConfiguredChainId = ENABLE_TESTNET ? "sepolia" : "eth-mainnet"

export const DEFAULT_PUBLIC_CHAIN: ConfiguredChainId =
  configuredDefaultChain === "sepolia" && !ENABLE_TESTNET
    ? "eth-mainnet"
    : configuredDefaultChain ?? fallbackDefaultChain

export const PUBLIC_CHAIN_CONFIGS: Record<number, PublicChainConfig> = {
  1: {
    usdt: parseAddress(
      process.env.NEXT_PUBLIC_ETH_MAINNET_USDT,
      DEFAULT_CHAIN_CONFIGS[1].usdt
    ),
    factory: parseAddress(
      process.env.NEXT_PUBLIC_ETH_MAINNET_FACTORY,
      DEFAULT_CHAIN_CONFIGS[1].factory
    ),
    treasury: parseAddress(
      process.env.NEXT_PUBLIC_ETH_MAINNET_TREASURY,
      DEFAULT_CHAIN_CONFIGS[1].treasury
    ),
    deployBlock: parseNumber(
      process.env.NEXT_PUBLIC_ETH_MAINNET_DEPLOY_BLOCK,
      DEFAULT_CHAIN_CONFIGS[1].deployBlock
    ),
  },
  11155111: {
    usdt: parseAddress(
      process.env.NEXT_PUBLIC_SEPOLIA_USDT,
      DEFAULT_CHAIN_CONFIGS[11155111].usdt
    ),
    factory: parseAddress(
      process.env.NEXT_PUBLIC_SEPOLIA_FACTORY,
      DEFAULT_CHAIN_CONFIGS[11155111].factory
    ),
    treasury: parseAddress(
      process.env.NEXT_PUBLIC_SEPOLIA_TREASURY,
      DEFAULT_CHAIN_CONFIGS[11155111].treasury
    ),
    deployBlock: parseNumber(
      process.env.NEXT_PUBLIC_SEPOLIA_DEPLOY_BLOCK,
      DEFAULT_CHAIN_CONFIGS[11155111].deployBlock
    ),
  },
}

export function getNumericChainId(chain: ConfiguredChainId): number {
  return CHAIN_NUMERIC_IDS[chain]
}
