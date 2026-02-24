/**
 * Minimal ABIs for contract interactions.
 * Only include the functions/events we actually use.
 */

/* ── ERC-20 (USDT) ── */
export const ERC20_ABI = [
  // Read
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  // Write
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
] as const

/* ── CryptoLoot main contract ── */
export const LOOT_ABI = [
  // Read
  "function currentRound() view returns (uint256)",
  "function getRoundInfo(uint256 roundId) view returns (uint256 totalSlots, uint256 filledSlots, uint256 prizeAmount, address prizeToken, address winner, bool drawn)",
  "function getUserTickets(uint256 roundId, address user) view returns (uint256)",
  "function ticketPrice() view returns (uint256)",
  // Write
  "function participate(uint256 roundId, uint256 ticketCount) external",
  // Events
  "event Participated(uint256 indexed roundId, address indexed user, uint256 ticketCount)",
  "event RoundDrawn(uint256 indexed roundId, address indexed winner, uint256 prizeAmount)",
  "event RoundCreated(uint256 indexed roundId, uint256 totalSlots, uint256 prizeAmount, address prizeToken)",
] as const
